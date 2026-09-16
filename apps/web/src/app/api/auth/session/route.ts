import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api-response';
import { verifySession } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);

  if (!session) {
    return apiError('UNAUTHORIZED', 'Not authenticated.', 401);
  }

  return NextResponse.json(
    {
      authenticated: true,
      user: {
        username: session.username,
      },
    },
    { status: 200 }
  );
}
