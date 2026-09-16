import type { ExtractedMetric, ParsedDocument } from '../types.js';
import type { MetricDefinitionLike } from '../normalisation/aliases.js';
import { extractMetricsDeterministic } from './deterministic.js';
import { extractMetricsWithDeepSeek, type DeepSeekExtractOptions } from './deepseek.js';

export { extractMetricsDeterministic } from './deterministic.js';
export { extractMetricsWithDeepSeek } from './deepseek.js';

const STANDARD_METRIC_KEYS = [
  'revenue',
  'gross_margin',
  'ebitda',
  'burn',
  'run_rate',
];

/**
 * Extract financial metrics following the deterministic-first / LLM-fallback contract.
 * - Deterministic pass runs first against alias tables and table heuristics.
 * - DeepSeek structured JSON pass runs only for standard metrics that remain unresolved.
 * - Strict grounding: ungrounded LLM values are rejected.
 * - Absent metrics are omitted (never invented).
 */
export async function extractMetrics(
  parsedDoc: ParsedDocument,
  metricDefinitions: MetricDefinitionLike[],
  targetPeriod?: string,
  options: DeepSeekExtractOptions = {}
): Promise<ExtractedMetric[]> {
  // Step 1: Deterministic pass
  const deterministicMetrics = extractMetricsDeterministic(
    parsedDoc,
    metricDefinitions,
    targetPeriod
  );

  // Group deterministic metrics by period
  const foundKeysByPeriod = new Set<string>();
  for (const m of deterministicMetrics) {
    foundKeysByPeriod.add(`${m.metricKey}_${m.reportingPeriod}`);
  }

  // Determine periods present in the document
  const documentPeriods = Array.from(
    new Set(deterministicMetrics.map((m) => m.reportingPeriod))
  );
  if (targetPeriod && !documentPeriods.includes(targetPeriod)) {
    documentPeriods.push(targetPeriod);
  }

  // Step 2: Check if any standard metrics are missing
  const missingKeys = STANDARD_METRIC_KEYS.filter((key) => {
    // Check if key is present in at least one period
    return !deterministicMetrics.some((m) => m.metricKey === key);
  });

  if (missingKeys.length === 0) {
    return deterministicMetrics;
  }

  // Step 3: LLM fallback for missing metrics
  const llmMetrics = await extractMetricsWithDeepSeek(
    parsedDoc,
    missingKeys,
    metricDefinitions,
    targetPeriod,
    options
  );

  // Step 4: Merge without duplicates
  const merged = [...deterministicMetrics];
  for (const lm of llmMetrics) {
    const exists = merged.some(
      (m) => m.metricKey === lm.metricKey && m.reportingPeriod === lm.reportingPeriod
    );
    if (!exists) {
      merged.push(lm);
    }
  }

  return merged;
}
