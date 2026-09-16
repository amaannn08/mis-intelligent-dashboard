export interface MetricDefinitionLike {
  key: string;
  label: string;
  unit: string;
  aliases: string[];
}

export interface MetricMatchResult {
  metricKey: string;
  matchedAlias: string;
  unit: string;
  label: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a raw table/document row label against metric definitions using alias data.
 * Adheres strictly to the invariant:
 * - Percent vs absolute: EBITDA % ≠ EBITDA (excludes %/margin/ratio on absolute currency metrics)
 * - Gross Profit (currency) ≠ Gross Margin (percent)
 * - Data-driven lookup via alias lists, no hardcoded switch-cases.
 */
export function matchMetricLabel(
  rawLabel: string,
  definitions: MetricDefinitionLike[]
): MetricMatchResult | null {
  if (!rawLabel) return null;
  const cleanLabel = normalizeText(rawLabel);
  if (!cleanLabel) return null;

  const isPercentLabel =
    cleanLabel.includes('%') ||
    /\b(?:margin|percentage|ratio|pct)\b/i.test(cleanLabel);

  // Flatten all aliases into candidate objects and sort by alias length descending
  // so specific aliases like "Net Cash Burn" match before "Burn"
  const candidates: Array<{
    def: MetricDefinitionLike;
    alias: string;
    cleanAlias: string;
    aliasIsPercent: boolean;
  }> = [];

  for (const def of definitions) {
    for (const alias of def.aliases) {
      const cleanAlias = normalizeText(alias);
      if (!cleanAlias) continue;
      const aliasIsPercent =
        cleanAlias.includes('%') ||
        /\b(?:margin|percentage|ratio|pct)\b/i.test(cleanAlias);

      candidates.push({
        def,
        alias,
        cleanAlias,
        aliasIsPercent,
      });
    }
  }

  candidates.sort((a, b) => b.cleanAlias.length - a.cleanAlias.length);

  for (const { def, alias, cleanAlias, aliasIsPercent } of candidates) {
    // 1. Guard against percent vs currency mismatch:
    // If definition is currency, but label contains % or margin/ratio, reject
    if (def.unit === 'currency' && isPercentLabel && !aliasIsPercent) {
      continue;
    }

    // If definition is percent, but label does NOT contain % or margin/ratio (e.g. "Gross Profit" with no %)
    if (def.unit === 'percent' && !isPercentLabel && !aliasIsPercent) {
      continue;
    }

    // 2. Check match: exact or word boundary
    const isExact = cleanLabel === cleanAlias;
    const escaped = cleanAlias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isWordMatch = new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i').test(cleanLabel);

    if (isExact || isWordMatch) {
      return {
        metricKey: def.key,
        matchedAlias: alias,
        unit: def.unit,
        label: def.label,
      };
    }
  }

  return null;
}
