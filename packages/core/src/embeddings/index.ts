import { GoogleGenAI } from '@google/genai';

export interface EmbedOptions {
  model?: string;
  dimensions?: number;
  batchSize?: number;
  delayMs?: number;
  maxRetries?: number;
  apiKey?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEmbeddingConfig(options: EmbedOptions = {}) {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing GEMINI_API_KEY in environment. Please provide a valid Gemini API key.'
    );
  }

  const model =
    options.model || process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  const dimensions =
    options.dimensions ||
    parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10);
  const delayMs =
    options.delayMs ??
    parseInt(process.env.EMBED_DELAY_MS || '1000', 10);
  const batchSize = options.batchSize ?? 10;
  const maxRetries = options.maxRetries ?? 5;

  return { apiKey, model, dimensions, delayMs, batchSize, maxRetries };
}

/**
 * Call Gemini embedContent with exponential backoff on 429 / 5xx rate limits.
 */
async function callEmbedWithRetry(
  ai: GoogleGenAI,
  model: string,
  contents: string[],
  dimensions: number,
  maxRetries: number
): Promise<number[][]> {
  let attempt = 0;
  let baseDelay = 1500;

  while (attempt < maxRetries) {
    try {
      const response = await ai.models.embedContent({
        model,
        contents,
        config: {
          outputDimensionality: dimensions,
        },
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error(
          `Gemini returned empty embeddings array for batch of ${contents.length} items.`
        );
      }

      const results: number[][] = [];
      for (let i = 0; i < response.embeddings.length; i++) {
        const item = response.embeddings[i];
        const values = item?.values;
        if (!values || values.length === 0) {
          throw new Error(
            `Gemini returned empty vector values for content item index ${i}.`
          );
        }
        if (values.length !== dimensions) {
          throw new Error(
            `Embedding dimension mismatch: expected ${dimensions}, got ${values.length}.`
          );
        }
        results.push(values);
      }

      return results;
    } catch (err: unknown) {
      attempt++;
      const errorMessage = err instanceof Error ? err.message : String(err);
      const isRateLimitOrTransient =
        errorMessage.includes('429') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('500') ||
        errorMessage.includes('503') ||
        errorMessage.includes('overloaded');

      if (isRateLimitOrTransient && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 500);
        const backoff = baseDelay * Math.pow(2, attempt - 1) + jitter;
        console.warn(
          `[Gemini Embed] Rate limit / transient error (attempt ${attempt}/${maxRetries}): ${errorMessage}. Retrying in ${backoff}ms...`
        );
        await sleep(backoff);
      } else {
        throw new Error(
          `Gemini embedding failed after ${attempt} attempts: ${errorMessage}`
        );
      }
    }
  }

  throw new Error(`Gemini embedding failed after reaching max retries (${maxRetries}).`);
}

/**
 * Embed multiple texts sequentially with configurable delay and exponential backoff.
 * Guaranteed to return 1536-dimensional vectors or fail loudly.
 */
export async function embedTexts(
  texts: string[],
  options: EmbedOptions = {}
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const config = getEmbeddingConfig(options);
  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += config.batchSize) {
    const batch = texts.slice(i, i + config.batchSize);

    // Call API with backoff
    const batchResults = await callEmbedWithRetry(
      ai,
      config.model,
      batch,
      config.dimensions,
      config.maxRetries
    );

    allEmbeddings.push(...batchResults);

    // If more batches remain, throttle sequentially
    if (i + config.batchSize < texts.length && config.delayMs > 0) {
      await sleep(config.delayMs);
    }
  }

  return allEmbeddings;
}

/**
 * Embed a single user query for RAG similarity search.
 */
export async function embedQuery(
  query: string,
  options: EmbedOptions = {}
): Promise<number[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Cannot embed an empty query string.');
  }

  const results = await embedTexts([trimmed], {
    ...options,
    batchSize: 1,
    delayMs: 0,
  });

  const vector = results[0];
  if (!vector) {
    throw new Error('Failed to obtain embedding vector for query.');
  }

  return vector;
}
