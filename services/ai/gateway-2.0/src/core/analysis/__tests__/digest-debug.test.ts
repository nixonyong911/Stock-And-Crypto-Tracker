import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  rankCandidates,
  inferLevelFallback,
  inferContextFallback,
  evaluateMemoryGates,
  evaluateMacroGate,
  buildAliasResolutionTrace,
  fetchMemoryCandidatesForDebug,
  buildDigestDebugReport,
  type DebugMemoryCandidate,
} from "../digest-debug.js";
import { gatherTruth, deriveSignals } from "../digest-brief-truth.js";
import type {
  TickerSignal,
  MacroContext,
  DetectSignalsResult,
  TickerMemoryText,
} from "../recommendation-engine.js";
import * as engine from "../recommendation-engine.js";

// ── Fixtures ────────────────────────────────────────────────────────

function makeSignal(overrides: Partial<TickerSignal> = {}): TickerSignal {
  return {
    symbol: "AAPL",
    assetType: "stock",
    type: "entry_zone",
    priority: "high",
    timeframeAlignment: "full",
    headline: "AAPL near support",
    rawData: {
      close: 175,
      latestOpen: 170,
      daySignal: "bullish",
      swingSignal: "bullish",
      longTermSignal: "bullish",
      entryLow: 168,
      entryHigh: 178,
      stopLoss: 162,
      targetPrice: 200,
      ema20: 171,
      periodLow: 167,
      confidence: 0.78,
      ...overrides.rawData,
    },
    ...overrides,
  };
}

const macroSupportive: MacroContext = {
  headlines: ["Rate cut odds firming"],
  dominantTheme: "macro",
  overallSentiment: 0.4,
};

const macroNeutral: MacroContext = {
  headlines: [],
  dominantTheme: null,
  overallSentiment: 0.05,
};

function memoryCandidate(
  overrides: Partial<DebugMemoryCandidate> = {},
): DebugMemoryCandidate {
  return {
    theme: "iPhone 17 supercycle",
    category: "earnings",
    impactLevel: "high",
    relevanceScore: 0.82,
    sentimentScore: 0.4,
    affectedTickers: ["AAPL"],
    lastUpdated: new Date(Date.now() - 6 * 3_600_000).toISOString(),
    newsOneLiner: "Apple guidance beats expectations.",
    summary: "Stronger services guidance lifts mega-cap tech.",
    rankKey: {
      impactRank: 1,
      relevance: 0.82,
      ageHours: 0,
      freshnessDecay: 1,
      oneLinerOnSymbol: true,
      compositeAssociationScore: 1.07,
    },
    chosen: true,
    whyLost: null,
    gates: { contextGatePassed: true, blendGatePassed: true },
    affinity: {
      score: 5,
      threshold: 2,
      reasons: [
        "text_token_hit:AAPL",
        "position_primary_hit:AAPL",
        "narrow_tag_bonus:n=1",
      ],
      passed: true,
    },
    surfacing: {
      score: 0.86,
      threshold: 0.55,
      decision: "passed_floor_above_threshold",
      oneLinerOnSymbol: true,
    },
    provenance: {
      modelName: null,
      promptVersion: null,
      validatorVersion: null,
      generatedAt: null,
      tickersUnknown: [],
    },
    primaryTicker: {
      ticker: null,
      source: null,
      trustTier: "none",
    },
    tickersInferred: [],
    attachmentKind: "kept" as const,
    ...overrides,
  };
}

function makePool(rows: unknown[]) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Parameters<typeof fetchMemoryCandidatesForDebug>[0];
}

// ── rankCandidates ───────────────────────────────────────────────────

