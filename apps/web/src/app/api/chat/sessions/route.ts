import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess, handleZodError } from '@/lib/api-response';
import { verifySession } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/constants';
import { db, pool, chatSessions, companies } from '@mis/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function checkAuth(request: NextRequest): Promise<boolean> {
  if (request.headers.get('x-user-username')) {
    return true;
  }
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  return Boolean(session);
}

const createSessionSchema = z.object({
  companyId: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
});

export async function GET(request: NextRequest) {
  if (!(await checkAuth(request))) {
    return apiError('UNAUTHORIZED', 'Authentication required.', 401);
  }

  try {
    const query = `
      SELECT 
        s.id,
        s.title,
        s.company_id AS "companyId",
        c.name AS "companyName",
        s.updated_at AS "updatedAt",
        (SELECT COUNT(*)::int FROM chat_messages m WHERE m.session_id = s.id) AS "messageCount",
        (SELECT m2.content FROM chat_messages m2 WHERE m2.session_id = s.id ORDER BY m2.created_at DESC LIMIT 1) AS "lastMessagePreview"
      FROM chat_sessions s
      LEFT JOIN companies c ON c.id = s.company_id
      ORDER BY s.updated_at DESC
      LIMIT 50;
    `;
    const { rows } = await pool.query(query);

    const sessions = rows.map((r: {
      id: string;
      title: string;
      companyId: string | null;
      companyName: string | null;
      updatedAt: Date | string;
      messageCount: number | string;
      lastMessagePreview: string | null;
    }) => ({
      id: r.id,
      title: r.title,
      companyId: r.companyId ?? null,
      companyName: r.companyName ?? null,
      messageCount: Number(r.messageCount) || 0,
      lastMessagePreview: r.lastMessagePreview
        ? r.lastMessagePreview.slice(0, 160).replace(/\s+/g, ' ').trim()
        : null,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    }));

    return apiSuccess({ sessions }, 200);
  } catch (err) {
    console.error('Failed to list chat sessions:', err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve chat sessions.', 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth(request))) {
    return apiError('UNAUTHORIZED', 'Authentication required.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body in request', 400);
  }

  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  const { companyId = null, title } = parsed.data;

  try {
    let companyName: string | null = null;
    if (companyId) {
      const [comp] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId));
      if (!comp) {
        return apiError('BAD_REQUEST', `Company with ID '${companyId}' does not exist.`, 400);
      }
      companyName = comp.name;
    }

    const sessionTitle = title?.trim() || 'New chat';

    const [inserted] = await db
      .insert(chatSessions)
      .values({
        companyId: companyId || null,
        title: sessionTitle,
      })
      .returning();

    return apiSuccess(
      {
        session: {
          id: inserted.id,
          title: inserted.title,
          companyId: inserted.companyId,
          companyName,
        },
      },
      201
    );
  } catch (err) {
    console.error('Failed to create chat session:', err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to create chat session.', 500);
  }
}
