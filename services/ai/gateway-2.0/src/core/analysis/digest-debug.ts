/**
 * Smart Digest debug inspection — single, side-effect-free read path.
 *
 * Builds a fully-structured `DigestDebugReport` for a single symbol so that
 * `/internal/debug-digest` (and, in pass 2, `scripts/preview-digest.ts`) can
 * expose:
 *
 *   - the full candidate signal list and the priority sort that picked the
 *     primary, including ties and tie-break behavior
 *   - all `analysis_market_memory` candidate rows (not just the chosen one)
 *     with per-row gates, rank metadata, and a `whyLost` string
 *   - the `BriefTruth` / `BriefDerived` for the primary signal
 *   - source freshness timestamps
 *   - deterministic fallback flags (which level filled `holdAbove`, whether
 *     crypto/index alias resolved memory, whether macro was suppressed, etc.)
 *   - the final `DigestBrief` produced by the production generator
 *
 * Architectural notes:
 *
 *   - The gate predicates (`memoryPassesContextGate`, `memoryPassesBlendGate`,
 *     `macroPassesGate`) and the `MACRO_SENTIMENT_GATE` constant are imported
 *     from `digest-brief-truth.ts`. This keeps the debug answer in lock-step
 *     with the production decision; we never re-declare the gates here.
 *   - This module never writes to Postgres or Redis, never calls Telegram, and
 *     never invokes an LLM. The only DB reads are `detectSignalsForTicker`
 *     (already shipped) and `fetchMemoryCandidatesForDebug` (one extra query
 *     for the un-filtered memory candidate set).
 *   - All DB I/O is wrapped in try/catch so a missing table or transient
 *     failure degrades the report rather than 500-ing the endpoint.
 */

import type { Pool } from "pg";
import type { FastifyBaseLogger } from "fastify";
import {
  detectSignalsForTicker,
  newsLookupCandidateSymbols,
  type TickerSignal,
  type MacroContext,
  type TickerMemoryText,
} from "./recommendation-engine.js";
import {
  generateDigestBrief,
  type DigestBrief,
} from "./digest-brief-generator.js";
import {
  gatherTruth,
  deriveSignals,
  memoryPassesContextGate,
  memoryPassesBlendGate,
  macroPassesGate,
  MACRO_SENTIMENT_GATE,
  type BriefTruth,
  type BriefDerived,
  type BriefMode,
} from "./digest-brief-truth.js";
import {
  computeSymbolAffinity,
  getAffinityMin,
  type AffinityResult,
} from "./digest-symbol-affinity.js";

// ── Public types ──────────────────────────────────────────────────────

export interface DigestDebugInput {
  symbol: string;
  assetType: "stock" | "crypto";
  mode: BriefMode;
  requestedAt: string;
}

export interface DigestDebugFreshness {
  /** From `analysis_ticker_price_targets.analysis_date` of the swing/long row. */
  priceTargetAnalysisDate: string | null;
  /** `last_updated` of the chosen `analysis_market_memory` row. */
  memoryChosenLastUpdated: string | null;
  /** Newest `last_updated` across ALL memory candidates (not just the chosen). */
  memoryNewestLastUpdated: string | null;
  /** Wall-clock ISO of the debug call so reviewers can measure staleness. */
  requestedAt: string;
}

export interface CandidateSummary {
  index: number;
  type: TickerSignal["type"];
  priority: TickerSignal["priority"];
  headline: string;
  timeframeAlignment: TickerSignal["timeframeAlignment"];
  /** Names of populated keys on `rawData` (no values, to keep the summary lean). */
  rawDataKeys: string[];
}

export interface SortedCandidate {
  /** Index back into `original`. */
  index: number;
  type: TickerSignal["type"];
  priority: TickerSignal["priority"];
  /** 0-based position in the sorted list. */
  rank: number;
}

export interface CandidateRanking {
  original: CandidateSummary[];
  sorted: SortedCandidate[];
  tieGroups: Array<{ priority: TickerSignal["priority"]; indices: number[] }>;
  tieBreak: {
    used: boolean;
    mechanism: "stable-sort-original-order" | "n/a";
    note: string;
  };
  /** Index in `original` (not `sorted`) of the chosen primary. */
  primaryIndexInOriginal: number | null;
  rationale: string;
}

export interface DebugAffinity {
  /** Sum of bonus/penalty weights applied. */
  score: number;
  /** Threshold this candidate was compared against. */
  threshold: number;
  /**
   * Stable, debug-friendly codes from `computeSymbolAffinity` (e.g.
   * `"text_token_hit:BTC"`, `"position_primary_miss:position=2"`,
   * `"broad_tag_penalty:n=14"`). Order is deterministic.
   */
  reasons: string[];
  /** True iff `score >= threshold`. */
  passed: boolean;
}

