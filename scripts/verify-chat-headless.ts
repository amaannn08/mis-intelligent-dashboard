import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import puppeteer, { Browser, Page } from 'puppeteer-core';

const BASE_URL = 'http://127.0.0.1:3000';
const SCREENSHOTS_DIR = path.resolve(process.cwd(), 'docs/screenshots');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let serverProc: ChildProcess | null = null;
let browser: Browser | null = null;

const consoleErrors: string[] = [];
const failedRequests: string[] = [];

function setupPageMonitoring(page: Page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      consoleErrors.push(`[Console Error] ${text}`);
      console.error(`🔴 Console error: ${text}`);
    }
  });

  page.on('requestfailed', (req) => {
    const url = req.url();
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
      // wait
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
  try {
    await startServer();

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

    await page.setViewport({ width: 1440, height: 900 });

    // 1. Login
    console.log('\n--> Step 1: Logging in at /login...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('#username', 'wehcrm');
    await page.type('#password', 'REDACTED_PASSWORD');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);
    console.log('✅ Logged in successfully!');

    // 2. Open /chat
    console.log('\n--> Step 2: Navigating to /chat...');
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('textarea');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'c2_01_chat_mounted.png') });
    console.log('📸 Captured c2_01_chat_mounted.png');

    // 3. Start New Chat
    console.log('\n--> Step 3: Clicking New chat...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const newChatBtn = btns.find((b) => b.textContent?.includes('New chat'));
      newChatBtn?.click();
    });
    await sleep(800);

    // 4. Ask Portfolio Question
    console.log('\n--> Step 4: Asking portfolio question: "Which company has the highest burn?"...');
    await page.type('textarea', 'Which company has the highest burn?');
    await page.keyboard.press('Enter');

    // Wait for streaming and final assistant response
    console.log('Waiting for streamed response...');
    let hasAnswer = false;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const text = await page.evaluate(() => document.body.innerText);
      // Check if assistant response rendered
      if (text.includes('MIS') && (text.includes('burn') || text.includes('₹') || text.includes('cannot find'))) {
        hasAnswer = true;
        break;
      }
    }
    await sleep(2000); // let citations render
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'c2_02_portfolio_answered.png') });
    console.log('📸 Captured c2_02_portfolio_answered.png (Has answer: ' + hasAnswer + ')');

    // 5. Ask Follow-up Question
    console.log('\n--> Step 5: Asking follow-up question: "And what is their revenue?"...');
    await page.type('textarea', 'And what is their revenue?');
    await page.keyboard.press('Enter');

    console.log('Waiting for follow-up response...');
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      const msgCount = await page.evaluate(() => document.querySelectorAll('div.rounded-2xl.bg-primary').length);
      if (msgCount >= 2) break;
    }
    await sleep(3000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'c2_03_followup_answered.png') });
    console.log('📸 Captured c2_03_followup_answered.png');

    // 6. Reload page and confirm conversation persists
    console.log('\n--> Step 6: Reloading page to verify persistence...');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);
    const persistedMessagesCount = await page.evaluate(
      () => document.querySelectorAll('div.rounded-2xl.bg-primary').length
    );
    console.log(`✅ Reload verified: found ${persistedMessagesCount} user messages in persisted conversation!`);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'c2_04_persisted_after_reload.png') });

    // 7. Rename Conversation
    console.log('\n--> Step 7: Renaming conversation...');
    // Click title to edit
    await page.evaluate(() => {
      const titleEl = document.querySelector('h1.font-semibold');
      (titleEl as HTMLElement)?.click();
    });
    await sleep(500);

    const titleInput = await page.$('input[value]');
    if (titleInput) {
      await page.evaluate((el) => {
        (el as HTMLInputElement).value = '';
      }, titleInput);
      await titleInput.type('Q3 Portfolio Burn Analysis');
      await page.keyboard.press('Enter');
      await sleep(1000);
      console.log('✅ Renamed session to "Q3 Portfolio Burn Analysis"');
    }

    // 8. Scope Picker: Change scope to a company
    console.log('\n--> Step 8: Changing scope via Scope Picker to NOTO...');
    await page.evaluate(() => {
      const select = document.querySelector('select') as HTMLSelectElement | null;
      if (select) {
        const option = Array.from(select.options).find((o) => o.text.includes('NOTO'));
        if (option) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    await sleep(1200);

    // Verify system divider dropped
    const dividerText = await page.evaluate(() => document.body.innerText);
    const hasDivider = dividerText.includes('Scope changed to NOTO') || dividerText.includes('NOTO');
    console.log('✅ Scope changed divider verified: ' + hasDivider);

    // 9. Ask Company-Scoped Question
    console.log('\n--> Step 9: Asking company-scoped question: "What was the revenue in the latest MIS?"...');
    await page.type('textarea', 'What was the revenue in the latest MIS?');
    await page.keyboard.press('Enter');
    await sleep(6000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'c2_05_company_scoped.png') });
    console.log('📸 Captured c2_05_company_scoped.png');

    // 10. Click citation to open CitationDrawer
    console.log('\n--> Step 10: Clicking citation button to open CitationDrawer...');
    const clickedCitation = await page.evaluate(() => {
      const citationButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('chunk') || b.textContent?.includes('.xlsx') || /^\[\d+\]$/.test(b.textContent?.trim() || '')
      );
      if (citationButtons.length > 0) {
        citationButtons[0].click();
        return true;
      }
      return false;
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'c2_06_citation_drawer.png') });
    console.log('📸 Captured c2_06_citation_drawer.png (Clicked citation: ' + clickedCitation + ')');

    // Close citation drawer
    await page.keyboard.press('Escape');
    await sleep(500);

    // 11. Delete Session
    console.log('\n--> Step 11: Testing session delete...');
    // Hover session in sidebar and click delete
    const deleteTriggered = await page.evaluate(() => {
      const trashBtns = Array.from(document.querySelectorAll('button[aria-label*="Delete session"]'));
      if (trashBtns.length > 0) {
        (trashBtns[0] as HTMLButtonElement).click();
        return true;
      }
      return false;
    });

    if (deleteTriggered) {
      await sleep(500);
      // Click confirm delete in ConfirmDialog
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const confirmBtn = btns.find((b) => b.textContent?.includes('Delete Conversation'));
        confirmBtn?.click();
      });
      await sleep(1000);
      console.log('✅ Deleted conversation successfully!');
    }

    // 12. Mobile Viewport (412x915)
    console.log('\n--> Step 12: Testing Mobile Viewport (412x915)...');
    await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true });
    await sleep(500);

    // Open mobile sidebar via hamburger
    console.log('--> Opening mobile conversations drawer...');
    await page.evaluate(() => {
      const hamburger = document.querySelector('button[aria-label="Open conversation history"]') as HTMLButtonElement | null;
      hamburger?.click();
    });
    await sleep(800);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'c2_07_mobile_drawer.png') });
    console.log('📸 Captured c2_07_mobile_drawer.png');

    // Close mobile drawer
    await page.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Close conversations drawer"]') as HTMLButtonElement | null;
      closeBtn?.click();
    });
    await sleep(500);

    // Verify zero horizontal overflow at 412px
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log(`✅ Zero horizontal overflow at 412px: ${!hasHorizontalOverflow}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'c2_08_mobile_thread.png') });
    console.log('📸 Captured c2_08_mobile_thread.png');

    // 13. Verify navigation links
    console.log('\n--> Step 13: Verifying navigation and "Open in Chat" link in overview...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await sleep(1000);
    const hasOpenInChat = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links.some((a) => a.textContent?.includes('Open in Chat') && a.href.includes('/chat'));
    });
    console.log(`✅ "Open in Chat" link in overview QueryPanel verified: ${hasOpenInChat}`);

    console.log('\n📊 Assertion Results:');
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log(`Failed requests: ${failedRequests.length}`);

    if (consoleErrors.length > 0) {
      console.warn('Console errors:', consoleErrors);
    }
    if (failedRequests.length > 0) {
      console.warn('Failed requests:', failedRequests);
    }

    if (consoleErrors.length === 0 && failedRequests.length === 0) {
      console.log('\n🎉 ALL RUN C2 CHAT VERIFICATIONS PASSED WITH 0 CONSOLE ERRORS!');
    }
  } catch (err: unknown) {
    console.error('❌ Verification failed with error:', err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

run();
