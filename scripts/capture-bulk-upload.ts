import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';
import xlsx from 'xlsx';
import puppeteer from 'puppeteer-core';

const CHROMIUM_PATH = '/home/amann/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const PORT = 3005;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // wait
    }
    await sleep(300);
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

async function run() {
  console.log('='.repeat(70));
  console.log('CAPTURING /admin/bulk-upload SCREENSHOT');
  console.log('='.repeat(70));

  const hermesPath = '/home/amann/.hermes/private/mis-secrets.env';
  let hermesEnv: Record<string, string> = {};
  if (fs.existsSync(hermesPath)) {
    hermesEnv = dotenv.parse(fs.readFileSync(hermesPath, 'utf8'));
  }

  process.env.DATABASE_URL = hermesEnv.MIS_PROD_DATABASE_URL;
  process.env.TARGET_ENV = 'prod';
  process.env.COOKIE_SECRET = hermesEnv.COOKIE_SECRET || 'dev-cookie-secret-for-testing-only-replace-in-prod-min-32-chars';
  if (hermesEnv.MIS_BLOB_READ_WRITE_TOKEN) {
    process.env.BLOB_READ_WRITE_TOKEN = hermesEnv.MIS_BLOB_READ_WRITE_TOKEN;
  }

  // 1. Create sample test files
  const tmpDir = '/tmp/sample_mis_upload';
  fs.mkdirSync(tmpDir, { recursive: true });

  const xlsxLib = (xlsx as unknown as { default?: typeof xlsx }).default || xlsx;

  const sample1 = path.join(tmpDir, 'Animall_MIS_Q1_2026.xlsx');
  const wb1 = xlsxLib.utils.book_new();
  xlsxLib.utils.book_append_sheet(wb1, xlsxLib.utils.aoa_to_sheet([['Metric', 'Mar 26'], ['Revenue', 15000000], ['EBITDA', -200000]]), 'Summary');
  xlsxLib.writeFile(wb1, sample1);

  const sample2 = path.join(tmpDir, 'Pratilipi_MIS_May_2026.xlsx');
  const wb2 = xlsxLib.utils.book_new();
  xlsxLib.utils.book_append_sheet(wb2, xlsxLib.utils.aoa_to_sheet([['Metric', 'May 26'], ['Revenue', 32000000], ['Burn', 1500000]]), 'MIS');
  xlsxLib.writeFile(wb2, sample2);

  const sample3 = path.join(tmpDir, 'Masterchow_MIS_June_2026.xlsx');
  const wb3 = xlsxLib.utils.book_new();
  xlsxLib.utils.book_append_sheet(wb3, xlsxLib.utils.aoa_to_sheet([['Metric', 'Jun 26'], ['Revenue', 45000000], ['GMV', 80000000]]), 'P&L');
  xlsxLib.writeFile(wb3, sample3);

  console.log('Sample test workbooks generated in /tmp/sample_mis_upload');

  // 2. Start Next.js server on PORT 3005
  console.log(`Starting Next.js server on port ${PORT}...`);
  const webDir = path.resolve(process.cwd(), 'apps/web');
  const serverProcess = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: webDir,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    stdio: 'pipe',
  });

  serverProcess.stdout.on('data', (d) => {
    // console.log('[next]', d.toString().trim());
  });
  serverProcess.stderr.on('data', (d) => {
    // console.error('[next err]', d.toString().trim());
  });

  try {
    await waitForServer(`http://localhost:${PORT}/api/health`);
    console.log('Next.js server is ready and responding!');

    // 3. Create session token
    const { signSession } = await import('../apps/web/src/lib/auth.js');
    const sessionToken = await signSession('admin');

    // 4. Launch browser
    console.log('Launching headless Chromium via puppeteer-core...');
    const browser = await puppeteer.launch({
      executablePath: CHROMIUM_PATH,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });

    await page.setCookie({
      name: 'mis_session',
      value: sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
    });

    console.log(`Navigating to http://localhost:${PORT}/admin/bulk-upload...`);
    await page.goto(`http://localhost:${PORT}/admin/bulk-upload`, {
      waitUntil: 'networkidle0',
      timeout: 15000,
    });

    console.log('Page loaded. Selecting multiple files to populate queue...');
    const fileInput = await page.$('input[type="file"]:not([webkitdirectory])');
    if (!fileInput) {
      throw new Error('Could not find file input element on page');
    }

    await fileInput.uploadFile(sample1, sample2, sample3);

    // Wait for the queue items to render
    await sleep(2000);

    const outPath1 = path.resolve(process.cwd(), 'docs/review/bulk_upload_flow.png');
    const outPath2 = '/home/amann/.gemini/antigravity-cli/brain/ad3a3625-3aa7-47af-91f0-fdc024273263/bulk_upload_flow.png';

    fs.mkdirSync(path.dirname(outPath1), { recursive: true });
    await page.screenshot({ path: outPath1, fullPage: true });
    fs.copyFileSync(outPath1, outPath2);

    console.log(`✅ Screenshot captured successfully:`);
    console.log(`   - ${outPath1}`);
    console.log(`   - ${outPath2}`);

    await browser.close();
  } finally {
    serverProcess.kill('SIGTERM');
    console.log('Next.js server stopped.');
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Screenshot capture failed:', err);
    process.exit(1);
  });
