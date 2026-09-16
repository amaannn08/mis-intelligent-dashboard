/**
 * @mis/core — Core business logic, parsing, normalization, chunking, embeddings, and RAG.
 * Minimal typed stub for Milestone 0 / Milestone 1; Milestone 2 implements pipeline modules.
 */

export const CORE_VERSION = '0.1.0';

export type JobStep = 'parse' | 'normalise' | 'extract' | 'chunk' | 'embed';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ProcessingJobState {
  step: JobStep;
  status: JobStatus;
  startedAt?: Date;
  finishedAt?: Date;
  error?: string;
  log?: Record<string, unknown>;
}

export interface ChunkMetadata {
  company: string;
  companyId: string;
  reportingPeriod?: string;
  sheetName?: string;
  pageNumber?: number;
  rowIndices?: number[];
  [key: string]: unknown;
}
