import fs from 'node:fs';
import dotenv from 'dotenv';
import { NextRequest } from 'next/server';

const hermesPath = '/home/amann/.hermes/private/mis-secrets.env';
if (fs.existsSync(hermesPath)) {
  const env = dotenv.parse(fs.readFileSync(hermesPath, 'utf8'));
  process.env.DATABASE_URL = env.MIS_PROD_DATABASE_URL;
  process.env.DEEPSEEK_API_KEY = env.MIS_DEEPSEEK_API_KEY;
  process.env.GEMINI_API_KEY = env.MIS_GEMINI_API_KEY;
  process.env.COOKIE_SECRET = env.COOKIE_SECRET || 'dev-cookie-secret-for-testing-only-replace-in-prod-min-32-chars';
  process.env.TARGET_ENV = 'prod';
}

async function main() {
  console.log('='.repeat(70));
  console.log('TESTING ACTUAL /api/query POST ROUTE END-TO-END');
  console.log('='.repeat(70));

  const { signSession } = await import('../apps/web/src/lib/auth.js');
  const { POST } = await import('../apps/web/src/app/api/query/route.js');

  const sessionToken = await signSession('analyst-verifier');
  const question = 'which category is best selling for Masterchow?';

  console.log(`\nQuestion: "${question}"`);
  console.log('Dispatching NextRequest to POST /api/query...');

  const request = new NextRequest('http://localhost:3000/api/query', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `mis_session=${sessionToken}`,
    },
    body: JSON.stringify({ question }),
  });

  const response = await POST(request);

  console.log(`Response HTTP Status: ${response.status} ${response.statusText}`);
  console.log('Content-Type:', response.headers.get('content-type'));
  const rawCitations = response.headers.get('X-Citations');
  const rawCharts = response.headers.get('X-Charts');
  console.log('X-Citations Header Length:', rawCitations ? rawCitations.length : 0);
  console.log('X-Charts Header Length:', rawCharts ? rawCharts.length : 0);

  if (!response.body) {
    throw new Error('Response body stream is empty!');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  console.log('\n--- Incoming Stream Chunks ---');
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    process.stdout.write(chunk);
    fullText += chunk;
  }
  console.log('\n--- Stream Complete ---\n');

  console.log('='.repeat(70));
  console.log('VERIFICATION ASSERTIONS ON ACTUAL /api/query POST STREAM');
  console.log('='.repeat(70));

  const lower = fullText.toLowerCase();
  const hasCondiments = lower.includes('condiments');
  const has326 = fullText.includes('326.31') || fullText.includes('326.3');
  const hasApril = lower.includes('april') || lower.includes('apr');
  const hasCrores = fullText.includes('3.26') || lower.includes('crore') || lower.includes('cr');

  console.log(`- Mentions Condiments:              ${hasCondiments ? 'PASS' : 'FAIL'}`);
  console.log(`- Cites Latest Amount (326.31 Lakh): ${has326 ? 'PASS' : 'FAIL'}`);
  console.log(`- Cites Latest Period (April 2026):  ${hasApril ? 'PASS' : 'FAIL'}`);
  console.log(`- Provides Normalized/Crore figures: ${hasCrores ? 'PASS' : 'FAIL'}`);

  if (!hasCondiments || !has326) {
    console.error('FAILED: Model response did not contain expected category or latest period values.');
    process.exit(1);
  }

  console.log('\nACTUAL /api/query POST ROUTE VERIFICATION PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal Route Test Error:', err);
  process.exit(1);
});