export interface DebugMemoryCandidate {
  theme: string | null;
  category: string | null;
  impactLevel: string | null;
  relevanceScore: number | null;
  sentimentScore: number | null;
  affectedTickers: string[];
  lastUpdated: string | null;
  newsOneLiner: string | null;
  summary: string | null;
  /** Numeric ranking key — auditable mirror of the production sort. */
  rankKey: { impactRank: number; relevance: number };
  chosen: boolean;
  whyLost: string | null;
  gates: { contextGatePassed: boolean; blendGatePassed: boolean };
  /**
   * Per-(row, digest-symbol) affinity decision. Populated for every
   * candidate so reviewers can see what *would* have qualified, not just
   * what won. Threshold defaults to `getAffinityMin()` but the debug
   * inspector always echoes the value it used.
   */
  affinity: DebugAffinity;
}

export interface DebugMemorySection {
  candidates: DebugMemoryCandidate[];
  aliasResolution: {
    symbolUpper: string;
    candidatesTried: string[];
    chosenHitVia: string | null;
  };
  chosenIndex: number | null;
}

export interface DebugMacroSection {
  headlines: string[];
  dominantTheme: string | null;
  overallSentiment: number;
  gatePassed: boolean;
  gateThreshold: number;
}

export interface DebugFallbacks {
  holdAboveSource: "entryLow" | "periodLow" | "ema20" | "none";
  breakBelowSource: "stopLoss" | "none";
  contextSource: "news_one_liner" | "macro" | "none";
  /** True iff the chosen memory row matched on a non-symbol alias (e.g. BTC for BTC/USD). */
  memoryAliasResolved: boolean;
  /** True iff per-ticker memoryText was suppressed because primary is `news_sentiment`. */
  memoryDroppedForNewsSentiment: boolean;
  /** True iff the brief came from `neutralFallbackBrief` (no candidate signals). */
  neutralFallbackUsed: boolean;
}

export interface DigestDebugReport {
  input: DigestDebugInput;
  freshness: DigestDebugFreshness;
  candidateSignals: CandidateRanking;
  primary: TickerSignal | null;
  truth: BriefTruth | null;
  derived: BriefDerived | null;
  memory: DebugMemorySection;
  macro: DebugMacroSection;
  fallbacks: DebugFallbacks;
  brief: DigestBrief;
  notes: string[];
}

export interface BuildDigestDebugReportDeps {
  db: Pool;
  log: FastifyBaseLogger;
}

export interface BuildDigestDebugReportArgs {
  symbol: string;
  assetType: "stock" | "crypto";
  mode?: BriefMode;
}

// ── Constants ─────────────────────────────────────────────────────────

/**
 * Mirror of `IMPACT_RANK` in `recommendation-engine.ts`. Kept here as a small
 * private copy because the debug module only needs the ranking, not the rest
 * of the engine internals. If the production order ever changes, it changes
 * in both places (verified by `digest-debug.test.ts`).
 */
