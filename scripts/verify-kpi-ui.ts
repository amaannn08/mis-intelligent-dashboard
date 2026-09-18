import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import puppeteer, { Browser } from 'puppeteer-core';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'apps/web/.env.local' });
dotenv.config({ path: 'packages/db/.env' });

const APP_USERNAME = process.env.MIS_AUTH_USERNAME || process.env.AUTH_USERNAME || 'wehcrm';
const APP_PASSWORD = process.env.MIS_AUTH_PASSWORD || process.env.AUTH_PASSWORD || '';
const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:3000';
const REVIEW_DIR = path.resolve(process.cwd(), 'docs/review');
fs.mkdirSync(REVIEW_DIR, { recursive: true });

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
      // server starting
    }
    await sleep(500);
  }
  return false;
}

async function startServer(): Promise<number> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    if (res.ok) {
      console.log('✅ Server already running at ' + BASE_URL);
      return 0;
    }
  } catch {}

  console.log('🚀 Starting Next.js production server on port 3000...');
  serverProc = spawn('npm', ['run', 'start', '--workspace=apps/web', '--', '-p', '3000'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    detached: false,
    env: { ...process.env, PORT: '3000' },
  });

  const isUp = await waitForServer(BASE_URL);
  if (!isUp) {
    throw new Error('Server failed to start within timeout.');
  }
  console.log('✅ Server ready at ' + BASE_URL);
  return serverProc.pid!;
}

async function cleanup() {
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  if (serverProc && serverProc.pid) {
    try {
      serverProc.kill('SIGTERM');
    } catch {}
  }
}

async function run() {
  try {
    await startServer();

    console.log('🔑 Authenticating via /api/auth/login...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: APP_USERNAME, password: APP_PASSWORD }),
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed with status ${loginRes.status}`);
    }

    const setCookieHeader = loginRes.headers.get('set-cookie');
    const sessionCookie = setCookieHeader ? setCookieHeader.split(';')[0] : '';

    console.log('🌐 Launching headless browser...');
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

    if (sessionCookie) {
      const [name, ...rest] = sessionCookie.split('=');
      const val = rest.join('=');
      await page.setCookie({
        name,
        value: val,
        domain: '127.0.0.1',
        path: '/',
      });
    }

    console.log('📄 Navigating to dashboard overview (/)...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    const kpiCards = await page.evaluate(() => {
      // Find the KPI grid container
      const cards = Array.from(document.querySelectorAll('.grid.grid-cols-2.sm\\:grid-cols-3.lg\\:grid-cols-5 > div'));
      return cards.map((card) => {
        const text = card.textContent || '';
        const hasDeltaChip = Boolean(card.querySelector('[data-testid="kpi-delta"]'));
        const hasNoPriorPeriod = Boolean(card.querySelector('[data-testid="kpi-no-prior-period"]'));
        const hasNoBaseline = text.includes('No baseline');
        return {
          text: text.replace(/\s+/g, ' ').trim(),
          hasDeltaChip,
          hasNoPriorPeriod,
          hasNoBaseline,
        };
      });
    });

    console.log(`Found ${kpiCards.length} KPI cards on overview:`);
    for (let i = 0; i < kpiCards.length; i++) {
      const c = kpiCards[i];
      console.log(`  [${i + 1}] "${c.text}" (hasDelta: ${c.hasDeltaChip}, hasNoPriorPeriod: ${c.hasNoPriorPeriod}, hasNoBaseline: ${c.hasNoBaseline})`);
      if (c.hasNoBaseline) {
        throw new Error(`Card ${i + 1} still contains "No baseline" text!`);
      }
      if (i < 4 && (c.hasDeltaChip || c.hasNoPriorPeriod)) {
        throw new Error(`Non-metric card ${i + 1} (${c.text}) unexpectedly has delta/baseline chip!`);
      }
    }

    const screenshotPath = path.join(REVIEW_DIR, 'kpi_cards_polished.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`📸 Screenshot saved to: ${screenshotPath}`);

    console.log('✅ UI verification passed successfully!');
  } finally {
    await cleanup();
  }
}

run().catch(async (err) => {
  console.error('❌ Verification failed:', err);
  await cleanup();
  process.exit(1);
});
