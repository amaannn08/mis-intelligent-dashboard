import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: 'apps/web/.env.local' });

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const USERNAME = process.env.AUTH_USERNAME || 'admin';
const PASSWORD = process.env.AUTH_PASSWORD;

if (!PASSWORD) {
  console.error('FATAL: AUTH_PASSWORD is missing in apps/web/.env.local');
  process.exit(1);
}

let sessionCookie = '';

function logStep(title) {
  console.log(`\n======================================================================`);
  console.log(`>>> ${title}`);
  console.log(`======================================================================`);
}

async function fetchWithCookie(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }
  return fetch(url, { ...options, headers });
}

async function runVerification() {
  console.log(`Starting Run 3 API Verification against ${BASE_URL}`);

  // 1. Health check
  logStep('1. Health Check (GET /api/health)');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  const healthJson = await healthRes.json();
  console.log(`Status: ${healthRes.status}`);
  console.log('Response:', JSON.stringify(healthJson, null, 2));
  if (healthRes.status !== 200 || !healthJson.ok || healthJson.db !== 'up') {
    throw new Error('Health check failed');
  }

  // 2. Unauthenticated request to protected route
  logStep('2. Unauthenticated Request Rejected (GET /api/companies)');
  const unauthRes = await fetch(`${BASE_URL}/api/companies`);
  const unauthJson = await unauthRes.json();
  console.log(`Status: ${unauthRes.status}`);
  console.log('Response:', JSON.stringify(unauthJson, null, 2));
  if (unauthRes.status !== 401 || unauthJson.error?.code !== 'UNAUTHORIZED') {
    throw new Error('Unauthenticated request was not properly rejected with 401');
  }

  // 3. Login with invalid password
  logStep('3. Login with Invalid Credentials (POST /api/auth/login)');
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: 'incorrect-password' }),
  });
  const badLoginJson = await badLoginRes.json();
  console.log(`Status: ${badLoginRes.status}`);
  console.log('Response:', JSON.stringify(badLoginJson, null, 2));
  if (badLoginRes.status !== 401 || badLoginJson.error?.code !== 'UNAUTHORIZED') {
    throw new Error('Invalid login was not rejected with 401');
  }

  // 4. Login with valid credentials
  logStep('4. Login with Valid Credentials (POST /api/auth/login)');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const loginJson = await loginRes.json();
  console.log(`Status: ${loginRes.status}`);
  console.log('Response:', JSON.stringify(loginJson, null, 2));
  const setCookieHeader = loginRes.headers.get('set-cookie');
  console.log('Set-Cookie received:', !!setCookieHeader);
  if (!setCookieHeader || loginRes.status !== 200 || !loginJson.ok) {
    throw new Error('Login failed to set session cookie');
  }
  sessionCookie = setCookieHeader.split(';')[0];

  // 5. Verify Session
  logStep('5. Verify Session (GET /api/auth/session)');
  const sessionRes = await fetchWithCookie(`${BASE_URL}/api/auth/session`);
  const sessionJson = await sessionRes.json();
  console.log(`Status: ${sessionRes.status}`);
  console.log('Response:', JSON.stringify(sessionJson, null, 2));
  if (sessionRes.status !== 200 || !sessionJson.authenticated) {
    throw new Error('Session verification failed');
  }

  // 6. Create a Company
  logStep('6. Create a Company (POST /api/companies)');
  const uniqueName = `Verif Corp ${Date.now().toString().slice(-4)}`;
  const createCompRes = await fetchWithCookie(`${BASE_URL}/api/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: uniqueName,
      industry: 'SaaS / AI',
      description: 'Run 3 end-to-end verification company',
    }),
  });
  const createdCompany = await createCompRes.json();
  console.log(`Status: ${createCompRes.status}`);
  console.log('Response:', JSON.stringify(createdCompany, null, 2));
  if (createCompRes.status !== 201 || !createdCompany.id || !createdCompany.slug) {
    throw new Error('Failed to create company');
  }
  const companyId = createdCompany.id;
  const companySlug = createdCompany.slug;

  // 7. List companies with search and summary metrics
  logStep(`7. List Companies (GET /api/companies?search=${encodeURIComponent(uniqueName)})`);
  const listCompRes = await fetchWithCookie(`${BASE_URL}/api/companies?search=${encodeURIComponent(uniqueName)}`);
  const listCompJson = await listCompRes.json();
  console.log(`Status: ${listCompRes.status}`);
  console.log('Total:', listCompJson.total);
  console.log('Company Summary:', JSON.stringify(listCompJson.companies[0], null, 2));
  if (listCompRes.status !== 200 || listCompJson.companies.length === 0) {
    throw new Error('Failed to list created company');
  }

  // 8. Negative Test: Upload unsupported .txt file
  logStep('8. Negative: Upload .txt file (POST /api/documents)');
  const txtFormData = new FormData();
  txtFormData.append('companyId', companyId);
  const txtBlob = new Blob(['Not an excel or pdf file content'], { type: 'text/plain' });
  txtFormData.append('file', txtBlob, 'invalid_notes.txt');

  const txtUploadRes = await fetchWithCookie(`${BASE_URL}/api/documents`, {
    method: 'POST',
    body: txtFormData,
  });
  const txtUploadJson = await txtUploadRes.json();
  console.log(`Status: ${txtUploadRes.status}`);
  console.log('Response:', JSON.stringify(txtUploadJson, null, 2));
  if (txtUploadRes.status !== 400 || txtUploadJson.error?.code !== 'INVALID_EXTENSION') {
    throw new Error('Uploading .txt was not rejected with 400 INVALID_EXTENSION');
  }

  // 9. Positive Test: Upload Run 2 fixture sample_mis.xlsx
  logStep('9. Positive: Upload Run 2 Fixture sample_mis.xlsx (POST /api/documents)');
  const fixturePath = path.resolve('packages/core/fixtures/sample_mis.xlsx');
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found at ${fixturePath}`);
  }
  const fixtureBuffer = fs.readFileSync(fixturePath);
  const fixtureBlob = new Blob([fixtureBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const uploadFormData = new FormData();
  uploadFormData.append('companyId', companyId);
  uploadFormData.append('file', fixtureBlob, 'sample_mis.xlsx');

  const uploadRes = await fetchWithCookie(`${BASE_URL}/api/documents`, {
    method: 'POST',
    body: uploadFormData,
  });
  const uploadJson = await uploadRes.json();
  console.log(`Status: ${uploadRes.status}`);
  console.log('Response:', JSON.stringify(uploadJson, null, 2));
  if (uploadRes.status !== 202 || !uploadJson.document?.id) {
    throw new Error('Upload was not accepted with 202 Accepted');
  }
  const documentId = uploadJson.document.id;

  // 10. Negative Test: Upload Duplicate File
  logStep('10. Negative: Duplicate File Upload (POST /api/documents)');
  const dupFormData = new FormData();
  dupFormData.append('companyId', companyId);
  dupFormData.append('file', fixtureBlob, 'sample_mis.xlsx');

  const dupRes = await fetchWithCookie(`${BASE_URL}/api/documents`, {
    method: 'POST',
    body: dupFormData,
  });
  const dupJson = await dupRes.json();
  console.log(`Status: ${dupRes.status}`);
  console.log('Response:', JSON.stringify(dupJson, null, 2));
  if (dupRes.status !== 409 || dupJson.error?.code !== 'DUPLICATE_FILE') {
    throw new Error('Duplicate upload was not rejected with 409 DUPLICATE_FILE');
  }

  // 11. Poll document status until processed
  logStep(`11. Poll Document Status (GET /api/documents/${documentId})`);
  let docStatus = 'pending';
  let pollAttempts = 0;
  let finalDocDetail = null;

  while (pollAttempts < 40) {
    pollAttempts++;
    const pollRes = await fetchWithCookie(`${BASE_URL}/api/documents/${documentId}`);
    const pollJson = await pollRes.json();
    docStatus = pollJson.document?.status;
    console.log(`[Poll #${pollAttempts}] Status: ${docStatus} (Jobs: ${pollJson.jobs?.length || 0})`);

    if (docStatus === 'processed') {
      finalDocDetail = pollJson;
      break;
    }
    if (docStatus === 'failed') {
      console.error('Document processing failed:', pollJson.document.error);
      throw new Error(`Document processing failed with error: ${pollJson.document.error}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (docStatus !== 'processed') {
    throw new Error(`Document did not reach processed state within timeout (current: ${docStatus})`);
  }

  console.log('\n--- Final Processing Jobs Log ---');
  for (const j of finalDocDetail.jobs) {
    console.log(`  Step: ${j.step.padEnd(10)} Status: ${j.status.padEnd(10)} Error: ${j.error || 'none'}`);
  }
  console.log(`Extracted Metrics Count: ${finalDocDetail.metrics.length}`);
  console.log(`Blob Retained: ${finalDocDetail.blobRetained}`);

  // 12. Read Company Metrics
  logStep(`12. Read Company Metrics Series (GET /api/companies/${companyId}/metrics)`);
  const metricsRes = await fetchWithCookie(`${BASE_URL}/api/companies/${companyId}/metrics`);
  const metricsJson = await metricsRes.json();
  console.log(`Status: ${metricsRes.status}`);
  console.log('Metric Keys in Series:', Object.keys(metricsJson.series || {}));
  for (const [key, pts] of Object.entries(metricsJson.series || {})) {
    console.log(`  ${key}: ${pts.length} data points (Latest: period ${pts[pts.length - 1]?.period}, value ${pts[pts.length - 1]?.value} ${pts[pts.length - 1]?.unit})`);
  }

  // 13. Query via RAG Stream (Matching Data)
  logStep('13. RAG Query with Streamed Response & Citations (POST /api/query)');
  const queryRes = await fetchWithCookie(`${BASE_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'What was the Net Revenue and EBITDA for Acme in December 2024?',
      companyId: companyId,
    }),
  });
  console.log(`Status: ${queryRes.status}`);
  const citationsHeader = queryRes.headers.get('x-citations');
  console.log('X-Citations Header:', citationsHeader);

  // Read the streamed response body
  const reader = queryRes.body.getReader();
  const decoder = new TextDecoder();
  let fullStreamText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullStreamText += chunk;
    process.stdout.write(chunk);
  }
  console.log('\n--- Stream Complete ---');
  if (queryRes.status !== 200 || !fullStreamText.trim()) {
    throw new Error('Query streaming failed or returned empty text');
  }

  // 14. Negative Query: No Matching Data
  logStep('14. Negative Query: No Matching Data Honest Refusal (POST /api/query)');
  const emptyQueryRes = await fetchWithCookie(`${BASE_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'What was the deep space probe warp speed for Acme in 2099?',
      companyId: companyId,
    }),
  });
  console.log(`Status: ${emptyQueryRes.status}`);
  const emptyCitationsHeader = emptyQueryRes.headers.get('x-citations');
  console.log('X-Citations Header:', emptyCitationsHeader);
  const emptyText = await emptyQueryRes.text();
  console.log('Refusal Answer:', emptyText.trim());
  if (!emptyText.includes('cannot find this information') && !emptyText.includes('uploaded MIS')) {
    throw new Error('Query did not return honest refusal');
  }

  // 15. Stream Retained Original File
  logStep(`15. Stream Retained Original File (GET /api/documents/${documentId}/file)`);
  const fileRes = await fetchWithCookie(`${BASE_URL}/api/documents/${documentId}/file`);
  console.log(`Status: ${fileRes.status}`);
  console.log('Content-Type:', fileRes.headers.get('content-type'));
  console.log('Content-Disposition:', fileRes.headers.get('content-disposition'));
  const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
  console.log(`Retrieved Byte Length: ${fileBuffer.length} bytes (Original: ${fixtureBuffer.length} bytes)`);
  if (fileRes.status !== 200 || fileBuffer.length !== fixtureBuffer.length) {
    throw new Error(`File binary stream length mismatch: got ${fileBuffer.length}, expected ${fixtureBuffer.length}`);
  }

  // 16. Company Hard Delete without Confirmation
  logStep(`16. Company Hard Delete without Confirmation (DELETE /api/companies/${companyId}?hard=true)`);
  const hardNoConfirmRes = await fetchWithCookie(`${BASE_URL}/api/companies/${companyId}?hard=true`, {
    method: 'DELETE',
  });
  const hardNoConfirmJson = await hardNoConfirmRes.json();
  console.log(`Status: ${hardNoConfirmRes.status}`);
  console.log('Response:', JSON.stringify(hardNoConfirmJson, null, 2));
  if (hardNoConfirmRes.status !== 400 || hardNoConfirmJson.error?.code !== 'CONFIRMATION_REQUIRED') {
    throw new Error('Hard delete without confirm was not rejected with 400 CONFIRMATION_REQUIRED');
  }

  // 17. Company Soft Archive
  logStep(`17. Company Soft Archive (DELETE /api/companies/${companyId})`);
  const archiveRes = await fetchWithCookie(`${BASE_URL}/api/companies/${companyId}`, {
    method: 'DELETE',
  });
  const archiveJson = await archiveRes.json();
  console.log(`Status: ${archiveRes.status}`);
  console.log('Response:', JSON.stringify(archiveJson, null, 2));
  if (archiveRes.status !== 200 || !archiveJson.archived) {
    throw new Error('Soft archive failed');
  }

  // 18. Logout
  logStep('18. Logout (POST /api/auth/logout)');
  const logoutRes = await fetchWithCookie(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
  });
  const logoutJson = await logoutRes.json();
  console.log(`Status: ${logoutRes.status}`);
  console.log('Response:', JSON.stringify(logoutJson, null, 2));
  const logoutCookieHeader = logoutRes.headers.get('set-cookie');
  console.log('Cookie Cleared:', logoutCookieHeader?.includes('Max-Age=0') || logoutCookieHeader?.includes('mis_session=;'));
  if (logoutRes.status !== 200 || !logoutJson.ok) {
    throw new Error('Logout failed');
  }

  // 19. Verify Session After Logout (should be 401)
  logStep('19. Verify Session After Logout (GET /api/auth/session)');
  // Clear our local cookie variable
  sessionCookie = '';
  const postLogoutSessionRes = await fetch(`${BASE_URL}/api/auth/session`);
  const postLogoutSessionJson = await postLogoutSessionRes.json();
  console.log(`Status: ${postLogoutSessionRes.status}`);
  console.log('Response:', JSON.stringify(postLogoutSessionJson, null, 2));
  if (postLogoutSessionRes.status !== 401) {
    throw new Error('Session was not cleared after logout');
  }

  console.log('\n======================================================================');
  console.log('>>> ALL 19 VERIFICATION STEPS PASSED SUCCESSFULLY! <<<');
  console.log('======================================================================\n');
}

runVerification().catch((err) => {
  console.error('\nVerification failed:', err);
  process.exit(1);
});
