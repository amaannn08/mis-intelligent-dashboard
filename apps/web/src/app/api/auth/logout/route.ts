import { NextResponse } from 'next/server';
import { getSessionCookieOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieOpts = getSessionCookieOptions();

  const response = NextResponse.json({ ok: true }, { status: 200 });

  response.cookies.set({
    name: cookieOpts.name,
    value: '',
    httpOnly: cookieOpts.httpOnly,
    secure: cookieOpts.secure,
    sameSite: cookieOpts.sameSite,
    path: cookieOpts.path,
    maxAge: 0,
  });

  return response;
}
