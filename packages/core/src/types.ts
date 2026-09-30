export type JobStep = 'parse' | 'normalise' | 'extract' | 'chunk' | 'embed';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type DocumentStatus =
  | 'pending'
  | 'parsing'
  | 'extracting'
  | 'embedding'
  | 'processed'
  | 'failed';

export type MetricValueKind = 'reported' | 'calculated' | 'estimated';

export interface ParsedBlock {
  text: string;
  sheet?: string;
  page?: number;
  rowStart?: number;
  rowEnd?: number;
}

export interface ParsedDocument {
  filename: string;
  fileType: 'xlsx' | 'xls' | 'pdf' | 'docx';
  blocks: ParsedBlock[];
  rawText: string;
  metadata?: Record<string, unknown>;
}

export interface ChunkMetadata {
  company: string;
  companyId: string;
  documentId: string;
  filename: string;
  reportingPeriod?: string;
  sheetName?: string;
  pageNumber?: number;
  rowStart?: number;
  rowEnd?: number;
  [key: string]: unknown;
}

export interface TextChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: ChunkMetadata;
}

export interface ExtractedMetric {
  metricKey: string;
  value: number;
  unit: string;
  reportingPeriod: string;
  sourceReference: string;
  valueKind: MetricValueKind;
  confidence: number;
}

export interface Citation {
  index: number;
  documentId: string;
  filename: string;
  reportingPeriod: string;
  company: string;
  chunkIndex: number;
  snippet: string;
}

export interface RagAnswer {
  answer: string;
  citations: Citation[];
  usedChunks: Array<{
    id: string;
    chunkIndex: number;
    similarity: number;
    metadata: Record<string, unknown>;
  }>;
}

export interface PipelineResult {
  documentId: string;
  status: 'processed' | 'failed';
  reportingPeriod?: string;
  chunksCreated: number;
  metricsExtracted: ExtractedMetric[];
  error?: string;
}

export interface ParsedMatrixMetric {
  sheetName: string;
  rawLabel: string;
  normalizedLabel: string;
  parentLabel?: string;
  standardMetricKey?: string;
  reportingPeriod: string;
  periodDate?: string;
  granularity: 'monthly' | 'quarterly' | 'annual';
  value: number | null;
  rawValue: string;
  unit: string;
  currency?: string;
  scale: 'units' | 'lakh' | 'crore' | 'thousand' | 'million';
  rowIndex: number;
  colIndex: number;
  sourceReference: string;
  confidence: number;
  status: 'valid' | 'quarantined' | 'derived';
  validationNotes?: string;
}

export interface MatrixParseResult {
  metrics: ParsedMatrixMetric[];
  sheetsAnalyzed: string[];
  quarantinedCount: number;
}
