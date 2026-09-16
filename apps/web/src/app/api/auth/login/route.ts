import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, handleZodError } from '@/lib/api-response';
import { getSessionCookieOptions, signSession, validateCredentials } from '@/lib/auth';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body in request', 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  const { username, password } = parsed.data;
  const isValid = await validateCredentials(username, password);

  if (!isValid) {
    return apiError('UNAUTHORIZED', 'Invalid username or password.', 401);
  }

  try {
    const token = await signSession(username);
    const cookieOpts = getSessionCookieOptions();

    const response = NextResponse.json(
      {
        ok: true,
        user: { username },
      },
      { status: 200 }
    );

    response.cookies.set({
      name: cookieOpts.name,
      value: token,
      httpOnly: cookieOpts.httpOnly,
      secure: cookieOpts.secure,
      sameSite: cookieOpts.sameSite,
      path: cookieOpts.path,
      maxAge: cookieOpts.maxAge,
    });

    return response;
  } catch (err: unknown) {
    console.error('Session signing failed:', err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to issue session token.', 500);
  }
}
