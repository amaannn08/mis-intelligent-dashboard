import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listSessions, POST as createSession } from '../apps/web/src/app/api/chat/sessions/route.js';
import {
  GET as getSession,
  PATCH as patchSession,
  DELETE as deleteSession,
} from '../apps/web/src/app/api/chat/sessions/[id]/route.js';
import { signSession } from '../apps/web/src/lib/auth.js';
import { SESSION_COOKIE_NAME } from '../apps/web/src/lib/constants.js';

describe('Chat Sessions API: /api/chat/sessions', () => {
  let validToken: string;

  beforeEach(async () => {
    process.env.COOKIE_SECRET = 'test-secret-at-least-32-chars-long-12345';
    validToken = await signSession('wehcrm');
  });

  it('rejects unauthenticated requests to GET and POST sessions with 401', async () => {
    const unauthGet = new NextRequest('http://localhost:3000/api/chat/sessions');
    const resGet = await listSessions(unauthGet);
    expect(resGet.status).toBe(401);
    const bodyGet = await resGet.json();
    expect(bodyGet.error.code).toBe('UNAUTHORIZED');

    const unauthPost = new NextRequest('http://localhost:3000/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: 'Unauthorized' }),
    });
    const resPost = await createSession(unauthPost);
    expect(resPost.status).toBe(401);
  });

  it('creates, reads, patches, and deletes a chat session with full lifecycle', async () => {
    // 1. Create a new session with default title 'New chat'
    const createReq = new NextRequest('http://localhost:3000/api/chat/sessions', {
      method: 'POST',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const createRes = await createSession(createReq);
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.session).toBeDefined();
    expect(createData.session.title).toBe('New chat');
    expect(createData.session.companyId).toBeNull();
    const sessionId = createData.session.id;
    expect(sessionId).toBeDefined();

    // 2. Fetch all sessions - should include newly created session
    const listReq = new NextRequest('http://localhost:3000/api/chat/sessions', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      },
    });
    const listRes = await listSessions(listReq);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(Array.isArray(listData.sessions)).toBe(true);
    const found = listData.sessions.find((s: { id: string }) => s.id === sessionId);
    expect(found).toBeDefined();
    expect(found.title).toBe('New chat');

    // 3. Fetch session detail by ID
    const getReq = new NextRequest(`http://localhost:3000/api/chat/sessions/${sessionId}`, {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      },
    });
    const getRes = await getSession(getReq, { params: Promise.resolve({ id: sessionId }) });
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.session.id).toBe(sessionId);
    expect(Array.isArray(getData.messages)).toBe(true);

    // Verify messages with charts are retrieved and preserved
    const { db, chatMessages } = await import('@mis/db');
    await db.insert(chatMessages).values({
      sessionId,
      role: 'assistant',
      content: 'Revenue was ₹1.5 Cr [1].',
      charts: [
        {
          id: 'revenue-noto',
          metricKey: 'revenue',
          label: 'Net Revenue',
          unit: 'currency',
          series: [
            {
              companyId: null,
              companyName: 'Noto',
              points: [{ period: '2025-06', value: 15000000 }],
            },
          ],
        },
      ],
    });

    const getResWithMsg = await getSession(getReq, { params: Promise.resolve({ id: sessionId }) });
    const dataWithMsg = await getResWithMsg.json();
    expect(dataWithMsg.messages.length).toBeGreaterThan(0);
    const lastMsg = dataWithMsg.messages[dataWithMsg.messages.length - 1];
    expect(lastMsg.charts).toBeDefined();
    expect(Array.isArray(lastMsg.charts)).toBe(true);
    expect(lastMsg.charts[0].metricKey).toBe('revenue');
    expect(lastMsg.charts[0].series[0].points[0].value).toBe(15000000);

    // 4. Update session title and set companyId to null (All portfolio)
    const patchReq = new NextRequest(`http://localhost:3000/api/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Updated Portfolio Analysis',
        companyId: null,
      }),
    });
    const patchRes = await patchSession(patchReq, { params: Promise.resolve({ id: sessionId }) });
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.session.title).toBe('Updated Portfolio Analysis');
    expect(patchData.session.companyId).toBeNull();

    // 5. Delete session
    const delReq = new NextRequest(`http://localhost:3000/api/chat/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      },
    });
    const delRes = await deleteSession(delReq, { params: Promise.resolve({ id: sessionId }) });
    expect(delRes.status).toBe(200);
    const delData = await delRes.json();
    expect(delData.ok).toBe(true);

    // 6. Verify 404 after deletion
    const getAgainRes = await getSession(getReq, { params: Promise.resolve({ id: sessionId }) });
    expect(getAgainRes.status).toBe(404);
    const errBody = await getAgainRes.json();
    expect(errBody.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for non-existent session UUID on GET, PATCH, DELETE', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';
    const req = new NextRequest(`http://localhost:3000/api/chat/sessions/${nonExistentId}`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${validToken}` },
    });

    const getRes = await getSession(req, { params: Promise.resolve({ id: nonExistentId }) });
    expect(getRes.status).toBe(404);

    const patchReq = new NextRequest(`http://localhost:3000/api/chat/sessions/${nonExistentId}`, {
      method: 'PATCH',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Non existent' }),
    });
    const patchRes = await patchSession(patchReq, { params: Promise.resolve({ id: nonExistentId }) });
    expect(patchRes.status).toBe(404);

    const delReq = new NextRequest(`http://localhost:3000/api/chat/sessions/${nonExistentId}`, {
      method: 'DELETE',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${validToken}` },
    });
    const delRes = await deleteSession(delReq, { params: Promise.resolve({ id: nonExistentId }) });
    expect(delRes.status).toBe(404);
  });
});