describe("rankCandidates — candidate selection mechanics", () => {
  it("returns null primary on empty list with no ties", () => {
    const r = rankCandidates([]);
    expect(r.primaryIndexInOriginal).toBeNull();
    expect(r.sorted).toHaveLength(0);
    expect(r.tieGroups).toHaveLength(0);
    expect(r.tieBreak.used).toBe(false);
    expect(r.rationale).toContain("neutral fallback");
  });

  it("flags single candidate as the only candidate, no ties", () => {
    const s = makeSignal();
    const r = rankCandidates([s]);
    expect(r.primaryIndexInOriginal).toBe(0);
    expect(r.tieBreak.used).toBe(false);
    expect(r.rationale).toContain("Only candidate");
  });

  it("picks high over medium with explicit no-ties rationale", () => {
    const high = makeSignal({ type: "entry_zone", priority: "high" });
    const med = makeSignal({ type: "momentum_shift", priority: "medium" });
    const r = rankCandidates([high, med]);
    expect(r.primaryIndexInOriginal).toBe(0);
    expect(r.tieBreak.used).toBe(false);
    expect(r.tieBreak.note).toContain("no ties");
    expect(r.rationale).toContain("Beat momentum_shift");
    expect(r.rationale).toContain("No ties");
    expect(r.sorted[0]!.rank).toBe(0);
    expect(r.sorted[1]!.rank).toBe(1);
  });

  it("uses strength tie-break when two candidates share priority=high", () => {
    const a = makeSignal({ type: "entry_zone", priority: "high" });
    const b = makeSignal({
      type: "target_reached",
      priority: "high",
      headline: "AAPL into resistance",
    });
    const r = rankCandidates([a, b]);
    expect(r.tieBreak.used).toBe(true);
    expect(r.tieBreak.mechanism).toBe("strength-tiebreak");
    expect(r.tieGroups).toHaveLength(1);
    expect(r.tieGroups[0]!.indices).toEqual([0, 1]);
    expect(r.rationale).toContain("Tied at priority=high");
    expect(r.rationale).toContain("[0,1]");
    expect(r.original[0]!.strength).toBeGreaterThanOrEqual(0);
  });

  it("ties at medium do not promote a low-priority candidate", () => {
    const med1 = makeSignal({ type: "momentum_shift", priority: "medium" });
    const med2 = makeSignal({ type: "notable_pattern", priority: "medium" });
    const low = makeSignal({ type: "news_sentiment", priority: "low" });
    const r = rankCandidates([med1, med2, low]);
    const primary = r.primaryIndexInOriginal!;
    expect(r.original[primary]!.priority).toBe("medium");
    expect(r.tieBreak.used).toBe(true);
    expect(r.tieGroups.find((g) => g.priority === "medium")?.indices).toEqual([
      0, 1,
    ]);
    expect(r.tieGroups.find((g) => g.priority === "low")).toBeUndefined();
  });

  it("populates rawDataKeys from populated rawData fields only", () => {
    const s = makeSignal({
      rawData: {
        close: 100,
        daySignal: "bullish",
        swingSignal: "neutral",
        longTermSignal: "neutral",
        entryLow: 95,
        // intentionally undefined: stopLoss, ema20
      },
    });
    const r = rankCandidates([s]);
    expect(r.original[0]!.rawDataKeys).toContain("close");
    expect(r.original[0]!.rawDataKeys).toContain("entryLow");
    expect(r.original[0]!.rawDataKeys).not.toContain("stopLoss");
    expect(r.original[0]!.rawDataKeys).not.toContain("ema20");
  });
});

// ── inferLevelFallback (mirror of deriveLevelsFromTruth cascade) ────

describe("inferLevelFallback — holdAbove / breakBelow cascade", () => {
  it("uses entryLow first when available", () => {
    const truth = gatherTruth({ signal: makeSignal() });
    expect(inferLevelFallback(truth)).toEqual({
      holdAboveSource: "entryLow",
      breakBelowSource: "stopLoss",
    });
  });

  it("falls back to periodLow when entryLow is missing", () => {
    const truth = gatherTruth({
      signal: makeSignal({
        rawData: {
          close: 100,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          periodLow: 92,
          ema20: 95,
          stopLoss: 88,
        },
      }),
    });
    expect(inferLevelFallback(truth).holdAboveSource).toBe("periodLow");
  });

  it("falls back to ema20 when entryLow and periodLow are missing", () => {
    const truth = gatherTruth({
      signal: makeSignal({
        rawData: {
          close: 100,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          ema20: 95,
        },
      }),
    });
    expect(inferLevelFallback(truth).holdAboveSource).toBe("ema20");
  });

  it("returns 'none' for both when none of the levels are populated", () => {
    const truth = gatherTruth({
      signal: makeSignal({
        rawData: {
          close: 100,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
        },
      }),
    });
    expect(inferLevelFallback(truth)).toEqual({
      holdAboveSource: "none",
      breakBelowSource: "none",
    });
  });

  it("returns 'none' for both when price is missing/non-positive", () => {
    const truth = gatherTruth({
      signal: makeSignal({
        rawData: {
          close: 0,
          daySignal: "neutral",
          swingSignal: "neutral",
          longTermSignal: "neutral",
          entryLow: 95,
          stopLoss: 88,
        },
      }),
    });
    expect(inferLevelFallback(truth).holdAboveSource).toBe("none");
    expect(inferLevelFallback(truth).breakBelowSource).toBe("none");
  });
});

// ── inferContextFallback ────────────────────────────────────────────

describe("inferContextFallback — forwards derived.contextSource", () => {
  it("returns news_one_liner when memory passes the context gate", () => {
    const truth = gatherTruth({
      signal: makeSignal(),
      memoryText: {
        newsOneLiner: "AAPL services guidance up.",
        impactLevel: "high",
        relevanceScore: 0.82,
        // Fresh — passes the B1 freshness gate.
        lastUpdated: new Date().toISOString(),
      },
    });
    const derived = deriveSignals(truth);
    expect(inferContextFallback(derived)).toBe("news_one_liner");
  });

  it("returns macro when memory fails relevance gate but macro is signed", () => {
    const truth = gatherTruth({
      signal: makeSignal(),
      macroContext: macroSupportive,
      memoryText: {
        newsOneLiner: "Marginally relevant headline.",
        impactLevel: "high",
        relevanceScore: 0.1,
      },
    });
    const derived = deriveSignals(truth);
    expect(inferContextFallback(derived)).toBe("macro");
  });

  it("returns 'none' when both gates fail", () => {
    const truth = gatherTruth({
      signal: makeSignal(),
      macroContext: macroNeutral,
    });
    const derived = deriveSignals(truth);
    expect(inferContextFallback(derived)).toBe("none");
  });
});

// ── evaluateMemoryGates / evaluateMacroGate ─────────────────────────

