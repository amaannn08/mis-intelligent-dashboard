/**
 * @mis/core — Portfolio MIS parsing, normalisation, chunking, embeddings, extraction, RAG, and pipeline.
 */

export const CORE_VERSION = '0.1.0';

// Types
export * from './types.js';

// Parsing
export { parseFile, parseXlsx, parsePdf } from './parsing/index.js';

// Normalisation
export {
  parseRawNumber,
  detectScale,
  normalizeNumericValue,
  parseReportingPeriod,
  extractYearFromContext,
  matchMetricLabel,
  type ParsedNumber,
  type ScaleMultiplier,
  type MetricDefinitionLike,
  type MetricMatchResult,
} from './normalisation/index.js';

// Chunking
export {
  chunkDocument,
  estimateTokenCount,
  type ChunkingOptions,
  type ChunkingContext,
} from './chunking/index.js';

// Embeddings
export {
  embedTexts,
  embedQuery,
  type EmbedOptions,
} from './embeddings/index.js';

// Extraction
export {
  extractMetrics,
  extractMetricsDeterministic,
  extractMetricsWithDeepSeek,
  type DeepSeekExtractOptions,
} from './extraction/index.js';

// RAG & Hybrid Retrieval
export {
  answerQuery,
  retrieveRelevantChunks,
  buildRAGContext,
  extractCitations,
  routeQuestion,
  buildStructuredMetricsContext,
  formatIndianCurrency,
  formatPercent,
  formatMetricValue,
  calculateMoM,
  formatConversationHistory,
  buildGroupedDocumentContext,
  buildHybridRAGPrompt,
  type AnswerQueryOptions,
  type RetrieveChunksOptions,
  type RetrievedChunkRow,
  type RouteResult,
  type RouteQuestionOptions,
  type KnownCompany,
  type MetricContextRow,
  type StructuredContextOptions,
  type HistoryMessage,
  type HybridRAGContextOptions,
} from './rag/index.js';

// Pipeline
export {
  processDocument,
  type ProcessDocumentOptions,
} from './pipeline/index.js';
