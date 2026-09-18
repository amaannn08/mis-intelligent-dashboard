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
      // not ready
    }
    await sleep(400);
  }
  return false;
}

async function startServer(): Promise<number> {
  console.log('🚀 Starting Next.js server on port 3000...');
  serverProc = spawn('npm', ['run', 'start', '--workspace=apps/web', '--', '-p', '3000'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    detached: false,
    env: { ...process.env, PORT: '3000' },
  });

  const isUp = await waitForServer(BASE_URL);
  if (!isUp) {
    throw new Error('Server failed to start within timeout');
  }
  console.log('✅ Server is ready at http://127.0.0.1:3000');
  return serverProc.pid!;
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test processes...');
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

    console.log('🌐 Launching headless Brave browser...');
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
      ],
    });

    const page = await browser.newPage();

    // 1. Desktop Test: 1512x900
    console.log('\n📱 Testing Desktop 1512x900...');
    await page.setViewport({ width: 1512, height: 900, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });

    // Verify logo renders
    const logoLoaded = await page.evaluate(() => {
      const img = document.querySelector('img[src="/images/logo-black.svg"]') as HTMLImageElement;
      return img && img.complete && img.naturalWidth > 0;
    });
    console.log(`- Logo loaded successfully: ${logoLoaded}`);
    if (!logoLoaded) throw new Error('Logo image failed to load or is broken');

    // Verify stat line
    const statLineText = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('div'));
      const found = elements.find((el) => el.textContent?.includes('PORTFOLIO COMPANIES TRACKED'));
      return found ? found.textContent?.trim() : null;
    });
    console.log(`- Stat line: "${statLineText}"`);
    if (!statLineText) throw new Error('Stat line missing from login page');

    // Take Desktop Screenshot
    const desktopScreenshotPath = path.join(REVIEW_DIR, 'login_desktop_1512x900.png');
    await page.screenshot({ path: desktopScreenshotPath, fullPage: false });
    console.log(`📸 Saved desktop screenshot to ${desktopScreenshotPath}`);

    // 2. Test Password Toggle
    console.log('\n🔑 Testing Password Toggle...');
    const passwordInput = await page.$('#password');
    if (!passwordInput) throw new Error('#password input not found');
    await passwordInput.type('testPassword123');

    let inputType = await page.$eval('#password', (el) => el.getAttribute('type'));
    console.log(`- Initial password input type: ${inputType}`);
    if (inputType !== 'password') throw new Error('Password input should initially be type="password"');

    // Click toggle button
    const toggleButton = await page.$('button[aria-label="Show password"]');
    if (!toggleButton) throw new Error('Show password button not found');
    await toggleButton.click();

    inputType = await page.$eval('#password', (el) => el.getAttribute('type'));
    console.log(`- After click show password, input type: ${inputType}`);
    if (inputType !== 'text') throw new Error('Password input should now be type="text"');

    // Click toggle button again
    const hideButton = await page.$('button[aria-label="Hide password"]');
    if (!hideButton) throw new Error('Hide password button not found');
    await hideButton.click();

    inputType = await page.$eval('#password', (el) => el.getAttribute('type'));
    console.log(`- After click hide password, input type: ${inputType}`);
    if (inputType !== 'password') throw new Error('Password input should be type="password" again');

    // 3. Test Error State and Enter Submission
    console.log('\n❌ Testing Error Alert & Enter Submit...');
    await page.$eval('#username', (el: any) => { el.value = ''; });
    await page.type('#username', APP_USERNAME);
    await page.$eval('#password', (el: any) => { el.value = ''; });
    await page.type('#password', 'WrongPassword123!');

    // Press Enter to submit
    await page.keyboard.press('Enter');

    // Wait for role="alert"
    await page.waitForSelector('[role="alert"]', { timeout: 5000 });
    const errorText = await page.$eval('[role="alert"]', (el) => el.textContent?.trim());
    console.log(`- Error message displayed: "${errorText}"`);
    if (!errorText || !errorText.toLowerCase().includes('invalid')) {
      throw new Error(`Unexpected error text: ${errorText}`);
    }

    const errorScreenshotPath = path.join(REVIEW_DIR, 'login_error_desktop.png');
    await page.screenshot({ path: errorScreenshotPath, fullPage: false });
    console.log(`📸 Saved error state screenshot to ${errorScreenshotPath}`);

    // 4. Test Mobile Viewport: 412x915
    console.log('\n📱 Testing Mobile 412x915...');
    await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true });
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });

    // Check no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`- Horizontal overflow present: ${hasHorizontalOverflow}`);
    if (hasHorizontalOverflow) throw new Error('Page has horizontal overflow at 412px!');

    const mobileScreenshotPath = path.join(REVIEW_DIR, 'login_mobile_412x915.png');
    await page.screenshot({ path: mobileScreenshotPath, fullPage: false });
    console.log(`📸 Saved mobile screenshot to ${mobileScreenshotPath}`);

    // 5. Test Successful Login & App Shell Header
    console.log('\n🔓 Testing Valid Login & App Shell Header...');
    await page.setViewport({ width: 1512, height: 900, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });

    await page.type('#username', APP_USERNAME);
    await page.type('#password', APP_PASSWORD);
    await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    console.log(`- Navigated to: ${page.url()}`);

    const headerLogoLoaded = await page.evaluate(() => {
      const img = document.querySelector('header img[src="/images/logo-black.svg"]') as HTMLImageElement;
      return img && img.complete && img.naturalWidth > 0;
    });
    console.log(`- App shell header logo loaded: ${headerLogoLoaded}`);
    if (!headerLogoLoaded) throw new Error('App shell header logo failed to load!');

    const headerScreenshotPath = path.join(REVIEW_DIR, 'app_shell_header_1512x900.png');
    await page.screenshot({ path: headerScreenshotPath, fullPage: false });
    console.log(`📸 Saved app shell screenshot to ${headerScreenshotPath}`);

    console.log('\n🎉 All login page tests and visual checks PASSED successfully!');
  } finally {
    await cleanup();
  }
}

run().catch((err) => {
  console.error('❌ Verification failed:', err);
  cleanup().finally(() => process.exit(1));
});