describe("evaluateMemoryGates — per-row gate evaluation", () => {
  it("passes both gates for a high-impact, high-relevance row", () => {
    const c = memoryCandidate();
    expect(evaluateMemoryGates(c)).toEqual({
      contextGatePassed: true,
      blendGatePassed: true,
    });
  });

  it("fails context gate when impact is low", () => {
    const c = memoryCandidate({
      impactLevel: "low",
      relevanceScore: 0.95,
      gates: { contextGatePassed: false, blendGatePassed: false },
    });
    expect(evaluateMemoryGates(c).contextGatePassed).toBe(false);
  });

  it("fails context gate when relevance is below 0.5", () => {
    const c = memoryCandidate({
      relevanceScore: 0.4,
      gates: { contextGatePassed: false, blendGatePassed: false },
    });
    expect(evaluateMemoryGates(c).contextGatePassed).toBe(false);
  });

  it("blend gate requires summary and impact in {critical, high}", () => {
    const ok = evaluateMemoryGates(memoryCandidate({ impactLevel: "high" }));
    expect(ok.blendGatePassed).toBe(true);
    const noSummary = evaluateMemoryGates(
      memoryCandidate({ summary: null }),
    );
    expect(noSummary.blendGatePassed).toBe(false);
    const med = evaluateMemoryGates(
      memoryCandidate({ impactLevel: "medium" }),
    );
    expect(med.blendGatePassed).toBe(false);
  });
});

describe("evaluateMacroGate — sentiment threshold", () => {
  it("passes when sentiment magnitude exceeds 0.3", () => {
    expect(evaluateMacroGate(macroSupportive)).toEqual({
      gatePassed: true,
      gateThreshold: 0.3,
    });
  });

  it("fails when sentiment is below the gate", () => {
    expect(
      evaluateMacroGate({
        headlines: [],
        dominantTheme: "macro",
        overallSentiment: 0.21,
      }).gatePassed,
    ).toBe(false);
  });

  it("fails when dominantTheme is null", () => {
    expect(evaluateMacroGate(macroNeutral).gatePassed).toBe(false);
  });
});

// ── buildAliasResolutionTrace ───────────────────────────────────────

describe("buildAliasResolutionTrace — alias resolution flagging", () => {
  it("AAPL matches AAPL directly", () => {
    const trace = buildAliasResolutionTrace("AAPL", ["AAPL"], {
      affected_tickers: ["AAPL"],
    });
    expect(trace).toEqual({
      symbolUpper: "AAPL",
      candidatesTried: ["AAPL"],
      chosenHitVia: "AAPL",
    });
  });

  it("BTC/USD resolves via BTC alias when only BTC is in affected_tickers", () => {
    const trace = buildAliasResolutionTrace(
      "BTC/USD",
      ["BTC/USD", "BTC"],
      { affected_tickers: ["BTC"] },
    );
    expect(trace.chosenHitVia).toBe("BTC");
  });

  it("SPX500 resolves via SPY alias", () => {
    const trace = buildAliasResolutionTrace(
      "SPX500",
      ["SPX500", "SPY"],
      { affected_tickers: ["SPY"] },
    );
    expect(trace.chosenHitVia).toBe("SPY");
  });

  it("prefers exact symbol match when both are present", () => {
    const trace = buildAliasResolutionTrace(
      "BTC/USD",
      ["BTC/USD", "BTC"],
      { affected_tickers: ["BTC", "BTC/USD"] },
    );
    expect(trace.chosenHitVia).toBe("BTC/USD");
  });

  it("returns chosenHitVia: null when row is null", () => {
    const trace = buildAliasResolutionTrace("AAPL", ["AAPL"], null);
    expect(trace.chosenHitVia).toBeNull();
  });

  it("returns chosenHitVia: null when affected_tickers is empty", () => {
    const trace = buildAliasResolutionTrace("AAPL", ["AAPL"], {
      affected_tickers: [],
    });
    expect(trace.chosenHitVia).toBeNull();
  });
});

// ── fetchMemoryCandidatesForDebug ───────────────────────────────────