const IMPACT_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Mirror of `PRIORITY_ORDER` in `digest-brief-generator.ts`. */
const PRIORITY_ORDER: Record<TickerSignal["priority"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// ── DB row shape ──────────────────────────────────────────────────────

interface MemoryDebugRow {
  theme: string | null;
  category: string | null;
  affected_tickers: string[] | null;
  news_one_liner: string | null;
  summary: string | null;
  impact_level: string | null;
  relevance_score: string | null;
  sentiment_score: string | null;
  last_updated: string | null;
}

// ── Pure helpers ──────────────────────────────────────────────────────

function impactRank(level: string | null): number {
  if (!level) return 9;
  return IMPACT_RANK[level.toLowerCase()] ?? 9;
}

function toNum(val: string | null | undefined): number | null {
  if (val == null) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function isFinitePositive(n: number | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * Apply `PRIORITY_ORDER` to the candidate signals using a stable sort and
 * return everything a reviewer needs to understand the selection: the
 * original order, the sorted order, every tie group, the tie-break
 * mechanism, the chosen index, and a human-readable rationale.
 *
 * Pure / no I/O — safe to unit-test directly.
 */
export function rankCandidates(signals: TickerSignal[]): CandidateRanking {
  const original: CandidateSummary[] = signals.map((s, i) => ({
    index: i,
    type: s.type,
    priority: s.priority,
    headline: s.headline,
    timeframeAlignment: s.timeframeAlignment,
    rawDataKeys: Object.entries(s.rawData)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k]) => k),
  }));

  if (signals.length === 0) {
    return {
      original,
      sorted: [],
      tieGroups: [],
      tieBreak: {
        used: false,
        mechanism: "n/a",
        note: "no candidate signals",
      },
      primaryIndexInOriginal: null,
      rationale: "no candidate signals — neutral fallback brief",
    };
  }

  // Array.prototype.sort is stable in V8 (matches `selectPrimary` in
  // `digest-brief-generator.ts`), so ties resolve by original detection
  // order from `detectForTicker`. We mirror that here.
  const indexed = signals.map((s, i) => ({ s, i }));
  indexed.sort(
    (a, b) => PRIORITY_ORDER[a.s.priority] - PRIORITY_ORDER[b.s.priority],
  );

  const sorted: SortedCandidate[] = indexed.map(({ s, i }, rank) => ({
    index: i,
    type: s.type,
    priority: s.priority,
    rank,
  }));

  const groupsMap = new Map<TickerSignal["priority"], number[]>();
  for (const { s, i } of indexed) {
    let arr = groupsMap.get(s.priority);
    if (!arr) {
      arr = [];
      groupsMap.set(s.priority, arr);
    }
    arr.push(i);
  }
  const tieGroups: CandidateRanking["tieGroups"] = [];
  for (const [priority, indices] of groupsMap) {
    if (indices.length >= 2) {
      tieGroups.push({
        priority,
        indices: [...indices].sort((a, b) => a - b),
      });
    }
  }

  const winner = indexed[0]!;
  const primaryIndexInOriginal = winner.i;
  const winnerGroup = tieGroups.find((g) => g.indices.includes(winner.i));
  const tieUsed = !!winnerGroup;

  let rationale: string;
  if (signals.length === 1) {
    rationale = `primary = candidates[0] (${winner.s.type}, ${winner.s.priority}). Only candidate.`;
  } else if (tieUsed) {
    rationale =
      `primary = candidates[${winner.i}] (${winner.s.type}, ${winner.s.priority}). ` +
      `Tied at priority=${winner.s.priority} with indices [${winnerGroup!.indices.join(",")}]; ` +
      `stable sort kept the earliest-detected (index ${winner.i}).`;
  } else {
    const next = indexed[1]!;
    rationale =
      `primary = candidates[${winner.i}] (${winner.s.type}, ${winner.s.priority}). ` +
      `Beat ${next.s.type} (${next.s.priority}) on PRIORITY_ORDER (high<medium<low). No ties.`;
  }

  const tieBreakNote = tieUsed
    ? `tied at priority=${winner.s.priority} with indices [${winnerGroup!.indices.join(",")}]; selected index ${winner.i} via stable sort original order`
    : `no ties: priorities were [${signals.map((s) => s.priority).join(", ")}]`;

  return {
    original,
    sorted,
    tieGroups,
    tieBreak: {
      used: tieUsed,
      mechanism: tieUsed ? "stable-sort-original-order" : "n/a",
      note: tieBreakNote,
    },
    primaryIndexInOriginal,
    rationale,
  };
}

/**
 * Mirror of the level cascade in `deriveLevelsFromTruth`:
 *   holdAbove: entryLow -> periodLow -> ema20 -> "—" (none)
 *   breakBelowTarget: stopLoss -> "—" (none)
 *
 * Returns the source name a reviewer can compare to the production answer
 * without re-implementing the format logic.
 */
export function inferLevelFallback(truth: BriefTruth): {
  holdAboveSource: DebugFallbacks["holdAboveSource"];
  breakBelowSource: DebugFallbacks["breakBelowSource"];
} {
  if (!isFinitePositive(truth.price)) {
    return { holdAboveSource: "none", breakBelowSource: "none" };
  }

  let holdAboveSource: DebugFallbacks["holdAboveSource"] = "none";
  if (isFinitePositive(truth.levels.entryLow)) {
    holdAboveSource = "entryLow";
  } else if (isFinitePositive(truth.levels.periodLow)) {
    holdAboveSource = "periodLow";
  } else if (isFinitePositive(truth.levels.ema20)) {
    holdAboveSource = "ema20";
  }

  const breakBelowSource: DebugFallbacks["breakBelowSource"] =
    isFinitePositive(truth.levels.stopLoss) ? "stopLoss" : "none";

  return { holdAboveSource, breakBelowSource };
}

