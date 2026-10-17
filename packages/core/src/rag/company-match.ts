export interface MatchableCompany {
  id: string;
  name: string;
  slug?: string;
}

/**
 * Normalizes a company name/slug/token to a bare alphanumeric key so that
 * spacing, punctuation and casing differences ("master chow", "Masterchow",
 * "Master-Chow") all collapse to the same key for comparison.
 */
export function normalizeCompanyKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Cheap Levenshtein edit distance, used only as a last-resort fuzzy fallback
 * for short single-token company names/slugs (handles minor typos).
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Builds the set of candidate strings that should be recognised as referring
 * to this company: full name, parenthetical alias, slug, and first word.
 */
export function buildCompanyCandidates(comp: MatchableCompany): string[] {
  const candidates: string[] = [comp.name];

  const parenMatch = comp.name.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    candidates.push(parenMatch[1].trim());
    const baseName = comp.name.replace(/\([^)]+\)/g, '').trim();
    if (baseName) candidates.push(baseName);
  }

  if (comp.slug) {
    candidates.push(comp.slug);
    const slugWords = comp.slug.replace(/-/g, ' ').trim();
    if (slugWords !== comp.slug) candidates.push(slugWords);
  }

  const firstWord = comp.name.split(/\s+/)[0]?.replace(/[^\w]/g, '');
  if (firstWord && firstWord.length >= 3 && !['the', 'and', 'for', 'inc'].includes(firstWord.toLowerCase())) {
    candidates.push(firstWord);
  }

  return candidates;
}

/**
 * Detects which known companies are mentioned anywhere in free text.
 * Matching is done on a normalized (lowercased, punctuation/space-stripped)
 * form of both the text and each candidate, so "master chow", "Masterchow"
 * and "Master-Chow" are all recognised as the same company. Falls back to a
 * small edit-distance tolerance on single-word candidates (first word / slug)
 * to catch minor typos.
 */
export function detectCompaniesInText<T extends MatchableCompany>(
  text: string,
  knownCompanies: T[]
): T[] {
  const normalizedText = normalizeCompanyKey(text);
  if (!normalizedText) return [];

  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3)
    .map((t) => normalizeCompanyKey(t));

  const matched: T[] = [];

  for (const comp of knownCompanies) {
    const candidates = buildCompanyCandidates(comp);
    let hit = false;

    for (const cand of candidates) {
      const normCand = normalizeCompanyKey(cand);
      if (normCand.length < 3) continue;

      if (normalizedText.includes(normCand)) {
        hit = true;
        break;
      }
    }

    // Fuzzy fallback: only for single-word candidates (first word / slug-word),
    // tolerating small typos (edit distance 1 for <=6 chars, 2 for longer).
    if (!hit) {
      for (const cand of candidates) {
        const normCand = normalizeCompanyKey(cand);
        if (normCand.length < 5 || normCand.includes(' ')) continue;
        const tolerance = normCand.length <= 6 ? 1 : 2;
        for (const token of tokens) {
          if (Math.abs(token.length - normCand.length) > tolerance) continue;
          if (editDistance(token, normCand) <= tolerance) {
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
    }

    if (hit) matched.push(comp);
  }

  return matched;
}

/**
 * Resolves a single company name string (e.g. supplied by the LLM as a tool
 * argument) against the known companies list, using the same normalized
 * matching as detectCompaniesInText. Prefers an exact normalized match over
 * a substring match.
 */
export function resolveCompanyByName<T extends MatchableCompany>(
  name: string,
  knownCompanies: T[]
): T | null {
  const normQuery = normalizeCompanyKey(name);
  if (!normQuery) return null;

  for (const comp of knownCompanies) {
    const candidates = buildCompanyCandidates(comp);
    if (candidates.some((c) => normalizeCompanyKey(c) === normQuery)) {
      return comp;
    }
  }

  const bySubstring = detectCompaniesInText(name, knownCompanies);
  return bySubstring[0] || null;
}