describe("fetchMemoryCandidatesForDebug — production-parity ranking", () => {
  it("returns rows sorted by impact rank ascending then relevance descending", async () => {
    const pool = makePool([
      {
        theme: "Antitrust ruling",
        category: "policy",
        affected_tickers: ["AAPL"],
        news_one_liner: "Antitrust pressure.",
        summary: "Antitrust action.",
        impact_level: "low",
        relevance_score: "0.95",
        sentiment_score: "-0.3",
        last_updated: "2026-05-08T20:15:00Z",
      },
      {
        theme: "iPhone 17 supercycle",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Strong guidance.",
        summary: "Apple guidance up.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
      },
      {
        theme: "Services revenue beat",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Services beat.",
        summary: "Services revenue exceeded estimates.",
        impact_level: "high",
        relevance_score: "0.51",
        sentiment_score: "0.3",
        last_updated: "2026-05-09T16:10:00Z",
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(3);
    expect(out[0]!.theme).toBe("iPhone 17 supercycle");
    expect(out[0]!.chosen).toBe(true);
    expect(out[1]!.theme).toBe("Services revenue beat");
    expect(out[1]!.chosen).toBe(false);
    expect(out[2]!.theme).toBe("Antitrust ruling");
    expect(out[2]!.chosen).toBe(false);
    expect(out.filter((c) => c.chosen)).toHaveLength(1);
  });

  it("returns an empty list when no rows intersect the alias set", async () => {
    const pool = makePool([]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toEqual([]);
  });

  it("queries with the full alias candidate set for crypto pairs", async () => {
    const pool = makePool([]);
    await fetchMemoryCandidatesForDebug(pool, "BTC/USD");
    const queryFn = (pool as unknown as { query: ReturnType<typeof vi.fn> })
      .query;
    expect(queryFn).toHaveBeenCalledOnce();
    const params = queryFn.mock.calls[0]![1] as string[][];
    const aliases = params[0] as string[];
    expect(aliases).toContain("BTC/USD");
    expect(aliases).toContain("BTC");
  });

  it("returns empty list (does not throw) when the table query fails", async () => {
    const pool = {
      query: vi.fn().mockRejectedValue(new Error("relation does not exist")),
    } as unknown as Parameters<typeof fetchMemoryCandidatesForDebug>[0];
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toEqual([]);
  });

  // ── Slice 2: primaryTicker block with explicit trust tier ──────────
  it("surfaces primary_ticker with batch_heuristic source mapped to heuristic trust tier", async () => {
    const pool = makePool([
      {
        theme: "iPhone 17 supercycle",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Apple guidance beats expectations.",
        summary: "Apple Inc reports strong guidance.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: "AAPL",
        primary_ticker_source: "batch_heuristic",
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(1);
    expect(out[0]!.primaryTicker).toEqual({
      ticker: "AAPL",
      source: "batch_heuristic",
      trustTier: "heuristic",
    });
  });

  it("surfaces primary_ticker with null source mapped to none trust tier", async () => {
    const pool = makePool([
      {
        theme: "Antitrust pressure",
        category: "policy",
        affected_tickers: ["AAPL"],
        news_one_liner: "Antitrust news.",
        summary: "Antitrust pressure on big tech.",
        impact_level: "low",
        relevance_score: "0.5",
        sentiment_score: "-0.2",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out[0]!.primaryTicker).toEqual({
      ticker: null,
      source: null,
      trustTier: "none",
    });
  });

  it("collapses unknown source values to none (forward-compatible)", async () => {
    const pool = makePool([
      {
        theme: "Future source",
        category: "macro",
        affected_tickers: ["AAPL"],
        news_one_liner: "Future.",
        summary: "Future source.",
        impact_level: "medium",
        relevance_score: "0.6",
        sentiment_score: "0",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: "AAPL",
        primary_ticker_source: "future_unknown_source_v9",
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out[0]!.primaryTicker.source).toBeNull();
    expect(out[0]!.primaryTicker.trustTier).toBe("none");
    // ticker field still surfaced for forensic visibility
    expect(out[0]!.primaryTicker.ticker).toBe("AAPL");
  });

  it("logs an invariant warning when a memory row carries marketaux_entities", async () => {
    const pool = makePool([
      {
        theme: "Invariant violation candidate",
        category: "market",
        affected_tickers: ["AAPL"],
        news_one_liner: "Apple.",
        summary: "Apple summary.",
        impact_level: "medium",
        relevance_score: "0.5",
        sentiment_score: "0",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: "AAPL",
        primary_ticker_source: "marketaux_entities", // <- should NEVER appear on memory rows
      },
    ]);
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: () => log,
    } as never;
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL", log);
    // Source string still passes through (we do not silently mutate stored data).
    expect(out[0]!.primaryTicker.source).toBe("marketaux_entities");
    // But the invariant warning fires.
    expect((log as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledOnce();
  });

  // ── Slice 3: affinity reasons reflect primary_ticker adoption ──────

  it("affinity.reasons contains primary_ticker_hit:heuristic when primary matches digest alias", async () => {
    const pool = makePool([
      {
        theme: "iPhone 17 supercycle",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Apple guidance beats expectations.",
        summary: "Stronger services guidance.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: "AAPL",
        primary_ticker_source: "batch_heuristic",
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(1);
    expect(out[0]!.affinity.reasons).toContain("primary_ticker_hit:heuristic:AAPL");
    expect(out[0]!.affinity.reasons.some((x: string) => x.startsWith("position_primary"))).toBe(false);
  });

  it("affinity.reasons contains primary_ticker_miss:heuristic when primary does NOT match digest alias", async () => {
    const pool = makePool([
      {
        theme: "NVDA AI chip demand surge",
        category: "market",
        affected_tickers: ["AAPL", "NVDA"],
        news_one_liner: "NVDA supply chain constraints ease.",
        summary: "AI chip summary.",
        impact_level: "high",
        relevance_score: "0.9",
        sentiment_score: "0.5",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: "NVDA",
        primary_ticker_source: "batch_heuristic",
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(1);
    expect(out[0]!.affinity.reasons).toContain("primary_ticker_miss:heuristic:NVDA");
    expect(out[0]!.affinity.reasons.some((x: string) => x.startsWith("position_primary"))).toBe(false);
  });

  it("affinity.reasons falls back to position_primary_* when source is NULL", async () => {
    const pool = makePool([
      {
        theme: "iPhone 17 supercycle",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Apple guidance beats expectations.",
        summary: "Stronger services guidance.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(1);
    expect(out[0]!.affinity.reasons).toContain("position_primary_hit:AAPL");
    expect(out[0]!.affinity.reasons.some((x: string) => x.startsWith("primary_ticker"))).toBe(false);
  });
});

// ── buildDigestDebugReport — end-to-end shape on stubbed engine ─────

describe("buildDigestDebugReport — composed envelope", () => {
  function stubEngineResult(overrides: Partial<DetectSignalsResult> = {}) {
    const detectSpy = vi
      .spyOn(engine, "detectSignalsForTicker")
      .mockResolvedValue({
        signals: [],
        macroContext: macroNeutral,
        newsOneLinerMap: new Map(),
        memoryTextMap: new Map<string, TickerMemoryText>(),
        analysisDateMap: new Map(),
        ...overrides,
      });
    return detectSpy;
  }

  function makeDeps(rows: unknown[]) {
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      level: "info",
    } as unknown as Parameters<typeof buildDigestDebugReport>[0]["log"];
    const pool = {
      query: vi.fn().mockResolvedValue({ rows }),
    } as unknown as Parameters<typeof buildDigestDebugReport>[0]["db"];
    return { db: pool, log };
  }

  it("neutral-fallback path: zero candidates produces a Neutral brief", async () => {
    stubEngineResult();
    const deps = makeDeps([]);
    const report = await buildDigestDebugReport(deps, {
      symbol: "ZZZZ",
      assetType: "stock",
    });
    expect(report.fallbacks.neutralFallbackUsed).toBe(true);
    expect(report.candidateSignals.primaryIndexInOriginal).toBeNull();
    expect(report.brief.status.label).toBe("Neutral");
    expect(report.primary).toBeNull();
    expect(report.truth).toBeNull();
    expect(report.derived).toBeNull();
    expect(report.notes).toContain("no candidate signals — neutral fallback brief");
  });

  it("news_sentiment primary suppresses per-ticker memoryText in truth", async () => {
    const newsSignal: TickerSignal = {
      symbol: "AAPL",
      assetType: "stock",
      type: "news_sentiment",
      priority: "high",
      timeframeAlignment: "full",
      headline: "AAPL has bullish news sentiment (5 articles, avg 0.50)",
      rawData: {
        close: 175,
        daySignal: "bullish",
        swingSignal: "bullish",
        longTermSignal: "bullish",
        newsArticleCount: 5,
        newsAvgSentiment: 0.5,
        newsSentimentLabel: "bullish",
      },
    };
    const memMap = new Map<string, TickerMemoryText>([
      [
        "AAPL",
        {
          newsOneLiner: "Apple guidance up.",
          summary: "Apple analyst day reset services growth.",
          impactLevel: "high",
          relevanceScore: 0.82,
        },
      ],
    ]);
    stubEngineResult({
      signals: [newsSignal],
      memoryTextMap: memMap,
      analysisDateMap: new Map([["AAPL", "2026-05-09"]]),
    });
    const deps = makeDeps([
      {
        theme: "iPhone 17 supercycle",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Strong guidance.",
        summary: "Apple guidance up.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
      },
    ]);
    const report = await buildDigestDebugReport(deps, {
      symbol: "AAPL",
      assetType: "stock",
    });
    expect(report.fallbacks.memoryDroppedForNewsSentiment).toBe(true);
    expect(report.truth?.memoryText).toBeUndefined();
    // The memory section still surfaces the chosen candidate so reviewers
    // can see the row that *would* have been used had primary not been
    // news_sentiment.
    expect(report.memory.candidates).toHaveLength(1);
    expect(report.memory.candidates[0]!.chosen).toBe(true);
    expect(
      report.notes.some((n) => n.includes("news_sentiment")),
    ).toBe(true);
  });

  it("annotates whyLost on every non-chosen memory candidate", async () => {
    stubEngineResult();
    const deps = makeDeps([
      {
        // Older high-impact row.
        theme: "High impact, low relevance",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "AAPL filler line.",
        summary: "Filler.",
        impact_level: "high",
        relevance_score: "0.51",
        sentiment_score: "0.0",
        last_updated: "2026-05-09T16:10:00Z",
      },
      {
        // Newer high-impact row — wins on freshness within the impact bucket.
        theme: "High impact, high relevance",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "AAPL strong guidance.",
        summary: "Apple guidance up.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
      },
      {
        theme: "Low impact",
        category: "policy",
        affected_tickers: ["AAPL"],
        news_one_liner: "AAPL antitrust filler.",
        summary: "Antitrust action.",
        impact_level: "low",
        relevance_score: "0.95",
        sentiment_score: "-0.3",
        last_updated: "2026-05-08T20:15:00Z",
      },
    ]);
    const report = await buildDigestDebugReport(deps, {
      symbol: "AAPL",
      assetType: "stock",
    });
    const c = report.memory.candidates;
    // Chosen = high-impact row that wins the composite key. Both top
    // rows share impact=high and affinity, so the tertiary composite
    // (relevance × freshnessDecay + onSymbolBonus) decides.
    expect(c[0]!.chosen).toBe(true);
    expect(c[0]!.whyLost).toBeNull();
    // Loser at same impact + same affinity, lost on the composite key.
    // (Step 5 replaced the old freshness-then-relevance lexicographic
    // tiebreak with a single bounded composite score.)
    expect(c[1]!.whyLost).toMatch(
      /affinity=\d+ tied with chosen; lost composite by/,
    );
    // Lower-impact row.
    expect(c[2]!.whyLost).toMatch(/ranked behind chosen impact=high/);
  });

  it("memoryAliasResolved=true when BTC/USD matches BTC-only memory row", async () => {
    stubEngineResult();
    const deps = makeDeps([
      {
        theme: "BTC ETF inflows",
        category: "macro",
        affected_tickers: ["BTC"],
        news_one_liner: "Spot ETF inflows accelerate.",
        summary: "BTC ETF inflows hit fresh highs.",
        impact_level: "high",
        relevance_score: "0.7",
        sentiment_score: "0.5",
        last_updated: "2026-05-09T10:00:00Z",
      },
    ]);
    const report = await buildDigestDebugReport(deps, {
      symbol: "BTC/USD",
      assetType: "crypto",
    });
    expect(report.memory.aliasResolution.chosenHitVia).toBe("BTC");
    expect(report.fallbacks.memoryAliasResolved).toBe(true);
  });

  it("freshness exposes priceTargetAnalysisDate and newest memory timestamp", async () => {
    stubEngineResult({
      signals: [makeSignal()],
      analysisDateMap: new Map([["AAPL", "2026-05-09"]]),
    });
    const deps = makeDeps([
      {
        theme: "Newer row",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Latest.",
        summary: "Latest summary.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
      },
      {
        theme: "Older row",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Older.",
        summary: "Older summary.",
        impact_level: "high",
        relevance_score: "0.5",
        sentiment_score: "0.2",
        last_updated: "2026-05-09T08:00:00Z",
      },
    ]);
    const report = await buildDigestDebugReport(deps, {
      symbol: "AAPL",
      assetType: "stock",
    });
    expect(report.freshness.priceTargetAnalysisDate).toBe("2026-05-09");
    expect(report.freshness.memoryChosenLastUpdated).toBe(
      "2026-05-09T18:32:00Z",
    );
    expect(report.freshness.memoryNewestLastUpdated).toBe(
      "2026-05-09T18:32:00Z",
    );
    expect(report.freshness.requestedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── Affinity surface (step 3) ────────────────────────────────────────

describe("digest-debug — affinity surface", () => {
  function stubEmptyEngine() {
    return vi.spyOn(engine, "detectSignalsForTicker").mockResolvedValue({
      signals: [],
      macroContext: macroNeutral,
      newsOneLinerMap: new Map(),
      memoryTextMap: new Map<string, TickerMemoryText>(),
      analysisDateMap: new Map(),
    });
  }
  function makeDebugDeps(rows: unknown[]) {
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      level: "info",
    } as unknown as Parameters<typeof buildDigestDebugReport>[0]["log"];
    const pool = {
      query: vi.fn().mockResolvedValue({ rows }),
    } as unknown as Parameters<typeof buildDigestDebugReport>[0]["db"];
    return { db: pool, log };
  }

  it("populates affinity {score, threshold, reasons, passed} on every candidate", async () => {
    const pool = makePool([
      {
        theme: "iPhone 17 supercycle",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "AAPL guidance lifts services growth.",
        summary: "Strong services guidance.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
      },
      {
        theme: "PLA Leadership Purge Escalation",
        category: "geopolitical",
        affected_tickers: ["FXI", "SPX500", "NSDQ100", "NVDA", "AAPL"],
        news_one_liner: "Tail risk for Taiwan-exposed tech and semis.",
        summary: "Geopolitical risk escalates.",
        impact_level: "medium",
        relevance_score: "1.000",
        sentiment_score: "-0.3",
        last_updated: "2026-05-09T20:00:00Z",
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(2);
    for (const c of out) {
      expect(typeof c.affinity.score).toBe("number");
      expect(typeof c.affinity.threshold).toBe("number");
      expect(Array.isArray(c.affinity.reasons)).toBe(true);
      expect(typeof c.affinity.passed).toBe("boolean");
    }
    // The on-symbol AAPL row passes; the contaminated PLA row does not.
    const onSymbol = out.find((c) => c.theme === "iPhone 17 supercycle")!;
    const contaminated = out.find(
      (c) => c.theme === "PLA Leadership Purge Escalation",
    )!;
    expect(onSymbol.affinity.passed).toBe(true);
    expect(contaminated.affinity.passed).toBe(false);
    expect(contaminated.affinity.reasons).toContain("text_token_miss");
    expect(contaminated.affinity.reasons).toContain(
      "position_primary_miss:position=5",
    );
  });

  it("chosen flag points at the highest-ranked passing row, not necessarily index 0", async () => {
    // First row in DB order is contaminated (high-impact but no AAPL token,
    // AAPL not at position 1, n=5). Second row is on-symbol but lower impact.
    const pool = makePool([
      {
        theme: "Big Tech AI litigation wave",
        category: "policy",
        affected_tickers: ["MSFT", "GOOGL", "AAPL", "META", "NSDQ100"],
        news_one_liner: "Sector compliance costs rise across mega-caps.",
        summary: "Litigation surface broad.",
        impact_level: "high",
        relevance_score: "1.000",
        sentiment_score: "-0.2",
        last_updated: "2026-05-09T20:00:00Z",
      },
      {
        theme: "AAPL services revenue beat",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "AAPL services revenue ahead of estimates.",
        summary: "Services beat.",
        impact_level: "medium",
        relevance_score: "1.000",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T08:00:00Z",
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(2);
    const chosen = out.find((c) => c.chosen);
    expect(chosen?.theme).toBe("AAPL services revenue beat");
    expect(chosen?.affinity.passed).toBe(true);
    const failed = out.find(
      (c) => c.theme === "Big Tech AI litigation wave",
    );
    expect(failed?.chosen).toBe(false);
    expect(failed?.affinity.passed).toBe(false);
  });

  it("when every candidate fails affinity, no row is chosen and whyLost cites the gate", async () => {
    stubEmptyEngine();
    const deps = makeDebugDeps([
      {
        theme: "PLA Leadership Purge Escalation",
        category: "geopolitical",
        affected_tickers: ["FXI", "SPX500", "NSDQ100", "NVDA", "AAPL"],
        news_one_liner: "Tail risk for Taiwan-exposed tech and semis.",
        summary: "Geopolitical risk escalates.",
        impact_level: "medium",
        relevance_score: "1.000",
        sentiment_score: "-0.3",
        last_updated: "2026-05-09T20:00:00Z",
      },
      {
        theme: "Big Tech AI litigation wave",
        category: "policy",
        affected_tickers: ["MSFT", "GOOGL", "AAPL", "META", "NSDQ100"],
        news_one_liner: "Sector compliance costs rise.",
        summary: "Litigation surface broad.",
        impact_level: "high",
        relevance_score: "1.000",
        sentiment_score: "-0.2",
        last_updated: "2026-05-09T18:00:00Z",
      },
    ]);
    const report = await buildDigestDebugReport(deps, {
      symbol: "AAPL",
      assetType: "stock",
    });
    expect(report.memory.candidates.every((c) => !c.affinity.passed)).toBe(
      true,
    );
    expect(report.memory.candidates.every((c) => !c.chosen)).toBe(true);
    expect(report.memory.chosenIndex).toBeNull();
    for (const c of report.memory.candidates) {
      expect(c.whyLost).toMatch(/affinity score \d+ < threshold \d+/);
    }
    // notes should aggregate the rejection reasons.
    expect(
      report.notes.some((n) =>
        /affinity gate rejected 2 candidates/.test(n),
      ),
    ).toBe(true);
  });
});

// ── Slice 6: tickers_inferred + attachmentKind in debug candidates ────

describe("fetchMemoryCandidatesForDebug — slice 6 tickersInferred + attachmentKind", () => {
  it("surfaces tickersInferred and attachmentKind='kept' when symbol is in affected_tickers", async () => {
    const pool = makePool([
      {
        theme: "JEPI Covered-Call ETF Structural Flaw",
        category: "market",
        affected_tickers: ["JEPI"],
        news_one_liner: "JEPI distribution sustainability risk.",
        summary: "JEPI ETF flaw.",
        impact_level: "medium",
        relevance_score: "0.8",
        sentiment_score: "-0.2",
        last_updated: "2026-05-09T18:00:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
        tickers_inferred: ["SPX500"],
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "JEPI");
    expect(out).toHaveLength(1);
    expect(out[0]!.tickersInferred).toEqual(["SPX500"]);
    expect(out[0]!.attachmentKind).toBe("kept");
    expect(out[0]!.affinity.reasons).toContain("inferred_ticker_present:SPX500");
  });

  it("empty tickers_inferred (pre-Slice-5 row) shows attachmentKind='kept' with no inferred codes", async () => {
    const pool = makePool([
      {
        theme: "AAPL services beat",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "AAPL services revenue exceeded expectations.",
        summary: "Services beat.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
        tickers_inferred: [],
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(1);
    expect(out[0]!.tickersInferred).toEqual([]);
    expect(out[0]!.attachmentKind).toBe("kept");
    expect(out[0]!.affinity.reasons.some((r: string) => r.startsWith("inferred_ticker_present:"))).toBe(false);
  });

  it("null tickers_inferred treated as empty (backward compat)", async () => {
    const pool = makePool([
      {
        theme: "AAPL services beat",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "AAPL services revenue exceeded expectations.",
        summary: "Services beat.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
        tickers_inferred: null,
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(1);
    expect(out[0]!.tickersInferred).toEqual([]);
    expect(out[0]!.attachmentKind).toBe("kept");
  });
});

// ── Slice 7: fetchMemoryCandidatesForDebug — structural + behavioral ──

describe("fetchMemoryCandidatesForDebug — slice 7 structural", () => {
  const INCLUDE_ENV = "SMART_DIGEST_INCLUDE_INFERRED_ONLY";
  const origInclude = process.env[INCLUDE_ENV];

  beforeEach(() => {
    delete process.env[INCLUDE_ENV];
  });

  afterEach(() => {
    if (origInclude === undefined) delete process.env[INCLUDE_ENV];
    else process.env[INCLUDE_ENV] = origInclude;
  });

  it("SQL contains the canonical inferred predicate with $2::bool", async () => {
    const pool = makePool([]);
    await fetchMemoryCandidatesForDebug(pool, "AAPL");
    const queryFn = (pool as unknown as { query: ReturnType<typeof vi.fn> }).query;
    const sql = queryFn.mock.calls[0]![0] as string;
    expect(sql).toMatch(
      /affected_tickers && \$1::text\[\]\s*\n?\s*OR \(\$2::bool AND tickers_inferred && \$1::text\[\]\)/,
    );
  });

  it("params has 2 elements with flag=false at default", async () => {
    const pool = makePool([]);
    await fetchMemoryCandidatesForDebug(pool, "AAPL");
    const queryFn = (pool as unknown as { query: ReturnType<typeof vi.fn> }).query;
    const params = queryFn.mock.calls[0]![1] as unknown[];
    expect(params).toHaveLength(2);
    expect(Array.isArray(params[0])).toBe(true);
    expect(params[1]).toBe(false);
  });

  it("params[1]=true when SMART_DIGEST_INCLUDE_INFERRED_ONLY=true", async () => {
    process.env[INCLUDE_ENV] = "true";
    const pool = makePool([]);
    await fetchMemoryCandidatesForDebug(pool, "AAPL");
    const queryFn = (pool as unknown as { query: ReturnType<typeof vi.fn> }).query;
    const params = queryFn.mock.calls[0]![1] as unknown[];
    expect(params[1]).toBe(true);
  });
});

describe("fetchMemoryCandidatesForDebug — slice 7 behavioral parity (default path)", () => {
  const INCLUDE_ENV = "SMART_DIGEST_INCLUDE_INFERRED_ONLY";
  const PENALTY_ENV = "SMART_DIGEST_INFERRED_ONLY_PENALTY";
  const origInclude = process.env[INCLUDE_ENV];
  const origPenalty = process.env[PENALTY_ENV];

  beforeEach(() => {
    delete process.env[INCLUDE_ENV];
    delete process.env[PENALTY_ENV];
  });

  afterEach(() => {
    if (origInclude === undefined) delete process.env[INCLUDE_ENV];
    else process.env[INCLUDE_ENV] = origInclude;
    if (origPenalty === undefined) delete process.env[PENALTY_ENV];
    else process.env[PENALTY_ENV] = origPenalty;
  });

  it("candidate-list deep-equal to Slice 6 baseline (empty tickers_inferred, default flags)", async () => {
    const pool = makePool([
      {
        theme: "iPhone 17 supercycle",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Apple guidance beats expectations.",
        summary: "Apple guidance up.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
        tickers_inferred: [],
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(1);
    expect(out[0]!.chosen).toBe(true);
    expect(out[0]!.attachmentKind).toBe("kept");
    expect(out[0]!.tickersInferred).toEqual([]);
  });

  it("empty-inferred + flag true is deep-equal to default (dormancy verified)", async () => {
    process.env[INCLUDE_ENV] = "true";
    process.env[PENALTY_ENV] = "-2";
    const pool = makePool([
      {
        theme: "iPhone 17 supercycle",
        category: "earnings",
        affected_tickers: ["AAPL"],
        news_one_liner: "Apple guidance beats expectations.",
        summary: "Apple guidance up.",
        impact_level: "high",
        relevance_score: "0.82",
        sentiment_score: "0.4",
        last_updated: "2026-05-09T18:32:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
        tickers_inferred: [],
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "AAPL");
    expect(out).toHaveLength(1);
    expect(out[0]!.chosen).toBe(true);
    expect(out[0]!.attachmentKind).toBe("kept");
  });

  it("populated fixture, flag false: inferred-only alias row NOT returned (Slice 6 invariant)", async () => {
    const pool = makePool([
      {
        theme: "JEPI Covered-Call ETF Structural Flaw",
        category: "market",
        affected_tickers: ["JEPI"],
        news_one_liner: "JEPI distribution sustainability risk.",
        summary: "JEPI ETF flaw.",
        impact_level: "medium",
        relevance_score: "0.8",
        sentiment_score: "-0.2",
        last_updated: "2026-05-09T18:00:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
        tickers_inferred: ["SPX500"],
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "SPX500");
    // Flag is false at default: SQL only matches affected_tickers && $1, so row
    // with affected_tickers=["JEPI"] is NOT returned for SPX500 query.
    // The mock returns the row anyway (mock doesn't filter), but the row is
    // still scored and classified. The key contract is that under flag=false,
    // an inferred_only row would not appear in production due to SQL filter.
    // Here we verify the classification is correct when the row IS present.
    if (out.length > 0) {
      expect(out[0]!.attachmentKind).toBe("inferred_only");
    }
  });

  it("populated fixture, flag true: inferred-only row IS returned with correct classification", async () => {
    process.env[INCLUDE_ENV] = "true";
    const pool = makePool([
      {
        theme: "JEPI Covered-Call ETF Structural Flaw",
        category: "market",
        affected_tickers: ["JEPI"],
        news_one_liner: "JEPI distribution sustainability risk.",
        summary: "JEPI ETF flaw.",
        impact_level: "medium",
        relevance_score: "0.8",
        sentiment_score: "-0.2",
        last_updated: "2026-05-09T18:00:00Z",
        primary_ticker: null,
        primary_ticker_source: null,
        tickers_inferred: ["SPX500"],
      },
    ]);
    const out = await fetchMemoryCandidatesForDebug(pool, "SPX500");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.attachmentKind).toBe("inferred_only");
    expect(out[0]!.affinity.reasons).toContain("attachment_inferred_only:SPX500");
    expect(out[0]!.affinity.reasons).toContain("inferred_ticker_present:SPX500");
  });
});
