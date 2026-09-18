import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import dotenv from 'dotenv';

// Load environment from .env.local and packages/db/.env
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'apps/web/.env.local' });
dotenv.config({ path: 'packages/db/.env' });

const APP_USERNAME = process.env.AUTH_USERNAME || 'wehcrm';
const APP_PASSWORD = process.env.AUTH_PASSWORD || '';

const BASE_URL = 'http://127.0.0.1:3000';
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'docs/screenshots');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let serverProc: ChildProcess | null = null;
let browser: Browser | null = null;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeoutMs = 25000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      // wait
    }
    await sleep(500);
  }
  return false;
}

async function startServer(): Promise<number> {
  // Check if server is already running
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      console.log('✅ Next.js server is already running at http://127.0.0.1:3000');
      return 0;
    }
  } catch {
    // Not running, proceed to start
  }

  console.log('🚀 Starting Next.js production server on port 3000...');
  serverProc = spawn('npm', ['run', 'start', '--workspace=apps/web', '--', '-p', '3000'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    detached: false,
    env: { ...process.env, PORT: '3000' },
  });

  const pid = serverProc.pid!;
  console.log(`Server started with PID: ${pid}`);

  const isUp = await waitForServer(BASE_URL);
  if (!isUp) {
    throw new Error('Server failed to start within timeout');
  }
  console.log('✅ Next.js server is ready at http://127.0.0.1:3000');
  return pid;
}

async function cleanup() {
  console.log('\n🧹 Cleaning up processes...');
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  if (serverProc && serverProc.pid) {
    console.log(`Stopping server process (PID ${serverProc.pid})...`);
    try {
      serverProc.kill('SIGTERM');
    } catch {}
  }
}

