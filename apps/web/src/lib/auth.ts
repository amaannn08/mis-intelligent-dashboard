import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './constants';

export interface SessionPayload {
  username: string;
  iat: number;
  exp: number;
}

/**
 * Hash a string to a 32-byte SHA-256 Uint8Array using Web Crypto API.
 */
async function sha256Bytes(str: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(str));
  return new Uint8Array(hashBuf);
}

/**
 * Constant-time comparison of two strings using SHA-256 pre-hashing and constant-time XOR.
 * Immune to length-based timing attacks. Runs in Node.js and Edge Runtime.
 */
export async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  const hashA = await sha256Bytes(a);
  const hashB = await sha256Bytes(b);
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) {
    diff |= hashA[i] ^ hashB[i];
  }
  return diff === 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Create a signed session token: <payloadBase64Url>.<signatureBase64Url>
 */
export async function signSession(username: string): Promise<string> {
  const secret = process.env.COOKIE_SECRET;
  if (!secret) {
    throw new Error('COOKIE_SECRET environment variable is missing.');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    username,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };

  const payloadJson = JSON.stringify(payload);
  const enc = new TextEncoder();
  const payloadBytes = enc.encode(payloadJson);
  const payloadB64 = base64UrlEncode(payloadBytes);

  const key = await getHmacKey(secret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuf));

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify a signed session token. Returns the decoded SessionPayload if valid and not expired, or null.
 */
export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;

  const secret = process.env.COOKIE_SECRET;
  if (!secret) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await getHmacKey(secret);
    const enc = new TextEncoder();
    const sigBytes = base64UrlDecode(sigB64);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      enc.encode(payloadB64)
    );

    if (!isValid) return null;

    const payloadBytes = base64UrlDecode(payloadB64);
    const dec = new TextDecoder();
    const payload: SessionPayload = JSON.parse(dec.decode(payloadBytes));

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Validate credentials against AUTH_USERNAME and AUTH_PASSWORD in constant time.
 */
export async function validateCredentials(username: string, password: string): Promise<boolean> {
  const expectedUsername = process.env.AUTH_USERNAME || 'admin';
  const expectedPassword = process.env.AUTH_PASSWORD;

  if (!expectedPassword) {
    console.error('AUTH_PASSWORD environment variable is not configured.');
    return false;
  }

  const usernameMatches = await timingSafeStringEqual(username, expectedUsername);
  const passwordMatches = await timingSafeStringEqual(password, expectedPassword);

  return usernameMatches && passwordMatches;
}

export function getSessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