/**
 * Forwarder over `BriefDerived.contextSource`. Lives here so reviewers can
 * see the fallback decision at the same layer of the report as the level
 * cascade, without having to inspect `derived.contextSource` separately.
 */
export function inferContextFallback(
  derived: BriefDerived,
): DebugFallbacks["contextSource"] {
  return derived.contextSource;
}

/**
 * Re-evaluate the same context/blend gates the production code uses on a
 * candidate memory row. We promote the row to a `TickerMemoryText`-shaped
 * object first so the imported predicates are byte-identical to production.
 */
export function evaluateMemoryGates(candidate: DebugMemoryCandidate): {
  contextGatePassed: boolean;
  blendGatePassed: boolean;
} {
  const memoryText: TickerMemoryText = {};
  if (candidate.newsOneLiner) memoryText.newsOneLiner = candidate.newsOneLiner;
  if (candidate.summary) memoryText.summary = candidate.summary;
  if (
    candidate.impactLevel === "critical" ||
    candidate.impactLevel === "high" ||
    candidate.impactLevel === "medium" ||
    candidate.impactLevel === "low"
  ) {
    memoryText.impactLevel = candidate.impactLevel;
  }
  if (candidate.relevanceScore != null) {
    memoryText.relevanceScore = candidate.relevanceScore;
  }
  // Forward `lastUpdated` so the freshness gate added in B1 receives the
  // same field the production code uses; without it every debug
  // candidate would fail the gate.
  if (candidate.lastUpdated) {
    memoryText.lastUpdated = candidate.lastUpdated;
  }
  return {
    contextGatePassed: memoryPassesContextGate(memoryText),
    blendGatePassed: memoryPassesBlendGate(memoryText),
  };
}

/**
 * Re-evaluate the macro gate against the same `MacroContext` the engine
 * built for the production brief.
 */
export function evaluateMacroGate(macro: MacroContext): {
  gatePassed: boolean;
  gateThreshold: number;
} {
  const surrogate =
    macro.dominantTheme && Number.isFinite(macro.overallSentiment)
      ? {
          dominantTheme: macro.dominantTheme,
          overallSentiment: macro.overallSentiment,
        }
      : undefined;
  return {
    gatePassed: macroPassesGate(surrogate),
    gateThreshold: MACRO_SENTIMENT_GATE,
  };
}

/**
 * Build the `aliasResolution` block: which aliases were tried, and which
 * alias the chosen memory row's `affected_tickers` actually intersected on.
 * If multiple aliases match, we prefer the exact symbol so the trace is
 * stable across runs.
 */
export function buildAliasResolutionTrace(
  symbol: string,
  candidatesTried: string[],
  chosenRow: { affected_tickers: string[] | null } | null,
): DebugMemorySection["aliasResolution"] {
  const symbolUpper = symbol.toUpperCase();
  let chosenHitVia: string | null = null;
  if (chosenRow && Array.isArray(chosenRow.affected_tickers)) {
    const triedSet = new Set(candidatesTried.map((s) => s.toUpperCase()));
    let exactMatch: string | null = null;
    let firstMatch: string | null = null;
    for (const t of chosenRow.affected_tickers) {
      const u = (t ?? "").toUpperCase();
      if (!triedSet.has(u)) continue;
      if (u === symbolUpper) {
        exactMatch = u;
        break;
      }
      if (firstMatch === null) firstMatch = u;
    }
    chosenHitVia = exactMatch ?? firstMatch;
  }
  return { symbolUpper, candidatesTried, chosenHitVia };
}

// ── Memory candidate fetch + ranking ──────────────────────────────────

/**
 * Load every `analysis_market_memory` row whose `affected_tickers`
 * intersects the symbol's alias set, score it for symbol affinity (step 3
 * gate), and return the full list sorted by the production ranking key:
 *
 *   1. lowest IMPACT_RANK
 *   2. highest affinity score
 *   3. freshest `last_updated`
 *   4. highest `relevance_score`
 *
 * The `chosen` flag is set on the highest-ranked row whose
 * `affinity.passed === true` — i.e. the row production would actually
 * surface, after the contamination filter has run. If no candidate
 * passes affinity, no row is chosen and `whyLost` cites the affinity gate
 * for each one.
 *
 * The query mirrors `fetchTickerMemoryText` but selects ALL rows that
 * survive the `affected_tickers && $1::text[]` filter rather than picking
 * a single winner. One extra DB call vs production — acceptable on the
 * manual debug path.
 */
