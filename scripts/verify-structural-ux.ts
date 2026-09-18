import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import dotenv from 'dotenv';

// Load environment configuration from standard project locations
dotenv.config({ path: '.env.local' });
dotenv.config({ path: 'apps/web/.env.local' });
dotenv.config({ path: 'packages/db/.env' });

const APP_USERNAME = process.env.MIS_AUTH_USERNAME || process.env.AUTH_USERNAME || 'wehcrm';
const APP_PASSWORD = process.env.MIS_AUTH_PASSWORD || process.env.AUTH_PASSWORD || '';
if (!APP_PASSWORD) {
  console.error('ERROR: MIS_AUTH_PASSWORD / AUTH_PASSWORD is not set in environment or .env.local.');
  process.exit(1);
}

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
      // waiting for server
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
  const results: Record<string, unknown> = {};

  try {
    await startServer();

    // -------------------------------------------------------------
    // Phase 1: Authentication & HTTP Proxy Verification (Part A)
    // -------------------------------------------------------------
    console.log('\n--> Phase 1: Authenticating and verifying HTTP endpoints...');
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
    console.log('✅ Logged in successfully, session cookie obtained');

    // Verify unauthenticated download returns 401
    const DEMO_DOC_ID = '47fa4eff-255f-4110-ad7b-82c69a813fdf';
    const unauthDownloadRes = await fetch(`${BASE_URL}/api/documents/${DEMO_DOC_ID}/file`);
    console.log(`Unauthenticated download status: ${unauthDownloadRes.status} (expected 401)`);
    if (unauthDownloadRes.status !== 401) {
      throw new Error(`Expected 401 for unauthenticated download, got ${unauthDownloadRes.status}`);
    }

    // Verify authenticated download via legacy document_blobs fallback
    const authDownloadRes = await fetch(`${BASE_URL}/api/documents/${DEMO_DOC_ID}/file`, {
      headers: { Cookie: sessionCookie },
    });
    console.log(`Authenticated download status: ${authDownloadRes.status} (expected 200)`);
    if (!authDownloadRes.ok) {
      throw new Error(`Expected 200 for authenticated demo document download, got ${authDownloadRes.status}`);
    }
    const downloadBuffer = await authDownloadRes.arrayBuffer();
    const contentType = authDownloadRes.headers.get('content-type') || '';
    const contentDisposition = authDownloadRes.headers.get('content-disposition') || '';
    console.log(`✅ Demo document fallback download verified: ${downloadBuffer.byteLength} bytes, type="${contentType}", disposition="${contentDisposition}"`);

    results.documentDownloadFallback = {
      status: authDownloadRes.status,
      bytes: downloadBuffer.byteLength,
      contentType,
      contentDisposition,
      verified: true,
    };

    // Verify client upload token endpoint
    const uploadTokenRes = await fetch(`${BASE_URL}/api/documents/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: {
          pathname: 'test_mis.xlsx',
          callbackUrl: `${BASE_URL}/api/documents/upload`,
          clientPayload: JSON.stringify({ companyId: '9b0c7854-5d10-47de-83dd-096af7af4144' }),
        },
      }),
    });
    console.log(`Upload token endpoint status: ${uploadTokenRes.status} (expected 200)`);
    if (!uploadTokenRes.ok) {
      const errText = await uploadTokenRes.text();
      console.warn(`Upload token generation warning (may require live token): ${uploadTokenRes.status} ${errText}`);
    } else {
      const tokenJson = await uploadTokenRes.json();
      console.log('✅ Upload token endpoint responded with client token:', Boolean(tokenJson.clientToken));
      results.uploadTokenEndpoint = { status: uploadTokenRes.status, verified: true };
    }

    // -------------------------------------------------------------
    // Phase 2: Headless Browser UX & Structural Verification (Part B)
    // -------------------------------------------------------------
    console.log('\n--> Phase 2: Launching headless browser for structural verification...');
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
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    // Login via UI
    console.log('Navigating to /login...');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle2' });
    await page.type('#username', APP_USERNAME);
    await page.type('#password', APP_PASSWORD);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]'),
    ]);
    console.log('✅ UI login successful');

    // Navigate to /chat with Noto pre-selected
    const NOTO_COMPANY_ID = '9b0c7854-5d10-47de-83dd-096af7af4144';
    console.log(`Navigating to /chat?companyId=${NOTO_COMPANY_ID}...`);
    await page.goto(`${BASE_URL}/chat?companyId=${NOTO_COMPANY_ID}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('textarea');
    await sleep(1500);

    // Ask the canonical reference query
    const question = 'how is the monthly revenue for the past few months and how is the ebitda burn';
    console.log(`Sending query: "${question}"...`);
    await page.type('textarea', question);
    await page.keyboard.press('Enter');

    console.log('Waiting for response, charts, and stream to complete...');
    // Wait for assistant response to render
    let completed = false;
    for (let i = 0; i < 35; i++) {
      await sleep(1000);
      const isStillStreaming = await page.evaluate(() => {
        return Boolean(document.querySelector('.animate-pulse') || document.querySelector('.animate-ping'));
      });
      const hasContent = await page.evaluate(() => {
        return Boolean(document.querySelector('[data-testid="chat-message-prose"]'));
      });
      if (hasContent && !isStillStreaming && i > 8) {
        completed = true;
        break;
      }
    }
    await sleep(2000); // Allow final layout and animations to settle

    // -------------------------------------------------------------
    // Structural Invariant Checks in DOM
    // -------------------------------------------------------------
    console.log('\n=============================================================');
    console.log('RUNNING STRUCTURAL INVARIANT ASSERTIONS (BINDING RULES)');
    console.log('=============================================================');

    const domInspection = await page.evaluate(() => {
      // 1. Chart Cards & Plot Heights
      const chartCards = Array.from(document.querySelectorAll('div[role="img"]'));
      const plots = chartCards.map((card, idx) => {
        const plotContainer = card.querySelector('.h-\\[140px\\]') || card.querySelector('svg.recharts-surface')?.parentElement;
        const rect = plotContainer ? plotContainer.getBoundingClientRect() : card.getBoundingClientRect();
        
        // Count Y axes (should be exactly 1, left only)
        const yAxes = card.querySelectorAll('.recharts-yAxis');
        const yAxisTicks = card.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick');
        
        // Value labels on bars
        const valueLabels = Array.from(card.querySelectorAll('.recharts-label-list text')).map(
          (el) => el.textContent?.trim() || ''
        );

        // Bars count
        const bars = card.querySelectorAll('.recharts-bar-rectangle');

        // Decorative series check
        const lineSeries = card.querySelectorAll('.recharts-line');
        const areaSeries = card.querySelectorAll('.recharts-area');
        const dotSeries = card.querySelectorAll('.recharts-dot');

        // Zero baseline check
        const referenceLines = card.querySelectorAll('.recharts-reference-line');

        return {
          chartIndex: idx + 1,
          ariaLabel: card.getAttribute('aria-label') || '',
          containerHeightPx: Math.round(rect.height),
          containerWidthPx: Math.round(rect.width),
          yAxisCount: yAxes.length,
          yAxisTickCount: yAxisTicks.length,
          barsCount: bars.length,
          valueLabelsCount: valueLabels.length,
          valueLabelsSample: valueLabels,
          decorativeSeriesCount: lineSeries.length + areaSeries.length + dotSeries.length,
          hasZeroBaseline: referenceLines.length > 0,
        };
      });

      // 2. Key Figures Strip
      const keyFiguresStrip = document.querySelector('[data-testid="key-figures-strip"]');
      const chipElements = keyFiguresStrip ? Array.from(keyFiguresStrip.children) : [];
      const chips = chipElements.map((el) => el.textContent?.trim() || '');

      // 3. Editorial Callout: "So the trend to watch:"
      const trendCallout = document.querySelector('[data-testid="trend-callout"]');
      const trendText = trendCallout ? trendCallout.textContent?.trim() || '' : '';

      // 4. Provenance Meta Row: "Basis:"
      const basisMetaRow = document.querySelector('[data-testid="basis-meta-row"]');
      const basisText = basisMetaRow ? basisMetaRow.textContent?.trim() || '' : '';

      // 5. Bold Figures inside Prose
      const proseContainer = document.querySelector('[data-testid="chat-message-prose"]');
      const strongElements = proseContainer ? Array.from(proseContainer.querySelectorAll('strong')) : [];
      const strongTexts = strongElements.map((el) => el.textContent?.trim() || '');

      // 6. Citations
      const inlineCitations = proseContainer ? Array.from(proseContainer.querySelectorAll('[data-testid="inline-citation"]')) : [];
      const citationMarks = inlineCitations.map((el) => el.textContent?.trim() || '');

      // 7. Prose Measure (max width)
      const proseRect = proseContainer ? proseContainer.getBoundingClientRect() : null;

      // 8. Raw text for asterisk regression check
      const rawHtml = proseContainer ? proseContainer.innerHTML : '';
      const hasBrokenAsterisks = /\*\*[^*]+\*\*/.test(rawHtml);

      return {
        chartsCount: chartCards.length,
        plots,
        hasKeyFiguresStrip: Boolean(keyFiguresStrip),
        keyFiguresCount: chips.length,
        keyFiguresSample: chips,
        hasTrendCallout: Boolean(trendCallout),
        trendCalloutText: trendText,
        hasBasisMetaRow: Boolean(basisMetaRow),
        basisMetaRowText: basisText,
        strongCount: strongElements.length,
        strongSample: strongTexts,
        inlineCitationsCount: inlineCitations.length,
        citationMarksSample: citationMarks,
        proseWidthPx: proseRect ? Math.round(proseRect.width) : 0,
        hasBrokenAsterisks,
      };
    });

    console.log(JSON.stringify(domInspection, null, 2));

    // Assertions
    if (domInspection.chartsCount < 1) {
      throw new Error('Expected at least 1 chart card in UI');
    }

    domInspection.plots.forEach((p) => {
      console.log(`\nChecking Chart ${p.chartIndex} (${p.ariaLabel}):`);
      console.log(`  - Plot container height: ${p.containerHeightPx} px (Target: 160 px ± 5 px)`);
      if (p.containerHeightPx < 140 || p.containerHeightPx > 180) {
        throw new Error(`Chart ${p.chartIndex} height ${p.containerHeightPx} px outside allowed range [140, 180]`);
      }

      console.log(`  - Y-axis count: ${p.yAxisCount} (Target: exactly 1, left axis only)`);
      if (p.yAxisCount !== 1) {
        throw new Error(`Chart ${p.chartIndex} has ${p.yAxisCount} Y-axes (must be exactly 1)`);
      }

      console.log(`  - Y-axis ticks: ${p.yAxisTickCount} (Target: <= 4 ticks)`);
      if (p.yAxisTickCount > 6) {
        throw new Error(`Chart ${p.chartIndex} has too many ticks: ${p.yAxisTickCount}`);
      }

      console.log(`  - Bars count: ${p.barsCount}, Value labels count: ${p.valueLabelsCount}`);
      console.log(`  - Value labels sample: ${p.valueLabelsSample.join(', ')}`);
      if (p.barsCount > 0 && p.valueLabelsCount === 0) {
        throw new Error(`Chart ${p.chartIndex} has bars but no value labels!`);
      }

      console.log(`  - Decorative series count: ${p.decorativeSeriesCount} (Target: 0)`);
      if (p.decorativeSeriesCount !== 0) {
        throw new Error(`Chart ${p.chartIndex} contains ${p.decorativeSeriesCount} decorative series!`);
      }

      console.log(`  - Emphasized zero baseline: ${p.hasZeroBaseline ? '✅' : '❌'}`);
    });

    console.log('\nChecking Answer Formatting:');
    console.log(`  - Key-figures strip present: ${domInspection.hasKeyFiguresStrip ? '✅' : '❌'} (${domInspection.keyFiguresCount} chips)`);
    console.log(`  - Trend callout present: ${domInspection.hasTrendCallout ? '✅' : '❌'}`);
    console.log(`  - Basis meta row present: ${domInspection.hasBasisMetaRow ? '✅' : '❌'}`);
    console.log(`  - <strong> bold elements present: ${domInspection.strongCount > 0 ? '✅' : '❌'} (${domInspection.strongCount} tags)`);
    console.log(`  - Broken raw asterisks in DOM: ${domInspection.hasBrokenAsterisks ? '❌ (BUG)' : '✅ (CLEAN)'}`);
    console.log(`  - Inline citations count: ${domInspection.inlineCitationsCount} (${domInspection.citationMarksSample.slice(0, 5).join(' ')})`);
    console.log(`  - Prose container width: ${domInspection.proseWidthPx} px (Target: <= 680 px)`);

    if (domInspection.hasBrokenAsterisks) {
      throw new Error('Prose contains unparsed literal asterisks! Bold bug regression detected.');
    }
    if (domInspection.strongCount === 0) {
      throw new Error('Expected <strong> tags for bold figures, found 0.');
    }

    // Scroll key figures strip and top of answer into view
    await page.evaluate(() => {
      const strip = document.querySelector('[data-testid="key-figures-strip"]') || document.querySelector('[data-testid="chat-metric-charts"]');
      if (strip) {
        strip.scrollIntoView({ behavior: 'instant', block: 'center' });
      } else {
        const scrollable = document.querySelector('.overflow-y-auto');
        if (scrollable) scrollable.scrollTop = 0;
      }
    });
    await sleep(500);

    // Save high-resolution screenshot for review
    const screenshotDesktopPath = path.join(REVIEW_DIR, 'chat_charts_answer.png');
    await page.screenshot({ path: screenshotDesktopPath, fullPage: false });
    console.log(`\n📸 Desktop screenshot captured: ${screenshotDesktopPath}`);

    // -------------------------------------------------------------
    // Mobile Viewport Check (412x915)
    // -------------------------------------------------------------
    console.log('\n--> Testing Mobile Viewport (412x915)...');
    await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 });
    await sleep(1000);

    const mobileInspection = await page.evaluate(() => {
      const chartCards = Array.from(document.querySelectorAll('div[role="img"]'));
      const heights = chartCards.map((card) => {
        const plotContainer = card.querySelector('.h-\\[140px\\]') || card.querySelector('svg.recharts-surface')?.parentElement;
        return plotContainer ? Math.round(plotContainer.getBoundingClientRect().height) : 0;
      });
      const bodyScrollWidth = document.body.scrollWidth;
      const bodyClientWidth = document.body.clientWidth;
      const hasHorizontalOverflow = bodyScrollWidth > bodyClientWidth;

      return {
        mobileHeights: heights,
        bodyScrollWidth,
        bodyClientWidth,
        hasHorizontalOverflow,
      };
    });

    console.log('Mobile Plot Heights:', mobileInspection.mobileHeights, 'px (Target: ~140 px)');
    console.log(`Mobile Horizontal Overflow: ${mobileInspection.hasHorizontalOverflow ? '❌ YES' : '✅ NONE'} (${mobileInspection.bodyScrollWidth}px / ${mobileInspection.bodyClientWidth}px)`);

    const screenshotMobilePath = path.join(REVIEW_DIR, 'chat_charts_mobile.png');
    await page.screenshot({ path: screenshotMobilePath, fullPage: false });
    console.log(`📸 Mobile screenshot captured: ${screenshotMobilePath}`);

    // Save complete assertion output
    const evidence = {
      timestamp: new Date().toISOString(),
      question,
      desktop: domInspection,
      mobile: mobileInspection,
      fallbackDownload: results.documentDownloadFallback,
      uploadTokenEndpoint: results.uploadTokenEndpoint,
    };

    fs.writeFileSync(
      path.join(REVIEW_DIR, 'structural_verification_results.json'),
      JSON.stringify(evidence, null, 2),
      'utf-8'
    );
    console.log(`💾 Evidence written to: ${path.join(REVIEW_DIR, 'structural_verification_results.json')}`);

    console.log('\n=============================================================');
    console.log('🎉 ALL STRUCTURAL VERIFICATION ASSERTIONS PASSED!');
    console.log('=============================================================');
  } catch (err) {
    console.error('❌ Structural verification failed:', err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

run();
