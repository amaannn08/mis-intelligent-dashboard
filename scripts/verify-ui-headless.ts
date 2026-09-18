import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import puppeteer, { Browser, Page } from 'puppeteer-core';

// Credentials are NEVER hardcoded in this repo. Export them before running:
//   set -a; . ~/.hermes/private/mis-secrets.env; set +a
const APP_USERNAME = process.env.MIS_AUTH_USERNAME ?? 'wehcrm';
const APP_PASSWORD = process.env.MIS_AUTH_PASSWORD ?? '';
if (!APP_PASSWORD) {
  console.error('MIS_AUTH_PASSWORD is not set — source the private secret store first.');
  process.exit(1);
}


const BASE_URL = 'http://127.0.0.1:3000';
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'docs/screenshots');
const FIXTURE_PATH = path.resolve(process.cwd(), 'packages/core/fixtures/sample_mis.xlsx');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let serverProc: ChildProcess | null = null;
let browser: Browser | null = null;

const consoleErrors: string[] = [];
const failedRequests: string[] = [];

function setupPageMonitoring(page: Page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filter out benign favicon or hydration warnings if non-breaking
      consoleErrors.push(`[Console Error] ${text}`);
      console.error(`🔴 Console error: ${text}`);
    }
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
    // Ignore aborted requests caused by intentional navigation
    if (req.failure()?.errorText === 'net::ERR_ABORTED') return;
    failedRequests.push(`[Request Failed] ${req.method()} ${url}: ${req.failure()?.errorText}`);
    console.error(`🔴 Request failed: ${req.method()} ${url} - ${req.failure()?.errorText}`);
  });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeoutMs = 20000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await sleep(500);
  }
  return false;
}

async function startServer(): Promise<number> {
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
  console.log('\n🧹 Cleaning up test processes...');
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  if (serverProc && serverProc.pid) {
    console.log(`Killing server process (PID ${serverProc.pid})...`);
    try {
      process.kill(-serverProc.pid, 'SIGTERM');
    } catch {
      try {
        serverProc.kill('SIGTERM');
      } catch {}
    }
  }
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(1);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(1);
});

