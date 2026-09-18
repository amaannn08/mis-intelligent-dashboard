import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import puppeteer, { Browser } from 'puppeteer-core';
import dotenv from 'dotenv';

dotenv.config({ path: 'apps/web/.env.local' });
dotenv.config({ path: '.env.local' });
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

    console.log('🌐 Launching headless Brave browser...');
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

    console.log('🔑 Logging in via UI (/login)...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('#username', APP_USERNAME);
    await page.type('#password', APP_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);
    console.log('✅ Logged in successfully! Current URL:', page.url());

    // -------------------------------------------------------------------------
    // STATE 1: All Companies (Unfiltered Overview /)
    // -------------------------------------------------------------------------
    console.log('\n======================================================');
    console.log('STATE 1: Loading All-Companies Overview (/)');
    console.log('======================================================');

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-testid="burn-ebitda-chart"]', { timeout: 15000 });
    await sleep(800);

    const state1Data = await page.evaluate(() => {
      // 1. Stat chips
      const chips = Array.from(document.querySelectorAll('header + div span.font-semibold')).map(
        (el) => el.parentElement?.textContent?.replace(/\s+/g, ' ').trim() || ''
      );

      // 2. 5 KPI Cards
      const cardNodes = Array.from(
        document.querySelectorAll('.grid.grid-cols-2.sm\\:grid-cols-3.lg\\:grid-cols-5 > div')
      );
      const kpiValues = cardNodes.map((card) => {
        const label = card.querySelector('span.uppercase')?.textContent?.trim() || '';
        const value = card.querySelector('.text-2xl')?.textContent?.trim() || '';
        const period = card.querySelector('.tabular-nums:not(.text-2xl)')?.textContent?.trim() || '';
        return { label, value, period };
      });

      // 3. Burn & EBITDA Chart
      const chartContainer = document.querySelector('[data-testid="burn-ebitda-chart"]');
      const hasChart = Boolean(chartContainer);
      const title = chartContainer?.querySelector('h3')?.textContent?.trim() || '';
      const subtitle = chartContainer?.querySelector('p')?.textContent?.trim() || '';
      const coverageFooter = chartContainer?.querySelector('.pt-2\\.5')?.textContent?.replace(/\s+/g, ' ').trim() || '';

      // Check Recharts elements inside SVG
      const svg = chartContainer?.querySelector('svg.recharts-surface');
      const zeroLine = svg?.querySelector('line.recharts-reference-line-line');
      const zeroLineStroke = zeroLine?.getAttribute('stroke') || '';

      // All SVG texts
      const allSvgTexts = Array.from(svg?.querySelectorAll('text') || []).map((t) => ({
        text: t.textContent?.trim() || '',
        className: t.getAttribute('class') || '',
        parentClass: (t.parentElement as HTMLElement | null)?.getAttribute('class') || '',
      }));

      // Ticks with %
      const yTicks = allSvgTexts
        .filter((t) => t.parentClass.includes('yAxis') || t.text.includes('%'))
        .map((t) => t.text);

      // Bar rects
      const barRects = Array.from(
        svg?.querySelectorAll('.recharts-bar-rectangle path, .recharts-bar-rectangle rect') || []
      );
      const barFills = barRects.map((b) => b.getAttribute('fill') || '');

      return {
        chips,
        kpiValues,
        hasChart,
        title,
        subtitle,
        coverageFooter,
        hasZeroLine: Boolean(zeroLine),
        zeroLineStroke,
        allSvgTexts,
        yTicks,
        barCount: barRects.length,
        barFills,
      };
    });

    console.log('State 1 (All Companies) Observed Values:');
    console.log('  Stat Chips:', state1Data.chips);
    console.log('  KPI Cards:');
    state1Data.kpiValues.forEach((c, idx) => {
      console.log(`    [${idx + 1}] ${c.label}: "${c.value}" (period/sub: "${c.period}")`);
    });
    console.log('  Burn & EBITDA Chart:');
    console.log(`    Title: "${state1Data.title}"`);
    console.log(`    Subtitle: "${state1Data.subtitle}"`);
    console.log(`    Coverage Note: "${state1Data.coverageFooter}"`);
    console.log(`    Has Zero Line: ${state1Data.hasZeroLine} (stroke: ${state1Data.zeroLineStroke})`);
    console.log(`    All SVG texts in chart:`, JSON.stringify(state1Data.allSvgTexts));
    console.log(`    Y-Axis Ticks: ${JSON.stringify(state1Data.yTicks)}`);
    console.log(`    Bar Count: ${state1Data.barCount}`);

    const screenshot1Path = path.join(REVIEW_DIR, '01_dash_state_all_companies.png');
    await page.screenshot({ path: screenshot1Path, fullPage: false });
    console.log(`📸 Screenshot saved to: ${screenshot1Path}`);

    // Assertions for State 1
    if (!state1Data.hasChart) throw new Error('State 1: Burn & EBITDA chart missing!');
    if (!state1Data.hasZeroLine) throw new Error('State 1: Emphasized zero reference line missing!');
    if (state1Data.yTicks.length === 0 || !state1Data.yTicks.some((t) => t.includes('%'))) {
      throw new Error('State 1: Y-axis ticks do not format as percentages!');
    }
    if (state1Data.kpiValues.length !== 5) {
      throw new Error(`State 1: Expected 5 KPI cards, found ${state1Data.kpiValues.length}`);
    }

    // -------------------------------------------------------------------------
    // STATE 2: Filtered Subset (/?companies=noto)
    // -------------------------------------------------------------------------
    console.log('\n======================================================');
    console.log('STATE 2: Loading Filtered Subset (/?companies=noto)');
    console.log('======================================================');

    await page.goto(`${BASE_URL}/?companies=noto`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-testid="burn-ebitda-chart"]', { timeout: 15000 });
    await sleep(800);

    const state2Data = await page.evaluate(() => {
      // 1. Stat chips
      const chips = Array.from(document.querySelectorAll('header + div span.font-semibold')).map(
        (el) => el.parentElement?.textContent?.replace(/\s+/g, ' ').trim() || ''
      );

      // 2. 5 KPI Cards
      const cardNodes = Array.from(
        document.querySelectorAll('.grid.grid-cols-2.sm\\:grid-cols-3.lg\\:grid-cols-5 > div')
      );
      const kpiValues = cardNodes.map((card) => {
        const label = card.querySelector('span.uppercase')?.textContent?.trim() || '';
        const value = card.querySelector('.text-2xl')?.textContent?.trim() || '';
        const period = card.querySelector('.tabular-nums:not(.text-2xl)')?.textContent?.trim() || '';
        return { label, value, period };
      });

      // 3. Burn & EBITDA Chart
      const chartContainer = document.querySelector('[data-testid="burn-ebitda-chart"]');
      const hasChart = Boolean(chartContainer);
      const title = chartContainer?.querySelector('h3')?.textContent?.trim() || '';
      const subtitle = chartContainer?.querySelector('p')?.textContent?.trim() || '';
      const coverageFooter = chartContainer?.querySelector('.pt-2\\.5')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const singleCompanyNote =
        Array.from(chartContainer?.querySelectorAll('div') || [])
          .find((el) => el.textContent?.includes('Single-company reporting'))
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() || '';

      // Check Recharts elements inside SVG
      const svg = chartContainer?.querySelector('svg.recharts-surface');
      const zeroLine = svg?.querySelector('line.recharts-reference-line-line');
      const zeroLineStroke = zeroLine?.getAttribute('stroke') || '';

      const yTicks = Array.from(
        chartContainer?.querySelectorAll('.recharts-yAxis text, .recharts-yAxis tspan') || []
      )
        .map((t) => t.textContent?.trim() || '')
        .filter(Boolean);

      const barRects = Array.from(
        svg?.querySelectorAll('.recharts-bar-rectangle path, .recharts-bar-rectangle rect') || []
      );

      return {
        chips,
        kpiValues,
        hasChart,
        title,
        subtitle,
        coverageFooter,
        singleCompanyNote,
        hasZeroLine: Boolean(zeroLine),
        zeroLineStroke,
        yTicks,
        barCount: barRects.length,
      };
    });

    console.log('State 2 (Filtered: NOTO) Observed Values:');
    console.log('  Stat Chips:', state2Data.chips);
    console.log('  KPI Cards:');
    state2Data.kpiValues.forEach((c, idx) => {
      console.log(`    [${idx + 1}] ${c.label}: "${c.value}" (period/sub: "${c.period}")`);
    });
    console.log('  Burn & EBITDA Chart:');
    console.log(`    Title: "${state2Data.title}"`);
    console.log(`    Subtitle: "${state2Data.subtitle}"`);
    console.log(`    Single-Company Honest Note: "${state2Data.singleCompanyNote}"`);
    console.log(`    Coverage Note: "${state2Data.coverageFooter}"`);
    console.log(`    Has Zero Line: ${state2Data.hasZeroLine} (stroke: ${state2Data.zeroLineStroke})`);
    console.log(`    Y-Axis Ticks: ${JSON.stringify(state2Data.yTicks)}`);
    console.log(`    Bar Count: ${state2Data.barCount}`);

    const screenshot2Path = path.join(REVIEW_DIR, 'dash_state_filtered_noto.png');
    await page.screenshot({ path: screenshot2Path, fullPage: false });
    console.log(`📸 Screenshot saved to: ${screenshot2Path}`);

    // Assertions comparing State 1 vs State 2
    console.log('\n--- Comparing State 1 vs State 2 ---');
    const state1CompaniesCount = state1Data.kpiValues[0]?.value;
    const state2CompaniesCount = state2Data.kpiValues[0]?.value;
    console.log(`Companies Count: State 1 = "${state1CompaniesCount}", State 2 = "${state2CompaniesCount}"`);
    if (state1CompaniesCount === state2CompaniesCount) {
      throw new Error(`Companies count failed to change! Both are ${state1CompaniesCount}`);
    }

    const state1Revenue = state1Data.kpiValues[4]?.value;
    const state2Revenue = state2Data.kpiValues[4]?.value;
    console.log(`Reported Revenue: State 1 = "${state1Revenue}", State 2 = "${state2Revenue}"`);
    if (state1Revenue === state2Revenue) {
      throw new Error(`Reported revenue failed to change between states! Both are ${state1Revenue}`);
    }

    if (!state2Data.singleCompanyNote.includes('Single-company reporting')) {
      throw new Error(`State 2 missing expected single-company reporting note on chart! Found: "${state2Data.singleCompanyNote}"`);
    }

    // -------------------------------------------------------------------------
    // STATE 3: Interactive Filter Popover Flow
    // -------------------------------------------------------------------------
    console.log('\n======================================================');
    console.log('STATE 3: Testing Interactive Filter Popover UI');
    console.log('======================================================');

    // Click filter trigger button
    await page.click('[data-testid="company-filter-trigger"]');
    await page.waitForSelector('[data-testid="company-filter-popover"]', { timeout: 3000 });
    await sleep(400);

    const popoverScreenshot = path.join(REVIEW_DIR, 'dash_filter_popover_open.png');
    await page.screenshot({ path: popoverScreenshot, fullPage: false });
    console.log(`📸 Screenshot saved to: ${popoverScreenshot}`);

    // Click "With MIS only" preset
    console.log('Clicking "With MIS only" preset...');
    await page.click('[data-testid="company-filter-preset-mis"]');
    await sleep(200);

    // Click Apply
    console.log('Clicking Apply...');
    await page.click('[data-testid="company-filter-apply"]');
    await sleep(1000);

    const state3Url = page.url();
    console.log(`URL after applying preset: ${state3Url}`);

    const screenshot3Path = path.join(REVIEW_DIR, 'dash_state_with_mis_only.png');
    await page.screenshot({ path: screenshot3Path, fullPage: false });
    console.log(`📸 Screenshot saved to: ${screenshot3Path}`);

    console.log('\n======================================================');
    console.log('🎉 ALL TWO-STATE DASHBOARD VERIFICATIONS PASSED!');
    console.log('======================================================\n');
  } finally {
    await cleanup();
  }
}

run().catch(async (err) => {
  console.error('❌ Verification failed:', err);
  await cleanup();
  process.exit(1);
});
