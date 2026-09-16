import type { ExtractedMetric, ParsedDocument } from '../types.js';
import type { MetricDefinitionLike } from '../normalisation/aliases.js';
import { parseRawNumber, normalizeNumericValue } from '../normalisation/numbers.js';

export interface DeepSeekExtractOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

interface DeepSeekMetricCandidate {
  metric_key: string;
  reported_value: string;
  normalized_value?: number;
  unit: string;
  reporting_period: string;
  source_reference: string;
  value_kind?: 'reported' | 'calculated';
  confidence?: number;
}

interface DeepSeekResponsePayload {
  metrics?: DeepSeekMetricCandidate[];
}

/**
 * Verify that a candidate number actually appears in the source raw document text
 * to prevent hallucination.
 */
function verifyNumberInSource(reportedValue: string, sourceText: string): boolean {
  if (!reportedValue) return false;

  // Exact substring check first
  if (sourceText.includes(reportedValue.trim())) {
    return true;
  }

  // Extract core numeric sequence (digits and decimal)
  const digitsMatch = reportedValue.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!digitsMatch) return false;

  const coreNumber = digitsMatch[0]!;
  // Check if core number appears in source text (as positive, negative, or parenthesised)
  return (
    sourceText.includes(coreNumber) ||
    sourceText.includes(`(${coreNumber})`) ||
    sourceText.includes(`-${coreNumber}`)
  );
}

/**
 * LLM fallback extractor using DeepSeek with structured JSON output.
 * Invoked only for canonical metrics not resolved by the deterministic pass.
 */
export async function extractMetricsWithDeepSeek(
  parsedDoc: ParsedDocument,
  missingMetricKeys: string[],
  metricDefinitions: MetricDefinitionLike[],
  targetPeriod?: string,
  options: DeepSeekExtractOptions = {}
): Promise<ExtractedMetric[]> {
  const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[DeepSeek Extract] Missing DEEPSEEK_API_KEY, skipping LLM extraction fallback.');
    return [];
  }

  const baseUrl = (
    options.baseUrl ||
    process.env.DEEPSEEK_BASE_URL ||
    'https://api.deepseek.com'
  ).replace(/\/+$/, '');
  const model = options.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat';

  // Find definitions for missing metrics
  const missingDefs = metricDefinitions.filter((d) => missingMetricKeys.includes(d.key));
  if (missingDefs.length === 0) {
    return [];
  }

  const definitionsGuide = missingDefs
    .map((d) => `- Key: "${d.key}" (Unit: ${d.unit}, Label: "${d.label}", Common aliases: ${d.aliases.join(', ')})`)
    .join('\n');

  // Truncate rawText to first 12,000 characters if very large
  const documentContext = parsedDoc.rawText.slice(0, 12000);

  const systemPrompt = `You are an expert financial analyst assistant. Your task is to extract missing financial metrics from the provided Management Information System (MIS) document text.

TARGET METRIC DEFINITIONS:
${definitionsGuide}

STRICT EXTRACTION RULES:
1. ONLY extract metrics that explicitly appear in the document text or can be directly calculated from explicitly stated figures.
2. REPORTED VALUES: Must cite the exact text or cell value as it appears in the document.
3. ANTI-HALLUCINATION RULE: If a metric is NOT present or cannot be calculated from the text, DO NOT invent or assume numbers. Simply omit it from the output array.
4. SOURCE REFERENCE: Every extracted metric MUST have a detailed source_reference specifying the sheet, row or section name, and original text.
5. VALUE KIND: Use "reported" if the number is directly stated. Use "calculated" only if derived, and explain the arithmetic in source_reference.
6. OUTPUT FORMAT: Respond ONLY with a valid JSON object matching:
{
  "metrics": [
    {
      "metric_key": "revenue",
      "reported_value": "150.00",
      "unit": "currency",
      "reporting_period": "YYYY-MM",
      "source_reference": "Sheet 'P&L', Row 14 'Revenue from Operations' (Reported: 150.00 in Lakhs)",
      "value_kind": "reported",
      "confidence": 0.90
    }
  ]
}`;

  const userPrompt = `DOCUMENT FILENAME: ${parsedDoc.filename}
${targetPeriod ? `TARGET REPORTING PERIOD: ${targetPeriod}` : ''}

DOCUMENT CONTENT:
${documentContext}

Extract any of the missing metrics: ${missingMetricKeys.join(', ')}.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[DeepSeek Extract] API error (${response.status}): ${errText}`);
      return [];
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];

    const parsedJson = JSON.parse(content) as DeepSeekResponsePayload;
    const candidates = parsedJson.metrics ?? [];
    const verifiedMetrics: ExtractedMetric[] = [];

    for (const item of candidates) {
      if (!missingMetricKeys.includes(item.metric_key)) {
        continue;
      }

      // Verify number presence in source to prevent hallucination
      const numberVerified = verifyNumberInSource(item.reported_value, parsedDoc.rawText);
      if (!numberVerified && item.value_kind !== 'calculated') {
        console.warn(
          `[DeepSeek Extract] Discarded ungrounded metric ${item.metric_key}: value '${item.reported_value}' not found in source text.`
        );
        continue;
      }

      const parsedNum = parseRawNumber(item.reported_value);
      if (!parsedNum) continue;

      const def = metricDefinitions.find((d) => d.key === item.metric_key);
      const targetUnit = def?.unit ?? item.unit ?? 'currency';
      const normVal =
        item.normalized_value !== undefined && typeof item.normalized_value === 'number'
          ? item.normalized_value
          : normalizeNumericValue(parsedNum, targetUnit, parsedDoc.rawText);

      verifiedMetrics.push({
        metricKey: item.metric_key,
        value: normVal,
        unit: targetUnit,
        reportingPeriod: item.reporting_period || targetPeriod || 'unknown',
        sourceReference: item.source_reference || `Extracted via AI from ${parsedDoc.filename}`,
        valueKind: item.value_kind === 'calculated' ? 'calculated' : 'reported',
        confidence: item.confidence ?? 0.85,
      });
    }

    return verifiedMetrics;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[DeepSeek Extract] Extraction failed: ${msg}`);
    return [];
  }
}