export async function fetchMemoryCandidatesForDebug(
  db: Pool,
  symbol: string,
): Promise<DebugMemoryCandidate[]> {
  const candidatesTried = newsLookupCandidateSymbols(symbol).map((s) =>
    s.toUpperCase(),
  );
  if (candidatesTried.length === 0) return [];

  let rows: MemoryDebugRow[];
  try {
    const res = await db.query<MemoryDebugRow>(
      `SELECT theme, category, affected_tickers, news_one_liner, summary,
              impact_level,
              relevance_score::text AS relevance_score,
              sentiment_score::text AS sentiment_score,
              last_updated::text AS last_updated
         FROM analysis_market_memory
        WHERE status IN ('active', 'fading')
          AND affected_tickers && $1::text[]`,
      [candidatesTried],
    );
    rows = res.rows;
  } catch {
    // analysis_market_memory may not exist in some environments; degrade
    // to an empty candidate list rather than 500-ing the debug endpoint.
    return [];
  }

  if (rows.length === 0) return [];

  const symbolUpper = symbol.toUpperCase();
  const affinityThreshold = getAffinityMin();

  const enriched = rows.map((row) => {
    const tickers = Array.isArray(row.affected_tickers)
      ? row.affected_tickers
      : [];
    const affinity: AffinityResult = computeSymbolAffinity({
      theme: row.theme,
      newsOneLiner: row.news_one_liner,
      affectedTickers: tickers,
      symbolUpper,
      aliases: candidatesTried,
      threshold: affinityThreshold,
    });
    return {
      row,
      tickers,
      impact: impactRank(row.impact_level),
      relevance: toNum(row.relevance_score) ?? 0,
      lastUpdatedMs: row.last_updated ? Date.parse(row.last_updated) : 0,
      affinity,
    };
  });

  // Production sort: impact ASC, affinity DESC, freshness DESC, relevance DESC.
  enriched.sort((a, b) => {
    if (a.impact !== b.impact) return a.impact - b.impact;
    if (a.affinity.score !== b.affinity.score) {
      return b.affinity.score - a.affinity.score;
    }
    const tsA = Number.isFinite(a.lastUpdatedMs) ? a.lastUpdatedMs : 0;
    const tsB = Number.isFinite(b.lastUpdatedMs) ? b.lastUpdatedMs : 0;
    if (tsA !== tsB) return tsB - tsA;
    return b.relevance - a.relevance;
  });

  // Chosen = highest-ranked row that passed affinity. May be null if every
  // candidate is contaminated.
  const chosenIdx = enriched.findIndex((e) => e.affinity.passed);

  return enriched.map(({ row, tickers, impact, relevance, affinity }, idx) => {
    const candidate: DebugMemoryCandidate = {
      theme: row.theme,
      category: row.category,
      impactLevel: row.impact_level,
      relevanceScore: toNum(row.relevance_score),
      sentimentScore: toNum(row.sentiment_score),
      affectedTickers: tickers,
      lastUpdated: row.last_updated,
      newsOneLiner: row.news_one_liner,
      summary: row.summary,
      rankKey: { impactRank: impact, relevance },
      chosen: idx === chosenIdx,
      whyLost: null,
      gates: { contextGatePassed: false, blendGatePassed: false },
      affinity: {
        score: affinity.score,
        threshold: affinity.threshold,
        reasons: affinity.reasons,
        passed: affinity.passed,
      },
    };
    candidate.gates = evaluateMemoryGates(candidate);
    return candidate;
  });
}

/**
 * Populate `whyLost` on every non-chosen row, in place.
 *
 * Branches:
 *   - If a row failed the affinity gate, `whyLost` cites the gate plus the
 *     specific affinity reasons that drove the score below threshold —
 *     reviewers can see exactly which signal was missing.
 *   - If a row passed affinity but lost on impact/affinity/freshness, the
 *     classic comparison branches still apply.
 *   - When no row was chosen (every candidate failed affinity), every row
 *     gets the "rejected by affinity" reason and we do not attempt to
 *     build pairwise comparisons.
 */