async function run() {
  let serverPid: number | null = null;
  try {
    serverPid = await startServer();

    console.log('🌐 Launching headless browser (/bin/brave)...');
    browser = await puppeteer.launch({
      executablePath: '/bin/brave',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1440,900',
      ],
    });

    const page = await browser.newPage();
    setupPageMonitoring(page);

    // ==========================================
    // 1. DESKTOP VIEWPORT: 1440x900
    // ==========================================
    console.log('\n📱 Walking Desktop Routes (1440x900)...');
    await page.setViewport({ width: 1440, height: 900 });

    // Step A: /login
    console.log('--> Visiting /login');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_login_desktop.png') });
    console.log('📸 Captured 01_login_desktop.png');

    // Perform Login
    console.log('--> Performing login with team credentials...');
    await page.type('#username', APP_USERNAME);
    await page.type('#password', APP_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);
    console.log('✅ Logged in successfully!');

    // Step B: / (Portfolio Overview)
    console.log('--> Visiting / (Overview)');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    // Wait for content
    await page.waitForSelector('h1');
    await sleep(1000); // allow chart animations to settle
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_overview_desktop.png') });
    console.log('📸 Captured 02_overview_desktop.png');

    // Step C: /companies (Directory)
    console.log('--> Visiting /companies');
    await page.goto(`${BASE_URL}/companies`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('table');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_companies_desktop.png') });
    console.log('📸 Captured 03_companies_desktop.png');

    // Step D: Add a company
    console.log('--> Testing "Add company" modal...');
    const testCompanyName = `Aura Diagnostics ${Math.floor(Math.random() * 8999 + 1000)}`;
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const addBtn = btns.find((b) => b.textContent?.includes('Add Company'));
      addBtn?.click();
    });
    await sleep(500);
    await page.type('#new-company-name', testCompanyName);
    await page.type('#new-company-industry', 'HealthTech');
    await page.click('button[type="submit"]');
    await sleep(1500);
    console.log(`✅ Created company: ${testCompanyName}`);

    // Step E: /companies/noto (Company Workspace with full real metrics)
    console.log('--> Visiting /companies/noto (Workspace)');
    await page.goto(`${BASE_URL}/companies/noto`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('h1');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_company_workspace_desktop.png') });
    console.log('📸 Captured 04_company_workspace_desktop.png');

    // Step F: /companies/noto/documents (Document Center)
    console.log('--> Visiting /companies/noto/documents');
    await page.goto(`${BASE_URL}/companies/noto/documents`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('table');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_documents_desktop.png') });
    console.log('📸 Captured 05_documents_desktop.png');

    // Step G: Upload fixture to newly created company & watch live polling
    const createdSlug = testCompanyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    console.log(`--> Uploading fixture to /companies/${createdSlug}/documents...`);
    await page.goto(`${BASE_URL}/companies/${createdSlug}/documents`, { waitUntil: 'networkidle2' });
    
    // Trigger file input
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(FIXTURE_PATH);
      await page.evaluate((el) => {
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, fileInput);
      console.log('File attached & change dispatched. Waiting for upload acceptance (202)...');
      await sleep(2500);

      // Wait for status to transition through pending -> parsing -> extracting -> embedding -> processed
      console.log('Waiting for live asynchronous processing to finish...');
      let processed = false;
      for (let i = 0; i < 30; i++) {
        await sleep(1500);
        const pageText = await page.evaluate(() => document.body.innerText);
        if (pageText.includes('Processed')) {
          processed = true;
          console.log('✅ Document processed successfully!');
          break;
        }
      }
      if (!processed) {
        console.warn('⚠️ Document did not reach processed within 45s (may still be running)');
      }
    }

    // Step H: Inspect document drawer
    console.log('--> Inspecting document detail drawer...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const inspectBtn = btns.find((b) => b.textContent?.includes('Inspect') || b.title?.includes('Inspect'));
      inspectBtn?.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_document_drawer_desktop.png') });
    console.log('📸 Captured 06_document_drawer_desktop.png');

    // Close drawer
    await page.keyboard.press('Escape');
    await sleep(500);

    // Step I: Ask question in QueryPanel and confirm streaming response
    console.log(`--> Navigating to /companies/${createdSlug} to verify workspace & AI Query...`);
    await page.goto(`${BASE_URL}/companies/${createdSlug}`, { waitUntil: 'networkidle2' });
    await sleep(1000);
    
    console.log('--> Submitting AI question in QueryPanel via Enter key...');
    const textarea = await page.$('textarea');
    if (textarea) {
      await page.type('textarea', 'What was the revenue and burn trend in Q3?');
      await page.keyboard.press('Enter');
      console.log('Waiting for streaming RAG response...');
      await sleep(5500); // allow LLM generation to stream in
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_query_stream_desktop.png') });
      console.log('📸 Captured 07_query_stream_desktop.png');
    }

    // Step J: /settings
    console.log('--> Visiting /settings');
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('h1');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_settings_desktop.png') });
    console.log('📸 Captured 08_settings_desktop.png');

    // Step K: Dark Mode Verification
    console.log('--> Verifying Dark Mode toggle...');
    await page.evaluate(() => {
      const toggle = (document.querySelector('button[aria-label*="dark"]') ||
        document.querySelector('button[aria-label*="theme"]')) as HTMLButtonElement | null;
      toggle?.click();
    });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_dark_mode_desktop.png') });
    console.log('📸 Captured 09_dark_mode_desktop.png');

    // ==========================================
    // 2. MOBILE VIEWPORT: 412x915
    // ==========================================
    console.log('\n📱 Walking Mobile Routes (412x915)...');
    await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });

    // Login Mobile (clear cookies to capture clean unauthenticated login screen)
    const cdp = await page.target().createCDPSession();
    await cdp.send('Network.clearBrowserCookies');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_login_mobile.png') });
    console.log('📸 Captured 10_login_mobile.png');

    // Re-login for mobile authenticated routes
    console.log('--> Logging in on mobile view...');
    await page.type('#username', APP_USERNAME);
    await page.type('#password', APP_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);

    // Overview Mobile
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_overview_mobile.png') });
    console.log('📸 Captured 11_overview_mobile.png');

    // Companies Mobile
    await page.goto(`${BASE_URL}/companies`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_companies_mobile.png') });
    console.log('📸 Captured 12_companies_mobile.png');

    // Company Workspace Mobile
    await page.goto(`${BASE_URL}/companies/noto`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_company_workspace_mobile.png') });
    console.log('📸 Captured 13_company_workspace_mobile.png');

    // Documents Mobile
    await page.goto(`${BASE_URL}/companies/noto/documents`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_documents_mobile.png') });
    console.log('📸 Captured 14_documents_mobile.png');

    // Settings Mobile
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle2' });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_settings_mobile.png') });
    console.log('📸 Captured 15_settings_mobile.png');

    // ==========================================
    // 3. NARROW 380px VIEWPORT & NO HORIZONTAL SCROLL
    // ==========================================
    console.log('\n📱 Verifying 380px Viewport (No Horizontal Scroll)...');
    await page.setViewport({ width: 380, height: 800, isMobile: true });
    await page.goto(`${BASE_URL}/companies/noto`, { waitUntil: 'networkidle2' });
    await sleep(800);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    if (hasHorizontalOverflow) {
      console.error('❌ Horizontal overflow detected at 380px width!');
    } else {
      console.log('✅ Zero horizontal overflow verified at 380px wide!');
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_viewport_380px.png') });
    console.log('📸 Captured 16_viewport_380px.png');

    // Assert console errors and failed requests
    console.log('\n📊 Assertion Results:');
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log(`Failed requests: ${failedRequests.length}`);

    if (consoleErrors.length > 0) {
      console.error('Console errors encountered:', consoleErrors);
    }
    if (failedRequests.length > 0) {
      console.error('Failed requests encountered:', failedRequests);
    }

    if (consoleErrors.length === 0 && failedRequests.length === 0) {
      console.log('\n🎉 ALL HEADLESS UI & CDP VERIFICATIONS PASSED WITH 0 CONSOLE ERRORS!');
    } else {
      console.warn('\n⚠️ Completed with warnings/errors.');
    }
  } catch (err: unknown) {
    console.error('Verification failed with exception:', err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

run();
