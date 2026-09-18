import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { verifySession } from '@/lib/auth';
import { SESSION_COOKIE_NAME, UPLOAD_MAX_BYTES_BLOB } from '@/lib/constants';
import { apiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(sessionCookie);

  if (!session) {
    return apiError('UNAUTHORIZED', 'Authentication required for upload token.', 401);
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return apiError('BAD_REQUEST', 'Invalid upload request body.', 400);
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let payload: { companyId?: string } = {};
        if (clientPayload) {
          try {
            payload = JSON.parse(clientPayload);
          } catch {
            // ignore
          }
        }

        return {
          allowedContentTypes: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'application/pdf',
            'application/octet-stream',
          ],
          maximumSizeInBytes: UPLOAD_MAX_BYTES_BLOB,
          validUntil: Date.now() + 10 * 60 * 1000,
          tokenPayload: JSON.stringify({
            companyId: payload.companyId,
            username: session.username,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Client completes registration via POST /api/documents
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error('Vercel Blob handleUpload error:', error);
    return apiError('INTERNAL_SERVER_ERROR', (error as Error).message, 500);
  }
}
