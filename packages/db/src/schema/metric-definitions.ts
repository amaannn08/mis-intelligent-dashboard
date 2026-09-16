import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const metricDefinitions = pgTable('metric_definitions', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  unit: text('unit').notNull(),
  aliases: text('aliases')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  directionality: text('directionality').notNull(), // e.g. 'up_is_good', 'down_is_good', 'neutral'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type MetricDefinition = typeof metricDefinitions.$inferSelect;
export type NewMetricDefinition = typeof metricDefinitions.$inferInsert;
