import { describe, it, expect, vi } from "vitest";
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
    lastUpdated: "2026-05-08T12:00:00Z",
    newsOneLiner: "Apple guidance beats expectations.",
    summary: "Stronger services guidance lifts mega-cap tech.",
    rankKey: { impactRank: 1, relevance: 0.82 },
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

  it("uses stable sort tie-break when two candidates share priority=high", () => {
    const a = makeSignal({ type: "entry_zone", priority: "high" });
    const b = makeSignal({
      type: "target_reached",
      priority: "high",
      headline: "AAPL into resistance",
    });
    const r = rankCandidates([a, b]);
    expect(r.tieBreak.used).toBe(true);
    expect(r.tieBreak.mechanism).toBe("stable-sort-original-order");
    expect(r.primaryIndexInOriginal).toBe(0);
    expect(r.tieGroups).toHaveLength(1);
    expect(r.tieGroups[0]!.indices).toEqual([0, 1]);
    expect(r.rationale).toContain("Tied at priority=high");
    expect(r.rationale).toContain("[0,1]");
  });

  it("ties at medium do not promote a low-priority candidate", () => {
    const med1 = makeSignal({ type: "momentum_shift", priority: "medium" });
    const med2 = makeSignal({ type: "notable_pattern", priority: "medium" });
    const low = makeSignal({ type: "news_sentiment", priority: "low" });
    const r = rankCandidates([med1, med2, low]);
    expect(r.primaryIndexInOriginal).toBe(0);
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
    // Chosen = newest high-impact row (freshness tiebreak after impact and
    // affinity, both equal here).
    expect(c[0]!.chosen).toBe(true);
    expect(c[0]!.whyLost).toBeNull();
    // Loser at same impact + same affinity, lost on freshness.
    expect(c[1]!.whyLost).toMatch(
      /affinity=\d+ tied with chosen but last_updated older than chosen/,
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