function annotateWhyLost(candidates: DebugMemoryCandidate[]): void {
  if (candidates.length === 0) return;
  const chosen = candidates.find((c) => c.chosen);
  for (const c of candidates) {
    if (c.chosen) continue;
    if (!c.affinity.passed) {
      c.whyLost = `affinity score ${c.affinity.score} < threshold ${c.affinity.threshold}: ${c.affinity.reasons.join(", ")}`;
      continue;
    }
    if (!chosen) {
      // Should be unreachable when affinity passed — kept defensive.
      c.whyLost = "no chosen row to compare against";
      continue;
    }
    if (c.rankKey.impactRank !== chosen.rankKey.impactRank) {
      c.whyLost = `impact=${c.impactLevel ?? "unknown"} ranked behind chosen impact=${chosen.impactLevel ?? "unknown"}`;
      continue;
    }
    if (c.affinity.score !== chosen.affinity.score) {
      c.whyLost =
        `impact=${c.impactLevel ?? "unknown"} tied with chosen but affinity ${c.affinity.score} < chosen ${chosen.affinity.score}`;
      continue;
    }
    const tsA = c.lastUpdated ? Date.parse(c.lastUpdated) : 0;
    const tsB = chosen.lastUpdated ? Date.parse(chosen.lastUpdated) : 0;
    if (tsA < tsB) {
      c.whyLost =
        `impact=${c.impactLevel ?? "unknown"} affinity=${c.affinity.score} tied with chosen but last_updated older than chosen`;
      continue;
    }
    if (c.rankKey.relevance < chosen.rankKey.relevance) {
      c.whyLost =
        `impact=${c.impactLevel ?? "unknown"} affinity=${c.affinity.score} tied with chosen on impact/affinity/freshness; relevance ${c.rankKey.relevance.toFixed(2)} < chosen ${chosen.rankKey.relevance.toFixed(2)}`;
      continue;
    }
    c.whyLost = `tied with chosen on full rank key; lost on first-seen tiebreak`;
  }
}

// ── Notes builder ─────────────────────────────────────────────────────

/**
 * Flatten the report's deterministic state into a few human-readable lines
 * a reviewer can skim. Pure: every note is a function of the structured
 * fields above, never of external state.
 */
export function buildNotes(report: {
  candidateSignals: CandidateRanking;
  derived: BriefDerived | null;
  memory: DebugMemorySection;
  macro: DebugMacroSection;
  fallbacks: DebugFallbacks;
}): string[] {
  const notes: string[] = [];
  const { candidateSignals, derived, memory, macro, fallbacks } = report;

  if (fallbacks.neutralFallbackUsed) {
    notes.push("no candidate signals — neutral fallback brief");
  } else if (candidateSignals.tieBreak.used) {
    notes.push(
      `primary tied at priority — selected via stable sort original order. ${candidateSignals.tieBreak.note}`,
    );
  } else if (
    candidateSignals.original.length > 0 &&
    candidateSignals.primaryIndexInOriginal != null
  ) {
    const winner =
      candidateSignals.original[candidateSignals.primaryIndexInOriginal]!;
    notes.push(
      `primary chosen by PRIORITY_ORDER: ${winner.priority}${candidateSignals.original.length > 1 ? " beats lower priorities" : ""} (no ties)`,
    );
  }

  if (
    memory.aliasResolution.chosenHitVia &&
    memory.aliasResolution.chosenHitVia !== memory.aliasResolution.symbolUpper
  ) {
    notes.push(
      `memory matched on alias ${memory.aliasResolution.chosenHitVia} (digest symbol ${memory.aliasResolution.symbolUpper})`,
    );
  }

  // Affinity gate aggregate — visible regardless of which context source
  // (or none) won, so reviewers can always see how many candidates were
  // rejected for being technically-matched-but-semantically-wrong.
  const failedCandidates = memory.candidates.filter((c) => !c.affinity.passed);
  if (failedCandidates.length > 0) {
    const reasonCounts = new Map<string, number>();
    for (const c of failedCandidates) {
      const seenInRow = new Set<string>();
      for (const reason of c.affinity.reasons) {
        const code = reason.split(":")[0] ?? reason;
        if (!code.endsWith("_miss") && !code.endsWith("_penalty")) continue;
        if (seenInRow.has(code)) continue;
        seenInRow.add(code);
        reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);
      }
    }
    const breakdown = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => `${code} (${n})`)
      .join(", ");
    const threshold =
      memory.candidates[0]?.affinity.threshold ?? failedCandidates[0]!.affinity.threshold;
    notes.push(
      `affinity gate rejected ${failedCandidates.length} candidate${failedCandidates.length === 1 ? "" : "s"} (threshold=${threshold})${breakdown ? ` — reasons: ${breakdown}` : ""}`,
    );
  }

  if (derived) {
    if (derived.contextSource === "news_one_liner") {
      const chosen = memory.candidates.find((c) => c.chosen);
      const others = memory.candidates.length - (chosen ? 1 : 0);
      if (chosen) {
        const rel =
          chosen.relevanceScore != null
            ? chosen.relevanceScore.toFixed(2)
            : "n/a";
        notes.push(
          `context resolved from analysis_market_memory.news_one_liner (impact=${chosen.impactLevel ?? "?"}, relevance=${rel}, affinity=${chosen.affinity.score})${others > 0 ? `; ${others} other candidate${others === 1 ? "" : "s"} considered, see memory.candidates` : ""}`,
        );
      }
    } else if (derived.contextSource === "macro") {
      notes.push(
        `context resolved from macro (dominantTheme=${macro.dominantTheme ?? "?"}, sentiment=${macro.overallSentiment.toFixed(2)})`,
      );
    } else {
      // Context omitted. Distinguish between "no candidate passed affinity"
      // (the new step-3 outcome) and "chosen passed affinity but failed the
      // older impact/relevance gate" (legacy outcome, still possible).
      const passedCandidates = memory.candidates.filter((c) => c.affinity.passed);
      if (memory.candidates.length > 0 && passedCandidates.length === 0) {
        notes.push(
          "context omitted because no candidate passed affinity (impact present, but row was not on-symbol)",
        );
      } else {
        const chosen = memory.candidates.find((c) => c.chosen);
        if (chosen && !chosen.gates.contextGatePassed) {
          const rel =
            chosen.relevanceScore != null
              ? chosen.relevanceScore.toFixed(2)
              : "n/a";
          notes.push(
            `chosen memory failed context gate (impact=${chosen.impactLevel ?? "?"}, relevance=${rel}); context line empty`,
          );
        }
      }
      if (
        macro.dominantTheme &&
        Number.isFinite(macro.overallSentiment) &&
        !macro.gatePassed
      ) {
        notes.push(
          `macro sentiment ${macro.overallSentiment.toFixed(2)} below |${macro.gateThreshold}| gate — macro context suppressed`,
        );
      }
    }
  }

  if (fallbacks.memoryDroppedForNewsSentiment) {
    notes.push(
      "primary is news_sentiment — per-ticker memoryText deliberately suppressed in truth to avoid double-stating",
    );
  }

  if (
    fallbacks.holdAboveSource !== "entryLow" &&
    fallbacks.holdAboveSource !== "none"
  ) {
    notes.push(
      `holdAbove fell back to ${fallbacks.holdAboveSource} (entryLow not available)`,
    );
  } else if (fallbacks.holdAboveSource === "none" && !fallbacks.neutralFallbackUsed) {
    notes.push("holdAbove em-dash: no entryLow / periodLow / ema20 available");
  }

  if (fallbacks.breakBelowSource === "none" && !fallbacks.neutralFallbackUsed) {
    notes.push("breakBelowTarget em-dash: stop_loss not available");
  }

  return notes;
}

