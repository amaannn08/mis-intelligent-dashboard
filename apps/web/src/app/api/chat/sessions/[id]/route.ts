import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess, handleZodError } from '@/lib/api-response';
import { verifySession } from '@/lib/auth';
import { SESSION_COOKIE_NAME } from '@/lib/constants';
import { db, chatSessions, chatMessages, companies } from '@mis/db';
import { asc, eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function checkAuth(request: NextRequest): Promise<boolean> {
  if (request.headers.get('x-user-username')) {
    return true;
  }
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySession(token);
  return Boolean(session);
}

const patchSessionSchema = z.object({
  title: z.string().optional(),
  companyId: z.string().uuid().nullable().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteParams) {
  if (!(await checkAuth(request))) {
    return apiError('UNAUTHORIZED', 'Authentication required.', 401);
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('NOT_FOUND', `Chat session '${id}' not found.`, 404);
  }

  try {
    const [session] = await db
      .select({
        id: chatSessions.id,
        title: chatSessions.title,
        companyId: chatSessions.companyId,
        companyName: companies.name,
        createdAt: chatSessions.createdAt,
        updatedAt: chatSessions.updatedAt,
      })
      .from(chatSessions)
      .leftJoin(companies, eq(companies.id, chatSessions.companyId))
      .where(eq(chatSessions.id, id));

    if (!session) {
      return apiError('NOT_FOUND', `Chat session '${id}' not found.`, 404);
    }

    const messages = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        citations: chatMessages.citations,
        charts: chatMessages.charts,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(asc(chatMessages.createdAt));

    return apiSuccess({ session, messages }, 200);
  } catch (err) {
    console.error(`Failed to get chat session ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve chat session.', 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteParams) {
  if (!(await checkAuth(request))) {
    return apiError('UNAUTHORIZED', 'Authentication required.', 401);
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('NOT_FOUND', `Chat session '${id}' not found.`, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body in request', 400);
  }

  const parsed = patchSessionSchema.safeParse(body);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  try {
    const [existing] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id));

    if (!existing) {
      return apiError('NOT_FOUND', `Chat session '${id}' not found.`, 404);
    }

    let companyName: string | null = null;
    const updateValues: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (parsed.data.title !== undefined) {
      updateValues.title = parsed.data.title.trim();
    }

    if (parsed.data.companyId !== undefined) {
      updateValues.companyId = parsed.data.companyId; // can be null for all portfolio
      if (parsed.data.companyId) {
        const [comp] = await db
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, parsed.data.companyId));
        if (!comp) {
          return apiError('BAD_REQUEST', `Company with ID '${parsed.data.companyId}' does not exist.`, 400);
        }
        companyName = comp.name;
      }
    } else if (existing.companyId) {
      const [comp] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, existing.companyId));
      companyName = comp?.name ?? null;
    }

    const [updated] = await db
      .update(chatSessions)
      .set(updateValues)
      .where(eq(chatSessions.id, id))
      .returning();

    return apiSuccess(
      {
        session: {
          id: updated.id,
          title: updated.title,
          companyId: updated.companyId,
          companyName,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        },
      },
      200
    );
  } catch (err) {
    console.error(`Failed to update chat session ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to update chat session.', 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteParams) {
  if (!(await checkAuth(request))) {
    return apiError('UNAUTHORIZED', 'Authentication required.', 401);
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return apiError('NOT_FOUND', `Chat session '${id}' not found.`, 404);
  }

  try {
    const [deleted] = await db
      .delete(chatSessions)
      .where(eq(chatSessions.id, id))
      .returning({ id: chatSessions.id });

    if (!deleted) {
      return apiError('NOT_FOUND', `Chat session '${id}' not found.`, 404);
    }

    return apiSuccess({ ok: true }, 200);
  } catch (err) {
    console.error(`Failed to delete chat session ${id}:`, err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to delete chat session.', 500);
  }
}
