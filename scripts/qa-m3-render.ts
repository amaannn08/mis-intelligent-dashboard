import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import puppeteer, { Browser } from 'puppeteer-core';
import dotenv from 'dotenv';

// Load secrets safely
for (const envFile of [
  path.resolve(process.env.HOME || '', '.hermes/private/mis-secrets.env'),
  'apps/web/.env.local',
  'packages/db/.env',
  '.env.local',
]) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
  }
}

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

async function waitForServer(url: string, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      // waiting
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
    detached: true,
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
      process.kill(-serverProc.pid, 'SIGTERM');
    } catch {
      try {
        serverProc.kill('SIGTERM');
      } catch {}
    }
  }
}

async function run() {
  try {
    await startServer();

    console.log('🌐 Launching headless Brave browser (/bin/brave)...');
    browser = await puppeteer.launch({
      executablePath: '/bin/brave',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1440,960',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });

    if (APP_PASSWORD) {
      console.log('🔑 Performing login via UI (/login)...');
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
      await page.type('#username', APP_USERNAME);
      await page.type('#password', APP_PASSWORD);
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2' }),
        page.click('button[type="submit"]'),
      ]);
      console.log('✅ Logged in successfully. Current URL:', page.url());
    }

    // 1. Dashboard: Portfolio Overview with Aggregate Period Selector & Separated Currency
    console.log('📸 Capturing Dashboard overview...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const dashPath = path.join(REVIEW_DIR, 'm3_dashboard_desktop.png');
    await page.screenshot({ path: dashPath, fullPage: false });
    console.log(`Saved: ${dashPath}`);

    // 2. Company Workspace: Masterchow / SVG / first available company
    console.log('📸 Capturing Company Workspace...');
    // Find first company link or go to known slug
    await page.goto(`${BASE_URL}/companies`, { waitUntil: 'networkidle2' });
    await sleep(1000);
    const firstCompanyHref = await page.evaluate(() => {
      const link = document.querySelector('a[href^="/companies/"]');
      return link ? link.getAttribute('href') : null;
    });

    const targetCompanyUrl = firstCompanyHref ? `${BASE_URL}${firstCompanyHref}` : `${BASE_URL}/companies/masterchow`;
    console.log(`Navigating to company: ${targetCompanyUrl}`);
    await page.goto(targetCompanyUrl, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const companyPath = path.join(REVIEW_DIR, 'm3_company_desktop.png');
    await page.screenshot({ path: companyPath, fullPage: false });
    console.log(`Saved: ${companyPath}`);

    // 3. Chat: Dedicated Chat interface
    console.log('📸 Capturing Chat Interface...');
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle2' });
    await sleep(1500);
    const chatPath = path.join(REVIEW_DIR, 'm3_chat_desktop.png');
    await page.screenshot({ path: chatPath, fullPage: false });
    console.log(`Saved: ${chatPath}`);

    console.log('🎉 Milestone 3 local render QA complete!');
  } finally {
    await cleanup();
  }
}

run().catch((err) => {
  console.error('QA render failed:', err);
  cleanup().then(() => process.exit(1));
});
