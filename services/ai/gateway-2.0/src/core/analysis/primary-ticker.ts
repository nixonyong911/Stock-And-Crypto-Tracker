// Slice 2: deterministic primary-subject-ticker derivation.
//
// Trust tiers:
//   'marketaux_entities' (strong)    — derived in computeArticlePrimary /
//                                       computeStoryPrimary from MarketAux
//                                       entity match_score. Source-grounded.
//   'batch_heuristic'    (heuristic) — derived in computeMemoryPrimary as a
//                                       majority vote over the primary_ticker
//                                       of filtered-news rows whose
//                                       affected_tickers overlap the theme.
//   null                 (none)      — no signal available.
//
// All functions are pure and deterministic. Tie-breaks are alphabetical so
// the same input ALWAYS produces the same output. All bodies are wrapped in
// try/catch per project policy; on any internal failure we return null/null
// so the caller never blocks a write.

export type PrimaryTickerSource =
  | "marketaux_entities"
  | "batch_heuristic"
  | null;

export interface PrimaryTickerResult {
  primary_ticker: string | null;
  primary_ticker_source: PrimaryTickerSource;
}

const NULL_RESULT: PrimaryTickerResult = {
  primary_ticker: null,
  primary_ticker_source: null,
};

export interface ArticleForPrimary {
  source_api: string;
  // JSONB from unfiltered_news_combined; MarketAux stores
  // [{symbol, name, type, sentiment_score, match_score}, ...].
  entities: unknown;
}

interface NormalizedEntity {
  symbol: string;
  match_score: number;
}

function normalizeEntities(raw: unknown): NormalizedEntity[] {
  if (!Array.isArray(raw)) return [];
  const out: NormalizedEntity[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const obj = e as Record<string, unknown>;
    const symbol = obj.symbol;
    const matchScore = obj.match_score;
    if (typeof symbol !== "string" || symbol.trim() === "") continue;
    if (typeof matchScore !== "number" || !Number.isFinite(matchScore)) continue;
    out.push({
      symbol: symbol.trim().toUpperCase(),
      match_score: matchScore,
    });
  }
  return out;
}

/**
 * Derive the primary-subject ticker of a SINGLE raw article.
 *
 * Rule (deterministic):
 *   - Only MarketAux articles produce a non-null result; entities is the
 *     only source-grounded signal we have.
 *   - Sort entities by (match_score DESC, symbol ASC) and take the first.
 *   - Trust tier: 'marketaux_entities' on success, null on no signal.
 */
export function computeArticlePrimary(
  article: ArticleForPrimary,
): PrimaryTickerResult {
  try {
    if (article.source_api !== "marketaux") return NULL_RESULT;
    const entities = normalizeEntities(article.entities);
    if (entities.length === 0) return NULL_RESULT;
    entities.sort((a, b) => {
      if (b.match_score !== a.match_score) return b.match_score - a.match_score;
      return a.symbol.localeCompare(b.symbol);
    });
    return {
      primary_ticker: entities[0]!.symbol,
      primary_ticker_source: "marketaux_entities",
    };
  } catch {
    return NULL_RESULT;
  }
}

/**
 * Aggregate per-article primaries up to the LLM-grouped STORY level.
 *
 * Rule (deterministic):
 *   - Drop articles whose primary is null.
 *   - If none remain, return null/null.
 *   - Otherwise majority-vote the tickers, breaking ties alphabetically.
 *   - Trust tier is 'marketaux_entities' (every non-null contributor came
 *     from that path).
 */
export function computeStoryPrimary(
  articlePrimaries: ReadonlyArray<PrimaryTickerResult>,
): PrimaryTickerResult {
  try {
    const counts = new Map<string, number>();
    for (const ap of articlePrimaries) {
      if (!ap.primary_ticker) continue;
      const t = ap.primary_ticker.toUpperCase();
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    if (counts.size === 0) return NULL_RESULT;
    const sorted = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    return {
      primary_ticker: sorted[0]![0],
      primary_ticker_source: "marketaux_entities",
    };
  } catch {
    return NULL_RESULT;
  }
}

/**
 * Derive a memory theme's primary ticker via batch heuristic.
 *
 * Rule (deterministic, but heuristic — not source-grounded):
 *   - Consider only contributing stories whose affected_tickers overlap the
 *     theme's affected_tickers (case-insensitive set intersection).
 *   - Drop those whose primary_ticker is null.
 *   - Majority-vote, breaking ties alphabetically.
 *   - Trust tier is 'batch_heuristic' on success, null otherwise.
 */
export function computeMemoryPrimary(
  themeAffectedTickers: ReadonlyArray<string>,
  contributingStories: ReadonlyArray<{
    affected_tickers: ReadonlyArray<string>;
    primary_ticker: string | null;
  }>,
): PrimaryTickerResult {
  try {
    const themeSet = new Set(
      themeAffectedTickers
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.toUpperCase()),
    );
    if (themeSet.size === 0) return NULL_RESULT;

    const counts = new Map<string, number>();
    for (const story of contributingStories) {
      if (!story.primary_ticker) continue;
      const tickers = story.affected_tickers ?? [];
      const overlap = tickers.some(
        (t) => typeof t === "string" && themeSet.has(t.toUpperCase()),
      );
      if (!overlap) continue;
      const p = story.primary_ticker.toUpperCase();
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    if (counts.size === 0) return NULL_RESULT;

    const sorted = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });
    return {
      primary_ticker: sorted[0]![0],
      primary_ticker_source: "batch_heuristic",
    };
  } catch {
    return NULL_RESULT;
  }
}

/**
 * Maps a primary_ticker_source value to a human-readable trust tier label.
 * Used by digest-debug.ts. Exposed here so the docs/derivation rules and the
 * debug surface key off the same canonical mapping.
 */
export function trustTierOf(source: PrimaryTickerSource): "strong" | "heuristic" | "none" {
  if (source === "marketaux_entities") return "strong";
  if (source === "batch_heuristic") return "heuristic";
  return "none";
}

/**
 * Coerce a raw DB string into the typed `PrimaryTickerSource`. Unrecognized
 * values (including future source strings we haven't shipped code for)
 * collapse to `null` (trust tier "none") so the consumer safely falls back
 * to the position-primary heuristic.
 *
 * Canonical coercer shared by recommendation-engine.ts and digest-debug.ts
 * so both consumers normalize the DB value identically.
 */
export function coercePrimaryTickerSource(raw: string | null | undefined): PrimaryTickerSource {
  if (raw === "marketaux_entities") return "marketaux_entities";
  if (raw === "batch_heuristic") return "batch_heuristic";
  return null;
}
