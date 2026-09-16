import { NextRequest } from 'next/server';
import { z } from 'zod';
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { apiError, handleZodError } from '@/lib/api-response';
import {
  buildRAGContext,
  extractCitations,
  retrieveRelevantChunks,
} from '@mis/core';
import { db, chatSessions, chatMessages } from '@mis/db';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  companyId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body in request', 400);
  }

  const parsed = querySchema.safeParse(body);
  if (!parsed.success) {
    return handleZodError(parsed.error);
  }

  const { question, companyId, sessionId } = parsed.data;

  // 1. Retrieve relevant document chunks via @mis/core
  let rows;
  try {
    rows = await retrieveRelevantChunks({
      question,
      companyId,
      topK: 8,
      minSimilarity: 0.60,
    });
  } catch (err: unknown) {
    console.error('Failed to retrieve chunks for query:', err);
    return apiError('INTERNAL_SERVER_ERROR', 'Failed to retrieve context for query.', 500);
  }

  // 2. Handle empty retrieval: honest "not found" refusal
  if (!rows || rows.length === 0) {
    const refusalText = 'I cannot find this information in the uploaded MIS reports.';

    if (sessionId) {
      try {
        const [existing] = await db
          .select({ id: chatSessions.id })
          .from(chatSessions)
          .where(eq(chatSessions.id, sessionId));

        if (!existing) {
          await db.insert(chatSessions).values({
            id: sessionId,
            companyId: companyId || null,
            title: question.slice(0, 80),
          });
        }

        await db.insert(chatMessages).values([
          {
            sessionId,
            role: 'user',
            content: question,
            citations: [],
          },
          {
            sessionId,
            role: 'assistant',
            content: refusalText,
            citations: [],
          },
        ]);
      } catch (err) {
        console.error('Failed to persist chat session refusal:', err);
      }
    }

    return new Response(refusalText, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Citations': '[]',
      },
    });
  }

  // 3. Build grounded RAG context and system prompt via @mis/core
  const { systemPrompt, allCitations } = buildRAGContext(rows);

  const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekApiKey) {
    return apiError('AI_FAILURE', 'Missing DEEPSEEK_API_KEY in server environment.', 500);
  }

  const deepseek = createOpenAI({
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: deepseekApiKey,
  });

  try {
    const result = streamText({
      model: deepseek(process.env.DEEPSEEK_MODEL || 'deepseek-chat'),
      system: systemPrompt,
      prompt: question,
      temperature: 0.1,
      onFinish: async (event) => {
        if (sessionId) {
          try {
            const [existing] = await db
              .select({ id: chatSessions.id })
              .from(chatSessions)
              .where(eq(chatSessions.id, sessionId));

            if (!existing) {
              await db.insert(chatSessions).values({
                id: sessionId,
                companyId: companyId || null,
                title: question.slice(0, 80),
              });
            }

            const cited = extractCitations(event.text, rows);
            await db.insert(chatMessages).values([
              {
                sessionId,
                role: 'user',
                content: question,
                citations: [],
              },
              {
                sessionId,
                role: 'assistant',
                content: event.text,
                citations: cited as unknown as Array<Record<string, unknown>>,
              },
            ]);
          } catch (err) {
            console.error('Failed to persist chat message exchange:', err);
          }
        }
      },
    });

    return result.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Citations': JSON.stringify(allCitations),
      },
    });
  } catch (err: unknown) {
    console.error('Query streaming failed:', err);
    return apiError('AI_FAILURE', 'Failed to generate query stream.', 500);
  }
}
