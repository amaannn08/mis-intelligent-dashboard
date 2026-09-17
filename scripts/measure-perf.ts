import { spawn, ChildProcess } from 'node:child_process';
import puppeteer, { Browser, Page, CDPSession } from 'puppeteer-core';
import { db, companies } from '@mis/db';
import { sql } from 'drizzle-orm';

const BASE_URL = 'http://127.0.0.1:3000';

interface RouteMetrics {
  route: string;
  requests: number;
  totalTransferredKb: number;
  jsTransferredKb: number;
  fcpMs: number;
  lcpMs: number;
  clickToContentMs?: number;
  consoleErrors: string[];
  hasHorizontalOverflow412?: boolean;
}

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
    } catch {}
    await sleep(400);
  }
  return false;
}

async function startProdServer(): Promise<void> {
  console.log('🚀 Starting Next.js server on port 3000...');
  serverProc = spawn('npm', ['run', 'start', '--workspace=apps/web', '--', '-p', '3000'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    detached: false,
    env: { ...process.env, PORT: '3000' },
  });

  const isUp = await waitForServer(BASE_URL);
  if (!isUp) {
    throw new Error('Server failed to start within timeout');
  }
  console.log('✅ Server ready on http://127.0.0.1:3000');
}

async function stopServer(): Promise<void> {
  if (serverProc && serverProc.pid) {
    console.log('🛑 Stopping server...');
    try {
      serverProc.kill('SIGTERM');
    } catch {}
    serverProc = null;
  }
}

async function cleanup() {
  if (browser) {
    try {
      await browser.close();
    } catch {}
  }
  await stopServer();
}

async function measurePage(
  page: Page,
  client: CDPSession,
  url: string,
  routeName: string,
  clickTrigger?: () => Promise<void>
): Promise<RouteMetrics> {
  const errors: string[] = [];
  const errorHandler = (msg: any) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  };
  page.on('console', errorHandler);

  let requestCount = 0;
  let totalBytes = 0;
  let jsBytes = 0;
  const requestIdToType = new Map<string, string>();

  const responseHandler = (params: any) => {
    requestCount++;
    const mime = params.response?.mimeType || '';
    const url = params.response?.url || '';
    if (mime.includes('javascript') || url.endsWith('.js') || url.includes('_next/static/chunks/')) {
      requestIdToType.set(params.requestId, 'js');
    } else {
      requestIdToType.set(params.requestId, 'other');
    }
  };

  const loadingFinishedHandler = (params: any) => {
    const bytes = params.encodedDataLength || 0;
    totalBytes += bytes;
    if (requestIdToType.get(params.requestId) === 'js') {
      jsBytes += bytes;
    }
  };

  client.on('Network.responseReceived', responseHandler);
  client.on('Network.loadingFinished', loadingFinishedHandler);

  let clickTimeMs: number | undefined;

  if (clickTrigger) {
    const start = Date.now();
    await clickTrigger();
    clickTimeMs = Date.now() - start;
  } else {
    await page.goto(url, { waitUntil: 'networkidle0' });
  }

  // Allow FCP and LCP to finalize
  await sleep(1000);

  // Read FCP and LCP
  const { fcp, lcp } = await page.evaluate(() => {
    let fcpVal = 0;
    let lcpVal = 0;
    const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
    if (fcpEntry) {
      fcpVal = fcpEntry.startTime;
    }
    const paintEntries = performance.getEntriesByType('paint');
    for (const p of paintEntries) {
      if (p.name === 'first-contentful-paint') fcpVal = p.startTime;
    }
    // Check LCP entries if available
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries && lcpEntries.length > 0) {
      lcpVal = (lcpEntries[lcpEntries.length - 1] as any).startTime || 0;
    }
    return { fcp: fcpVal, lcp: lcpVal || fcpVal };
  });

  // Check 412px mobile overflow
  await page.setViewport({ width: 412, height: 915 });
  await sleep(200);
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  // Reset viewport back to desktop
  await page.setViewport({ width: 1440, height: 900 });

  client.off('Network.responseReceived', responseHandler);
  client.off('Network.loadingFinished', loadingFinishedHandler);
  page.off('console', errorHandler);

  return {
    route: routeName,
    requests: requestCount,
    totalTransferredKb: Math.round((totalBytes / 1024) * 10) / 10,
    jsTransferredKb: Math.round((jsBytes / 1024) * 10) / 10,
    fcpMs: Math.round(fcp),
    lcpMs: Math.round(lcp),
    clickToContentMs: clickTimeMs,
    consoleErrors: errors,
    hasHorizontalOverflow412: hasOverflow,
  };
}

async function main() {
  process.on('SIGINT', async () => {
    await cleanup();
    process.exit(1);
  });

  // Fetch a real company slug for testing /companies/[slug]
  const [firstComp] = await db.select({ slug: companies.slug }).from(companies).limit(1);
  const sampleSlug = firstComp?.slug || 'acme-health';
  console.log(`Using company slug: ${sampleSlug}`);

  try {
    await startProdServer();

    browser = await puppeteer.launch({
      executablePath: '/bin/brave',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--window-size=1440,900',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // 1. Log in
    console.log('Logging in...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('#username', 'wehcrm');
    await page.type('#password', 'REDACTED_PASSWORD');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);
    console.log('Logged in successfully');

    const client = await page.createCDPSession();
    await client.send('Network.enable');

    // Measure Overview (/)
    console.log('Measuring / ...');
    const overviewMetrics = await measurePage(page, client, `${BASE_URL}/`, '/');

    // Measure Companies (/companies) via click navigation
    console.log('Measuring /companies via navigation click...');
    const companiesMetrics = await measurePage(
      page,
      client,
      `${BASE_URL}/companies`,
      '/companies',
      async () => {
        // Find link to /companies
        const companiesLink = await page.$('a[href="/companies"]');
        if (companiesLink) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
            companiesLink.click(),
          ]);
        } else {
          await page.goto(`${BASE_URL}/companies`, { waitUntil: 'networkidle0' });
        }
      }
    );

    // Measure Company Detail (/companies/[slug]) via click
    console.log(`Measuring /companies/${sampleSlug} via navigation click...`);
    const compDetailMetrics = await measurePage(
      page,
      client,
      `${BASE_URL}/companies/${sampleSlug}`,
      `/companies/[slug]`,
      async () => {
        const detailLink = await page.$(`a[href="/companies/${sampleSlug}"]`);
        if (detailLink) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}),
            detailLink.click(),
          ]);
        } else {
          await page.goto(`${BASE_URL}/companies/${sampleSlug}`, { waitUntil: 'networkidle0' });
        }
      }
    );

    console.log('\n================ PERF RESULTS ================');
    const results = [overviewMetrics, companiesMetrics, compDetailMetrics];
    console.table(
      results.map((r) => ({
        Route: r.route,
        Requests: r.requests,
        'Total (KB)': r.totalTransferredKb,
        'JS (KB)': r.jsTransferredKb,
        'FCP (ms)': r.fcpMs,
        'LCP (ms)': r.lcpMs,
        'Click Nav (ms)': r.clickToContentMs ?? 'N/A',
        '412px Overflow': r.hasHorizontalOverflow412 ? 'YES' : 'NO',
        Errors: r.consoleErrors.length,
      }))
    );
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await cleanup();
  }
}

main().catch(async (err) => {
  console.error('Measurement failed:', err);
  await cleanup();
  process.exit(1);
});
