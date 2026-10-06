export interface KnownCompany {
  id: string;
  name: string;
  slug?: string;
}

export interface RouteQuestionOptions {
  sessionCompanyId?: string | null;
  knownCompanies?: KnownCompany[];
}

export interface RouteResult {
  intent: 'metrics' | 'documents' | 'mixed';
  companyId: string | null;      // resolved scope
  detectedCompanyNames: string[];
  metricKeys: string[];        // e.g. ['revenue','burn']
  hint: string;                 // short explanation, for logs
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const METRIC_ALIASES: Record<string, string[]> = {
  revenue: [
    'net revenue',
    'total revenue',
    'operating revenue',
    'total sales',
    'sales',
    'selling',
    'best selling',
    'top selling',
    'bestseller',
    'revenue',
    'turnover',
    'topline',
    'top line',
    'operating income',
  ],
  ebitda: [
    'operating ebitda',
    'operating profit',
    'operating loss',
    'ebitda',
    'ebit',
  ],
  gross_margin: [
    'gross margin percentage',
    'gross profit margin',
    'gross margin',
    'gm percentage',
    'gm %',
    'gm',
    'gross profit',
  ],
  burn: [
    'monthly cash burn',
    'cash burn rate',
    'net cash burn',
    'monthly burn',
    'cash burn',
    'net burn',
    'burn rate',
    'burn',
  ],
  run_rate: [
    'annualized revenue',
    'annualised revenue',
    'annual run rate',
    'run rate',
    'arr',
  ],
};

const AGGREGATION_WORDS = [
  'highest',
  'lowest',
  'top',
  'bottom',
  'most',
  'least',
  'rank',
  'ranks',
  'ranking',
  'ranked',
  'best',
  'worst',
  'compare',
  'comparing',
  'comparison',
  'vs',
  'versus',
  'trend',
  'total',
  'all companies',
  'which company',
  'who has',
  'across companies',
  'across portfolio',
  'portfolio-wide',
];

const DOCUMENT_WORDS = [
  'why',
  'how',
  'explain',
  'explanation',
  'reason',
  'reasons',
  'commentary',
  'notes',
  'summary',
  'summarise',
  'summarize',
  'strategy',
  'headwinds',
  'tailwinds',
  'risks',
  'overview',
  'updates',
  'challenges',
  'feedback',
  'details',
  'narrative',
  'management',
  'plans',
];

/**
 * Deterministic router for user questions in hybrid financial RAG.
 * Resolves company scope, intent (metrics | documents | mixed), and metric keys.
 */
export function routeQuestion(
  question: string,
  options: RouteQuestionOptions = {}
): RouteResult {
  const { sessionCompanyId = null, knownCompanies = [] } = options;
  const q = question.trim();

  // 1. Company detection
  const detectedCompanyMap = new Map<string, KnownCompany>();

  for (const comp of knownCompanies) {
    const candidates: string[] = [];

    // Full name
    candidates.push(comp.name);

    // Parenthetical alias extraction, e.g. "Flent (Slaash)" -> "Slaash" and "Flent"
    const parenMatch = comp.name.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1]) {
      candidates.push(parenMatch[1].trim());
      const baseName = comp.name.replace(/\([^)]+\)/g, '').trim();
      if (baseName) candidates.push(baseName);
    }

    // Slug
    if (comp.slug) {
      candidates.push(comp.slug);
      const slugWords = comp.slug.replace(/-/g, ' ').trim();
      if (slugWords !== comp.slug) {
        candidates.push(slugWords);
      }
    }

    // First word of company name if distinct and >= 3 characters
    const firstWord = comp.name.split(/\s+/)[0]?.replace(/[^\w]/g, '');
    if (firstWord && firstWord.length >= 3 && !['the', 'and', 'for', 'inc'].includes(firstWord.toLowerCase())) {
      candidates.push(firstWord);
    }

    // Check if any candidate matches question with word boundary
    for (const cand of candidates) {
      if (!cand || cand.length < 2) continue;
      const pattern = new RegExp(`(^|\\b)${escapeRegExp(cand)}(\\b|$)`, 'i');
      if (pattern.test(q)) {
        detectedCompanyMap.set(comp.id, comp);
        break;
      }
    }
  }

  const detectedCompanies = Array.from(detectedCompanyMap.values());
  const detectedCompanyNames = detectedCompanies.map((c) => c.name);

  // Resolved companyId:
  // If exactly 1 company named in question, explicit mention wins over session scope.
  // If multiple companies named in question, comparison scope (companyId = null).
  // If no company named in question, fall back to session scope.
  let resolvedCompanyId: string | null = null;
  if (detectedCompanies.length === 1) {
    resolvedCompanyId = detectedCompanies[0]!.id;
  } else if (detectedCompanies.length > 1) {
    resolvedCompanyId = null;
  } else {
    resolvedCompanyId = sessionCompanyId || null;
  }

  // 2. Metric detection
  const detectedMetricKeys: string[] = [];

  for (const [key, aliases] of Object.entries(METRIC_ALIASES)) {
    // Sort aliases by length descending
    const sortedAliases = [...aliases].sort((a, b) => b.length - a.length);
    for (const alias of sortedAliases) {
      const pattern = new RegExp(`(^|\\b)${escapeRegExp(alias)}(\\b|$)`, 'i');
      if (pattern.test(q)) {
        if (!detectedMetricKeys.includes(key)) {
          detectedMetricKeys.push(key);
        }
        break;
      }
    }
  }

  // 3. Aggregation/ranking and Document word matching
  const matchedAggregationWords = AGGREGATION_WORDS.filter((word) =>
    new RegExp(`(^|\\b)${escapeRegExp(word)}(\\b|$)`, 'i').test(q)
  );
  const matchedDocumentWords = DOCUMENT_WORDS.filter((word) =>
    new RegExp(`(^|\\b)${escapeRegExp(word)}(\\b|$)`, 'i').test(q)
  );

  const hasMetricSignals =
    detectedMetricKeys.length > 0 || matchedAggregationWords.length > 0;
  const hasDocumentSignals = matchedDocumentWords.length > 0;

  // 4. Intent classification
  let intent: 'metrics' | 'documents' | 'mixed';
  let hint = '';

  if (hasDocumentSignals && hasMetricSignals) {
    intent = 'mixed';
    hint = `Mixed query: document reasoning keywords [${matchedDocumentWords.join(', ')}] with metric signals [${detectedMetricKeys.join(', ')}]`;
  } else if (hasMetricSignals) {
    intent = 'metrics';
    const aggHint = matchedAggregationWords.length > 0 ? ` with aggregation [${matchedAggregationWords.join(', ')}]` : '';
    hint = `Metrics query: metric keys [${detectedMetricKeys.join(', ')}]${aggHint}`;
  } else {
    intent = 'documents';
    hint = `Document query: commentary/narrative search`;
  }

  return {
    intent,
    companyId: resolvedCompanyId,
    detectedCompanyNames,
    metricKeys: detectedMetricKeys,
    hint,
  };
}