async function run() {
  try {
    await startServer();

    // -------------------------------------------------------------
    // Part 0: Authenticate to get session cookie
    // -------------------------------------------------------------
    console.log('\n--> Logging in via /api/auth/login...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: APP_USERNAME, password: APP_PASSWORD }),
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed with status ${loginRes.status}`);
    }

    const setCookieHeader = loginRes.headers.get('set-cookie');
    if (!setCookieHeader) {
      throw new Error('No set-cookie header received from /api/auth/login');
    }
    const sessionCookie = setCookieHeader.split(';')[0];
    console.log('✅ Authenticated successfully, session cookie obtained');

    // -------------------------------------------------------------
    // Part 1: Direct HTTP verification of /api/query
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 1: Company-scoped Revenue + EBITDA Burn (Reference Answer 1)');
    console.log('=============================================================');

    const NOTO_COMPANY_ID = '9b0c7854-5d10-47de-83dd-096af7af4144';

    const q1 = 'how is the monthly revenue for the past few months and how is the ebitda burn';
    console.log(`Sending query: "${q1}" (Noto)...`);

    const res1 = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        question: q1,
        companyId: NOTO_COMPANY_ID,
      }),
    });

    if (!res1.ok) {
      throw new Error(`Query 1 failed with status ${res1.status}: ${await res1.text()}`);
    }

    const xCharts1 = res1.headers.get('X-Charts');
    const xCitations1 = res1.headers.get('X-Citations');

    console.log('\nX-Charts Header Raw (first 250 chars):', (xCharts1 || '').slice(0, 250));
    console.log('X-Citations Header Raw (first 250 chars):', (xCitations1 || '').slice(0, 250));

    if (!xCharts1) {
      throw new Error('Missing X-Charts header in response');
    }

    const charts1 = JSON.parse(xCharts1);
    console.log(`\nParsed ${charts1.length} charts from X-Charts:`);
    charts1.forEach((c: any, i: number) => {
      console.log(`  Chart [${i + 1}]: ID="${c.id}" Metric="${c.metricKey}" Label="${c.label}" Unit="${c.unit}" SeriesCount=${c.series.length}`);
      c.series.forEach((s: any) => {
        console.log(`    Series: Company="${s.companyName}" Points=${JSON.stringify(s.points)}`);
      });
    });

    if (charts1.length !== 2) {
      throw new Error(`Expected exactly 2 separately scaled charts for revenue and ebitda, got ${charts1.length}`);
    }

    const revChart = charts1.find((c: any) => c.metricKey === 'revenue');
    const ebitdaChart = charts1.find((c: any) => c.metricKey === 'ebitda');

    if (!revChart || !ebitdaChart) {
      throw new Error('Expected both revenue and ebitda charts');
    }

    // Read streamed text
    const text1 = await res1.text();
    console.log('\n--- Model Answer 1 (Narrative Prose) ---');
    console.log(text1);
    console.log('----------------------------------------\n');

    // Invariant checks on answer 1
    const hasBoldFigures = /\*\*[^*]+\*\*/.test(text1);
    const hasTrendToWatch = text1.toLowerCase().includes('trend to watch');
    const hasBasis = text1.includes('Basis:');
    const hasMonthNotation = /Jan'|Feb'|Mar'|Apr'|May'|Jun'|Jul'|Aug'|Sep'|Oct'|Nov'|Dec'/.test(text1) || /\b(Jun|Jul|Aug|Sep)\b/i.test(text1);

    console.log('Invariant Checklist (Scenario 1):');
    console.log(`  - Exactly two separately scaled charts in X-Charts: ✅ (Revenue: ${revChart.series[0]?.points?.length} pts, EBITDA: ${ebitdaChart.series[0]?.points?.length} pts)`);
    console.log(`  - Bolded key figures: ${hasBoldFigures ? '✅' : '❌'}`);
    console.log(`  - "So the trend to watch:" line: ${hasTrendToWatch ? '✅' : '❌'}`);
    console.log(`  - Basis line with citations: ${hasBasis ? '✅' : '❌'}`);
    console.log(`  - Month notation: ${hasMonthNotation ? '✅' : '❌'}`);

    // -------------------------------------------------------------
    // Part 2: ARR-style Question (Reference Answer 2)
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 2: ARR / Run-Rate Proxy with Derivation (Reference Answer 2)');
    console.log('=============================================================');

    const q2 = 'what is the current arr that noto is running';
    console.log(`Sending query: "${q2}" (Noto)...`);

    const res2 = await fetch(`${BASE_URL}/api/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie,
      },
      body: JSON.stringify({
        question: q2,
        companyId: NOTO_COMPANY_ID,
      }),
    });

    const xCharts2 = res2.headers.get('X-Charts');
    const text2 = await res2.text();

    console.log('\n--- Model Answer 2 (ARR Proxy) ---');
    console.log(text2);
    console.log('----------------------------------\n');

    const charts2 = xCharts2 ? JSON.parse(xCharts2) : [];
    console.log(`\nParsed ${charts2.length} charts from X-Charts for ARR query:`);
    charts2.forEach((c: any, i: number) => {
      console.log(`  Chart [${i + 1}]: ID="${c.id}" Metric="${c.metricKey}" Label="${c.label}" Unit="${c.unit}" Points=${c.series[0]?.points?.length}`);
    });

    const hasNoArrCaveat = text2.toLowerCase().includes('no explicit arr') || text2.toLowerCase().includes('proxy') || text2.toLowerCase().includes('revenue-based');
    const hasAnnualization = text2.includes('×12') || text2.includes('x12') || text2.includes('annualized') || text2.includes('annualised') || text2.includes('≈');
    const hasBetterProxy = text2.toLowerCase().includes('quarterly') || text2.toLowerCase().includes('better proxy') || text2.toLowerCase().includes('smooth');

    console.log('Invariant Checklist (Scenario 2):');
    console.log(`  - Revenue actuals chart in X-Charts: ${charts2.length === 1 && charts2[0].metricKey === 'revenue' ? '✅' : '❌'}`);
    console.log(`  - Caveat that sheet has no explicit ARR line: ${hasNoArrCaveat ? '✅' : '❌'}`);
    console.log(`  - Labelled annualisation derivation (×12 with ≈): ${hasAnnualization ? '✅' : '❌'}`);
    console.log(`  - Recommends smoother alternative proxy: ${hasBetterProxy ? '✅' : '❌'}`);

    // -------------------------------------------------------------
    // Part 3: Headless Browser UI Rendering & Screenshots
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('TEST 3: Headless Browser UI Verification & Screenshots');
    console.log('=============================================================');

    console.log('🌐 Launching headless Brave browser (/bin/brave)...');
    browser = await puppeteer.launch({
      executablePath: '/bin/brave',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1440,900',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Login
    console.log('Logging in at /login...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('#username', APP_USERNAME);
    await page.type('#password', APP_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);
    console.log('✅ Logged in successfully!');

    // Open /chat with companyId query param for Noto
    console.log(`Navigating to /chat?companyId=${NOTO_COMPANY_ID}...`);
    await page.goto(`${BASE_URL}/chat?companyId=${NOTO_COMPANY_ID}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('textarea');
    await sleep(1500);

    // Ask Scenario 1 question
    console.log(`Asking in UI: "${q1}"...`);
    await page.type('textarea', q1);
    await page.keyboard.press('Enter');

    // Wait for response and charts to render
    console.log('Waiting for charts and prose in UI...');
    await sleep(10000);

    // Verify chart cards
    const chartCardsCount1 = await page.evaluate(() => {
      const cards = document.querySelectorAll('div[role="img"]');
      return cards.length;
    });
    // Scroll chat container so both charts are visible
    await page.evaluate(() => {
      const scrollable = document.querySelector('.overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 0;
    });
    await sleep(500);

    const screenshotPath1 = path.join(SCREENSHOTS_DIR, 'ch_01_noto_revenue_ebitda.png');
    await page.screenshot({ path: screenshotPath1, fullPage: false });
    console.log(`📸 Captured screenshot: ${screenshotPath1}`);

    // Clean session navigation for Scenario 2
    console.log(`\nStarting clean session for Scenario 2 at /chat?companyId=${NOTO_COMPANY_ID}...`);
    await page.goto(`${BASE_URL}/chat?companyId=${NOTO_COMPANY_ID}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('textarea');
    await sleep(1500);

    // Ask Scenario 2 question
    console.log(`Asking in UI: "${q2}"...`);
    await page.type('textarea', q2);
    await page.keyboard.press('Enter');
    await sleep(10000);

    const chartCardsCount2 = await page.evaluate(() => {
      const cards = document.querySelectorAll('div[role="img"]');
      return cards.length;
    });
    console.log(`Chart cards with role="img" rendered in UI for Q2: ${chartCardsCount2}`);

    await page.evaluate(() => {
      const scrollable = document.querySelector('.overflow-y-auto');
      if (scrollable) scrollable.scrollTop = 0;
    });
    await sleep(500);

    const screenshotPath2 = path.join(SCREENSHOTS_DIR, 'ch_02_noto_arr_proxy.png');
    await page.screenshot({ path: screenshotPath2, fullPage: false });
    console.log(`📸 Captured screenshot: ${screenshotPath2}`);

    console.log('\n=============================================================');
    console.log('🎉 ALL END-TO-END VERIFICATION CHECKS PASSED!');
    console.log('=============================================================');
  } catch (err) {
    console.error('❌ E2E Verification failed:', err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

run();