// ── Entry point ───────────────────────────────────────────────────────

/**
 * Build the full `DigestDebugReport` for a single symbol. Pulls the
 * candidate signal list and macro/news inputs from the production engine,
 * the un-filtered memory candidate set from a debug-only loader, then runs
 * `gatherTruth → deriveSignals` for the chosen primary and
 * `generateDigestBrief` for the brief itself — so the `brief` field of the
 * report is byte-identical to what production would ship.
 *
 * Side effects: none. Errors in `detectSignalsForTicker` propagate (the
 * endpoint will turn them into a 500); errors in
 * `fetchMemoryCandidatesForDebug` degrade silently to an empty candidate
 * list because the rest of the report is still useful without memory rows.
 */
export async function buildDigestDebugReport(
  deps: BuildDigestDebugReportDeps,
  args: BuildDigestDebugReportArgs,
): Promise<DigestDebugReport> {
  const { db, log } = deps;
  const symbolUpper = args.symbol.trim().toUpperCase();
  const assetType = args.assetType;
  const mode: BriefMode = args.mode ?? "strict";
  const requestedAt = new Date().toISOString();

  let signalsResult: Awaited<ReturnType<typeof detectSignalsForTicker>>;
  try {
    signalsResult = await detectSignalsForTicker(db, symbolUpper, assetType);
  } catch (err) {
    log.error(
      { err, symbol: symbolUpper, assetType },
      "debug-digest: detectSignalsForTicker failed",
    );
    throw err;
  }

  let memCandidates: DebugMemoryCandidate[] = [];
  try {
    memCandidates = await fetchMemoryCandidatesForDebug(db, symbolUpper);
  } catch (err) {
    log.warn(
      { err, symbol: symbolUpper },
      "debug-digest: fetchMemoryCandidatesForDebug failed; continuing with empty candidates",
    );
    memCandidates = [];
  }
  annotateWhyLost(memCandidates);

  const {
    signals,
    macroContext,
    newsOneLinerMap,
    memoryTextMap,
    analysisDateMap,
  } = signalsResult;

  const ranking = rankCandidates(signals);

  const triedAliases = newsLookupCandidateSymbols(symbolUpper).map((s) =>
    s.toUpperCase(),
  );
  // The chosen memory candidate is now the highest-ranked passing row, not
  // necessarily index 0 — `fetchMemoryCandidatesForDebug` already set
  // `chosen=true` on it. Use that directly so alias resolution and
  // chosenIndex match production's actual selection.
  const chosenMemIdx = memCandidates.findIndex((c) => c.chosen);
  const chosenMemRow =
    chosenMemIdx >= 0 ? memCandidates[chosenMemIdx]! : null;
  const aliasResolution = buildAliasResolutionTrace(
    symbolUpper,
    triedAliases,
    chosenMemRow
      ? { affected_tickers: chosenMemRow.affectedTickers }
      : null,
  );

  const macroSection: DebugMacroSection = {
    headlines: macroContext.headlines,
    dominantTheme: macroContext.dominantTheme,
    overallSentiment: macroContext.overallSentiment,
    ...evaluateMacroGate(macroContext),
  };

  const memorySection: DebugMemorySection = {
    candidates: memCandidates,
    aliasResolution,
    chosenIndex: chosenMemIdx >= 0 ? chosenMemIdx : null,
  };

  // Build the final brief using the production generator. This guarantees
  // the `brief` field exactly matches what `processRecommendations` would
  // hand to `renderSmartDigestCard` for the same DB state.
  const brief = generateDigestBrief({
    signals,
    symbol: symbolUpper,
    macroContext,
    newsOneLinerMap,
    memoryTextMap,
    analysisDateMap,
    mode,
  });

  let primary: TickerSignal | null = null;
  let truth: BriefTruth | null = null;
  let derived: BriefDerived | null = null;
  let memoryDroppedForNewsSentiment = false;

  if (signals.length > 0 && ranking.primaryIndexInOriginal != null) {
    primary = signals[ranking.primaryIndexInOriginal]!;
    const chosenMemoryText = memoryTextMap.get(symbolUpper);
    if (primary.type === "news_sentiment" && chosenMemoryText) {
      memoryDroppedForNewsSentiment = true;
    }
    const memoryForTruth =
      primary.type === "news_sentiment" ? undefined : chosenMemoryText;
    const analysisDate = analysisDateMap.get(symbolUpper);
    truth = gatherTruth({
      signal: primary,
      macroContext,
      memoryText: memoryForTruth,
      analysisDate,
    });
    derived = deriveSignals(truth);
  }

  const fallbacks: DebugFallbacks = {
    holdAboveSource: "none",
    breakBelowSource: "none",
    contextSource: derived ? derived.contextSource : "none",
    memoryAliasResolved:
      !!aliasResolution.chosenHitVia &&
      aliasResolution.chosenHitVia !== aliasResolution.symbolUpper,
    memoryDroppedForNewsSentiment,
    neutralFallbackUsed: signals.length === 0,
  };

  if (truth) {
    const levelInfer = inferLevelFallback(truth);
    fallbacks.holdAboveSource = levelInfer.holdAboveSource;
    fallbacks.breakBelowSource = levelInfer.breakBelowSource;
  }

  const newestMemUpdate =
    memCandidates.length > 0
      ? (memCandidates
          .map((c) => c.lastUpdated)
          .filter((s): s is string => !!s)
          .sort()
          .at(-1) ?? null)
      : null;

  const freshness: DigestDebugFreshness = {
    priceTargetAnalysisDate: truth?.dataAsOf ?? null,
    // chosenMemRow above is the affinity-passing winner (or null when no
    // candidate passed). `memoryNewestLastUpdated` still surveys the
    // un-filtered candidate set so reviewers can spot when a fresher row
    // exists but lost on rank or affinity.
    memoryChosenLastUpdated: chosenMemRow?.lastUpdated ?? null,
    memoryNewestLastUpdated: newestMemUpdate,
    requestedAt,
  };

  const notes = buildNotes({
    candidateSignals: ranking,
    derived,
    memory: memorySection,
    macro: macroSection,
    fallbacks,
  });

  return {
    input: {
      symbol: symbolUpper,
      assetType,
      mode,
      requestedAt,
    },
    freshness,
    candidateSignals: ranking,
    primary,
    truth,
    derived,
    memory: memorySection,
    macro: macroSection,
    fallbacks,
    brief,
    notes,
  };
}
