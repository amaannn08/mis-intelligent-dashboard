export const SESSION_COOKIE_NAME = 'mis_session';
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Upload size ceilings per LOCKED DECISION & PLAN_AGY §6 & §9
export const UPLOAD_MAX_BYTES_PRODUCTION = 4.5 * 1024 * 1024; // 4.5 MB (Vercel payload limit)
export const UPLOAD_MAX_BYTES_DEVELOPMENT = 15 * 1024 * 1024; // 15 MB local limit
export const BLOB_RETENTION_MAX_BYTES = 4 * 1024 * 1024; // 4 MB DB bytea limit

export const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.pdf'] as const;

export const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/pdf',
  'application/octet-stream',
] as const;
