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
  misMetrics,
} from '@mis/db';
import { parseFile, parseMatrixSpreadsheet, extractPeriodFromFilename } from '../parsing/index.js';
import { extractMetrics } from '../extraction/index.js';
import { chunkDocument } from '../chunking/index.js';
import { embedTexts, type EmbedOptions } from '../embeddings/index.js';
import type { PipelineResult, ExtractedMetric, ParsedMatrixMetric } from '../types.js';

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

    // 2. Read binary file (3-tier fallback: Blob -> disk -> document_blobs)
    let fileBytes: Buffer | null = null;

    if (doc.blobUrl) {
      try {
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        const res = await fetch(doc.blobUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const ab = await res.arrayBuffer();
          fileBytes = Buffer.from(ab);
        }
      } catch (err) {
        console.warn(`Failed to fetch doc ${documentId} from blobUrl, attempting fallback:`, err);
      }
    }

    if (!fileBytes) {
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
        }
      }
    }

    if (!fileBytes) {
      throw new Error(
        `File binary not found at blobUrl, resolved storage path '${doc.storagePath}', or in document_blobs`
      );
    }

    // Non-metric media assets (e.g. PNGs, JPEGs)
    const isImage =
      doc.mime?.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif)$/i.test(doc.filename);
    if (isImage) {
      await db
        .update(documents)
        .set({
          status: 'processed',
          processedAt: new Date(),
          error: null,
        })
        .where(eq(documents.id, documentId));

      return {
        documentId,
        status: 'processed',
        chunksCreated: 0,
        metricsExtracted: [],
      };
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

    const isSpreadsheet = /\.xlsx?$/i.test(doc.filename);
    const matrixExtractedKpis: ExtractedMetric[] = [];
    let granularMisMetricsCount = 0;
    let quarantinedCount = 0;

    let matrixResult: ReturnType<typeof parseMatrixSpreadsheet> | undefined;
    if (isSpreadsheet) {
      matrixResult = parseMatrixSpreadsheet(fileBytes, doc.filename);
      granularMisMetricsCount = matrixResult.metrics.length;
      quarantinedCount = matrixResult.quarantinedCount;

      const metricsToInsert = matrixResult.metrics;

      // Idempotently and atomically replace mis_metrics for this document
      await db.transaction(async (tx) => {
        await tx.delete(misMetrics).where(eq(misMetrics.documentId, documentId));

        // Batch insert into mis_metrics
        const BATCH_SIZE = 300;
        for (let i = 0; i < metricsToInsert.length; i += BATCH_SIZE) {
          const batch = metricsToInsert.slice(i, i + BATCH_SIZE).map((m) => ({
            documentId: doc.id,
            companyId: doc.companyId,
            fund: doc.fund ?? null,
            sheetName: m.sheetName,
            rawLabel: m.rawLabel,
            normalizedLabel: m.normalizedLabel,
            parentLabel: m.parentLabel ?? null,
            standardMetricKey: m.standardMetricKey ?? null,
            reportingPeriod: m.reportingPeriod,
            periodDate: m.reportingPeriod ? `${m.reportingPeriod}-01` : null,
            granularity: m.granularity ?? 'monthly',
            value: m.value !== null ? String(m.value) : null,
            rawValue: m.rawValue,
            unit: m.unit,
            currency: m.currency ?? null,
            scale: m.scale,
            rowIndex: m.rowIndex,
            colIndex: m.colIndex,
            sourceReference: m.sourceReference,
            confidence: String(m.confidence),
            status: m.status,
            validationNotes: m.validationNotes ?? null,
            blockLabel: m.blockLabel ?? null,
            blockIndex: m.blockIndex ?? null,
            parentBlockLabel: m.parentBlockLabel ?? null,
            kind: m.kind ?? null,
          }));
          await tx.insert(misMetrics).values(batch);
        }
      });

      // Group standard KPIs by (key, period) with deterministic prioritization
      const kpisByPeriod = new Map<string, ParsedMatrixMetric>();

      const getKpiPriority = (label: string, key: string): number => {
        const norm = label.toLowerCase();
        if (key === 'revenue') {
          if (norm.includes('net_revenue') || norm.includes('net revenue')) return 5;
          if (norm.includes('revenue_from_operations') || norm.includes('revenue from operations')) return 4;
          if (norm.includes('total_revenue') || norm.includes('total revenue')) return 3;
          if (norm.includes('operating_revenue') || norm.includes('operating revenue')) return 2;
          if (norm.includes('gross_revenue') || norm.includes('gross revenue')) return 1;
          return 0;
        }
        if (key === 'ebitda') {
          if (norm.includes('operating_ebitda') || norm.includes('operating ebitda')) return 2;
          if (norm.includes('ebitda')) return 1;
          return 0;
        }
        return 1;
      };

      const validKpiMetrics = matrixResult.metrics.filter(
        (m) => m.status === 'valid' && m.value !== null && m.standardMetricKey
      );

      for (const m of validKpiMetrics) {
        const groupKey = `${m.standardMetricKey}_${m.reportingPeriod}`;
        const existing = kpisByPeriod.get(groupKey);
        if (!existing) {
          kpisByPeriod.set(groupKey, m);
        } else {
          const currentPrio = getKpiPriority(existing.rawLabel, existing.standardMetricKey!);
          const newPrio = getKpiPriority(m.rawLabel, m.standardMetricKey!);
          if (newPrio > currentPrio) {
            kpisByPeriod.set(groupKey, m);
          }
        }
      }

      for (const m of kpisByPeriod.values()) {
        matrixExtractedKpis.push({
          metricKey: m.standardMetricKey!,
          value: m.value!,
          unit: m.unit,
          reportingPeriod: m.reportingPeriod,
          sourceReference: m.sourceReference,
          confidence: m.confidence,
          valueKind: 'reported',
        });
      }
    }

    let extractedMetrics: ExtractedMetric[] = [];
    if (matrixExtractedKpis.length > 0) {
      extractedMetrics = matrixExtractedKpis;
    } else {
      const defs = await db.select().from(metricDefinitions);
      const fallbackMetrics: ExtractedMetric[] = await extractMetrics(
        parsed,
        defs,
        doc.reportingPeriod || undefined
      );
      extractedMetrics = fallbackMetrics;
    }

    // Filter to ensure only strictly valid YYYY-MM periods are persisted to metrics
    const validExtractedMetrics = extractedMetrics.filter(
      (m) => m.reportingPeriod && /^\d{4}-\d{2}$/.test(m.reportingPeriod)
    );

    // Clean up existing metrics for this document for idempotency
    await db.delete(metrics).where(eq(metrics.documentId, documentId));

    // Persist extracted metrics to database
    for (const m of validExtractedMetrics) {
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
          valueKind: 'reported',
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
            valueKind: 'reported',
            confidence: String(m.confidence),
            updatedAt: new Date(),
          },
        });
    }

    await completeJob({
      metricsExtractedCount: validExtractedMetrics.length,
      granularMisMetricsCount,
      quarantinedCount,
      metrics: validExtractedMetrics.map((m) => ({
        key: m.metricKey,
        value: m.value,
        period: m.reportingPeriod,
        kind: m.valueKind,
      })),
    });

    // Determine canonical reporting period: filename period has highest priority!
    const filenamePeriod = extractPeriodFromFilename(doc.filename);
    let canonicalPeriod = doc.reportingPeriod || filenamePeriod;
    if (!canonicalPeriod && validExtractedMetrics.length > 0) {
      const periods = validExtractedMetrics.map((m) => m.reportingPeriod).sort();
      canonicalPeriod = periods[periods.length - 1] ?? null;
    }


    // Synthesize structured block text chunks for multi-block spreadsheet metrics to guarantee RAG retrieval
    if (isSpreadsheet && matrixResult && matrixResult.metrics.length > 0) {
      const multiBlockMetrics = matrixResult.metrics.filter(
        (m) => (m.blockLabel || m.parentBlockLabel) && m.status === 'valid' && m.value !== null
      );

      if (multiBlockMetrics.length > 0) {
        const groups = new Map<string, typeof multiBlockMetrics>();
        for (const m of multiBlockMetrics) {
          const key = `${m.sheetName}:::${m.parentBlockLabel || ''}:::${m.blockLabel || ''}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(m);
        }

        for (const [key, gMetrics] of groups.entries()) {
          const [sheetName, parentBlock, block] = key.split(':::');
          const blockPath = [parentBlock, block].filter(Boolean).join(' > ');
          const lines = gMetrics.map((m) => {
            const unitScale =
              m.kind === 'count'
                ? 'count'
                : m.kind === 'percent'
                ? '%'
                : m.scale && m.scale !== 'units'
                ? `${m.unit} ${m.scale}`
                : m.unit;
            return `${company.name} | ${m.sheetName} | ${blockPath} > ${m.rawLabel} | ${m.reportingPeriod}: ${m.value} (${unitScale})`;
          });

          parsed.blocks.unshift({
            sheet: sheetName,
            text: `### Sheet: ${sheetName} (${blockPath})\n` + lines.join('\n'),
            rowStart: gMetrics[0]?.rowIndex,
            rowEnd: gMetrics[gMetrics.length - 1]?.rowIndex,
          });
        }
      }
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

    // Limit embedding to first 50 representative chunks to avoid API exhaustion on massive sheets
    const MAX_EMBED_CHUNKS = 50;
    const chunksToEmbed = chunks.slice(0, MAX_EMBED_CHUNKS);

    if (chunksToEmbed.length > 0) {
      const textsToEmbed = chunksToEmbed.map((c) => c.content);
      const embeddings = await embedTexts(textsToEmbed, {
        batchSize: 25,
        delayMs: 250,
        ...options.embedOptions,
      });

      for (let i = 0; i < chunksToEmbed.length; i++) {
        const chunk = chunksToEmbed[i]!;
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

    await completeJob({ embeddedChunksCount: chunksToEmbed.length });

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
