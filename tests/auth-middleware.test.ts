import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  signSession,
  verifySession,
  validateCredentials,
} from '../apps/web/src/lib/auth.js';
import { SESSION_COOKIE_NAME } from '../apps/web/src/lib/constants.js';
import { middleware } from '../apps/web/src/middleware.js';

describe('Auth & Session Tokens', () => {
  beforeEach(() => {
    process.env.COOKIE_SECRET = 'test-secret-at-least-32-chars-long-12345';
    process.env.AUTH_USERNAME = 'wehcrm';
    process.env.AUTH_PASSWORD = 'CorrectHorseBatteryStaple123!';
  });

  it('creates and verifies a valid signed session token', async () => {
    const token = await signSession('wehcrm');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(2);

    const session = await verifySession(token);
    expect(session).not.toBeNull();
    expect(session?.username).toBe('wehcrm');
    expect(session?.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('rejects tampered session tokens', async () => {
    const validToken = await signSession('wehcrm');
    const [payload, sig] = validToken.split('.');

    // Tamper with payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({ username: 'admin_attacker', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');

    const tamperedToken = `${tamperedPayload}.${sig}`;
    const result = await verifySession(tamperedToken);
    expect(result).toBeNull();
  });

  it('rejects invalid or garbage tokens', async () => {
    expect(await verifySession('')).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession('not-a-valid-token')).toBeNull();
    expect(await verifySession('payload.invalid-sig-here')).toBeNull();
  });

  it('validates credentials securely in constant time', async () => {
    expect(await validateCredentials('wehcrm', 'CorrectHorseBatteryStaple123!')).toBe(true);
    expect(await validateCredentials('wehcrm', 'WrongPassword')).toBe(false);
    expect(await validateCredentials('wronguser', 'CorrectHorseBatteryStaple123!')).toBe(false);
    expect(await validateCredentials('', '')).toBe(false);
  });
});

describe('Middleware: Route Protection & Gating', () => {
  it('allows public endpoints without authentication', async () => {
    // /api/health
    const healthReq = new NextRequest('http://localhost:3000/api/health');
    const healthRes = await middleware(healthReq);
    expect(healthRes.status).toBe(200);
    expect(healthRes.headers.get('location')).toBeNull();

    // /api/auth/login
    const loginApiReq = new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
    });
    const loginApiRes = await middleware(loginApiReq);
    expect(loginApiRes.status).toBe(200);

    // /login page
    const loginPageReq = new NextRequest('http://localhost:3000/login');
    const loginPageRes = await middleware(loginPageReq);
    expect(loginPageRes.status).toBe(200);
  });

  it('allows static assets without authentication', async () => {
    const staticReq = new NextRequest('http://localhost:3000/_next/static/chunks/main.js');
    const staticRes = await middleware(staticReq);
    expect(staticRes.status).toBe(200);

    const iconReq = new NextRequest('http://localhost:3000/favicon.ico');
    const iconRes = await middleware(iconReq);
    expect(iconRes.status).toBe(200);
  });

  it('rejects unauthenticated API requests with 401 JSON error envelope', async () => {
    const apiReq = new NextRequest('http://localhost:3000/api/companies');
    const apiRes = await middleware(apiReq);

    expect(apiRes.status).toBe(401);
    const body = await apiRes.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toContain('Authentication required');

    // Chat sessions API must also be strictly protected
    const chatReq = new NextRequest('http://localhost:3000/api/chat/sessions');
    const chatRes = await middleware(chatReq);
    expect(chatRes.status).toBe(401);
    const chatBody = await chatRes.json();
    expect(chatBody.error.code).toBe('UNAUTHORIZED');

    const chatDetailReq = new NextRequest('http://localhost:3000/api/chat/sessions/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    const chatDetailRes = await middleware(chatDetailReq);
    expect(chatDetailRes.status).toBe(401);
  });

  it('redirects unauthenticated page requests to /login with return target', async () => {
    const pageReq = new NextRequest('http://localhost:3000/companies/noto');
    const pageRes = await middleware(pageReq);

    expect(pageRes.status).toBe(307); // NextResponse.redirect
    const location = pageRes.headers.get('location');
    expect(location).toContain('/login?from=%2Fcompanies%2Fnoto');
  });

  it('allows authenticated requests with valid session cookie and injects username header', async () => {
    const validToken = await signSession('wehcrm');

    const authReq = new NextRequest('http://localhost:3000/api/companies', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
      },
    });

    const authRes = await middleware(authReq);
    expect(authRes.status).toBe(200);
    expect(authRes.headers.get('location')).toBeNull();
    // Next.js middleware rewrites request headers via x-middleware-request-* on the response
    const userHeader =
      authRes.headers.get('x-middleware-request-x-user-username') ||
      authRes.headers.get('x-user-username');
    expect(userHeader).toBe('wehcrm');
  });
});
