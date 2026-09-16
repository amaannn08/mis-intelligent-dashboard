import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import {
  db,
  documents,
  companies,
  metrics,
  metricDefinitions,
  documentChunks,
  processingJobs,
  documentBlobs,
} from '@mis/db';
import type { PipelineResult, ExtractedMetric } from '../types.js';
import { parseFile } from '../parsing/index.js';
import { extractMetrics } from '../extraction/index.js';
import { chunkDocument } from '../chunking/index.js';
import { embedTexts, type EmbedOptions } from '../embeddings/index.js';

export interface ProcessDocumentOptions {
  embedOptions?: EmbedOptions;
}

/**
 * End-to-end document processing pipeline:
 * parse -> normalise -> extract -> chunk -> embed -> persist -> status transitions.
 * Records a processing_jobs row per step for observability and zero-rewrite background worker upgrades.
 */
export async function processDocument(
  documentId: string,
  options: ProcessDocumentOptions = {}
): Promise<PipelineResult> {
  let currentStep: 'parse' | 'extract' | 'chunk' | 'embed' = 'parse';
  let activeJobId: string | null = null;

  // Helper to record a processing job step
  async function startJob(step: 'parse' | 'extract' | 'chunk' | 'embed') {
    currentStep = step;
    const [job] = await db
      .insert(processingJobs)
      .values({
        documentId,
        step,
        status: 'running',
        startedAt: new Date(),
      })
      .returning({ id: processingJobs.id });
    activeJobId = job?.id ?? null;
  }

  async function completeJob(log: Record<string, unknown> = {}) {
    if (activeJobId) {
      await db
        .update(processingJobs)
        .set({
          status: 'completed',
          finishedAt: new Date(),
          log,
        })
        .where(eq(processingJobs.id, activeJobId));
      activeJobId = null;
    }
  }

  async function failJob(errorMessage: string) {
    if (activeJobId) {
      await db
        .update(processingJobs)
        .set({
          status: 'failed',
          finishedAt: new Date(),
          error: errorMessage,
        })
        .where(eq(processingJobs.id, activeJobId));
      activeJobId = null;
    }
  }

  try {
    // 1. Fetch document and associated company
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));

    if (!doc) {
      throw new Error(`Document with ID '${documentId}' not found.`);
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, doc.companyId));

    if (!company) {
      throw new Error(`Company with ID '${doc.companyId}' not found.`);
    }

    // 2. Read binary file from disk
    let fileBytes: Buffer;
    const resolvedPath = path.isAbsolute(doc.storagePath)
      ? doc.storagePath
      : path.resolve(process.cwd(), doc.storagePath);

    if (fs.existsSync(resolvedPath)) {
      fileBytes = fs.readFileSync(resolvedPath);
    } else {
      const [blobRow] = await db
        .select()
        .from(documentBlobs)
        .where(eq(documentBlobs.documentId, documentId));

      if (blobRow && blobRow.data) {
        fileBytes = blobRow.data;
      } else {
        throw new Error(
          `File binary not found at resolved storage path '${resolvedPath}' or in document_blobs`
        );
      }
    }

    // --- STEP 1: PARSE ---
    await db
      .update(documents)
      .set({ status: 'parsing', error: null })
      .where(eq(documents.id, documentId));
    await startJob('parse');

    const parsed = await parseFile(fileBytes, doc.filename);
    await completeJob({
      blocksCount: parsed.blocks.length,
      fileType: parsed.fileType,
      rawTextLength: parsed.rawText.length,
    });

    // --- STEP 2: EXTRACT & NORMALISE ---
    await db
      .update(documents)
      .set({ status: 'extracting' })
      .where(eq(documents.id, documentId));
    await startJob('extract');

    const defs = await db.select().from(metricDefinitions);
    const extractedMetrics: ExtractedMetric[] = await extractMetrics(
      parsed,
      defs,
      doc.reportingPeriod || undefined
    );

    // Persist extracted metrics to database
    for (const m of extractedMetrics) {
      await db
        .insert(metrics)
        .values({
          companyId: doc.companyId,
          documentId: doc.id,
          metricKey: m.metricKey,
          value: String(m.value),
          unit: m.unit,
          reportingPeriod: m.reportingPeriod,
          sourceReference: m.sourceReference,
          valueKind: m.valueKind,
          confidence: String(m.confidence),
        })
        .onConflictDoUpdate({
          target: [
            metrics.companyId,
            metrics.metricKey,
            metrics.reportingPeriod,
            metrics.documentId,
          ],
          set: {
            value: String(m.value),
            unit: m.unit,
            sourceReference: m.sourceReference,
            valueKind: m.valueKind,
            confidence: String(m.confidence),
            updatedAt: new Date(),
          },
        });
    }

    await completeJob({
      metricsExtractedCount: extractedMetrics.length,
      metrics: extractedMetrics.map((m) => ({
        key: m.metricKey,
        value: m.value,
        period: m.reportingPeriod,
        kind: m.valueKind,
      })),
    });

    // Determine canonical reporting period from extracted metrics if document lacks one
    let canonicalPeriod = doc.reportingPeriod;
    if (!canonicalPeriod && extractedMetrics.length > 0) {
      // Pick the most recent period among extracted metrics
      const periods = extractedMetrics.map((m) => m.reportingPeriod).sort();
      canonicalPeriod = periods[periods.length - 1] ?? null;
    }

    // --- STEP 3: CHUNK ---
    await startJob('chunk');
    const chunks = chunkDocument(
      parsed,
      {
        company: company.name,
        companyId: company.id,
        documentId: doc.id,
        reportingPeriod: canonicalPeriod || undefined,
      },
      { targetTokens: 800, overlapTokens: 100 }
    );
    await completeJob({ chunkCount: chunks.length });

    // --- STEP 4: EMBED ---
    await db
      .update(documents)
      .set({ status: 'embedding' })
      .where(eq(documents.id, documentId));
    await startJob('embed');

    // Clean up any existing chunks for this document (ensures idempotency)
    await db
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, documentId));

    if (chunks.length > 0) {
      const textsToEmbed = chunks.map((c) => c.content);
      const embeddings = await embedTexts(textsToEmbed, options.embedOptions);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const vector = embeddings[i]!;

        await db.insert(documentChunks).values({
          documentId: doc.id,
          companyId: doc.companyId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          metadata: chunk.metadata,
          embedding: vector,
        });
      }
    }

    await completeJob({ embeddedChunksCount: chunks.length });

    // --- STEP 5: PROCESSED ---
    await db
      .update(documents)
      .set({
        status: 'processed',
        reportingPeriod: canonicalPeriod,
        processedAt: new Date(),
        error: null,
      })
      .where(eq(documents.id, documentId));

    return {
      documentId,
      status: 'processed',
      reportingPeriod: canonicalPeriod || undefined,
      chunksCreated: chunks.length,
      metricsExtracted: extractedMetrics,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `[processDocument] Pipeline failed at step '${currentStep}' for document '${documentId}':`,
      errorMsg
    );

    await failJob(errorMsg);
    await db
      .update(documents)
      .set({
        status: 'failed',
        error: errorMsg,
      })
      .where(eq(documents.id, documentId));

    return {
      documentId,
      status: 'failed',
      chunksCreated: 0,
      metricsExtracted: [],
      error: errorMsg,
    };
  }
}
