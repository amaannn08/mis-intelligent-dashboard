import { pgEnum } from 'drizzle-orm/pg-core';

export const documentStatusEnum = pgEnum('document_status', [
  'pending',
  'parsing',
  'extracting',
  'embedding',
  'processed',
  'failed',
]);

export const metricValueKindEnum = pgEnum('metric_value_kind', [
  'reported',
  'calculated',
  'estimated',
]);

export const chatRoleEnum = pgEnum('chat_role', [
  'user',
  'assistant',
  'system',
]);
