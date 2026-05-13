/**
 * Step 14.3 integration test — exercises both `orchestrateDigestArtifact` and
 * `orchestrateDailyOverviewArtifact` against a shared mock pool, covering the
 * cross-product of (reuse | acquire | conflict) × (success | failure).
 *
 * Unlike the unit tests which mock at the repo layer per-orchestrator, these
 * tests wire both orchestrators through `runArtifactJob` with minimal stubs
 * to validate the full orchestration flow end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Digest mocks ──────────────────────────────────────────────────────

vi.mock("../smart-digest-repository.js", () => ({
  getCurrentArtifact: vi.fn(),
  acquireInFlightSlot: vi.fn(),
  markGenerating: vi.fn(),
  markReady: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("../smart-digest-fingerprint.js", () => ({
  computeTruthFingerprint: vi.fn(async () => ({ hash: "truth-h", input: {} })),
  computeContextFingerprint: vi.fn(async () => ({ hash: "ctx-h", input: {} })),
  CURRENT_DIGEST_BRIEF_SCHEMA_VERSION: 1,
  CURRENT_GENERATOR_VERSION: "1",
  CURRENT_PROMPT_VERSION: null,
  CURRENT_CODE_VERSION: "test-sha",
}));

vi.mock("../digest-trigger.js", () => ({
  evaluateTriggers: vi.fn(() => [{
    symbol: "AAPL", assetType: "stock", mode: "intraday",
    windowStart: new Date(), windowEnd: new Date(),
    triggerReason: "signal:intraday:entry_zone", briefMode: "strict",
    digestDate: "2026-05-13",
  }]),
}));

vi.mock("../digest-brief-generator.js", () => ({
  generateDigestBrief: vi.fn(() => ({
    ticker: "AAPL",
    status: { label: "Watch zone", tone: "watch" },
    price: 190, changePercent: 1.5, confidence: "High",
    updatedAt: null, whatHappening: "AAPL entry zone",
    whatToWatch: { holdAbove: "185", breakBelowTarget: "180" },
    context: "", hasMaterialContext: false,
  })),
}));

// ── Overview mocks ────────────────────────────────────────────────────

vi.mock("../daily-overview-repository.js", () => ({
  getCurrentOverviewArtifact: vi.fn(),
  acquireOverviewSlot: vi.fn(),
  markOverviewGenerating: vi.fn(),
  markOverviewReady: vi.fn(),
  markOverviewFailed: vi.fn(),
}));

vi.mock("../daily-overview-fingerprint.js", () => ({
  computeOverviewSnapshotHash: vi.fn(() => "snap-h"),
  computeOverviewContextHash: vi.fn(() => "ctx-h"),
  projectSnapshotRefs: vi.fn(() => ({ indices: [] })),
  gatherContextRefs: vi.fn(async () => ({
    priorOverviews: [], stockTrajectory: [], cryptoTrajectory: [], memoryThemes: [],
  })),
  CURRENT_OVERVIEW_SCHEMA_VERSION: 1,
  CURRENT_OVERVIEW_GENERATOR_VERSION: "1",
  CURRENT_OVERVIEW_PROMPT_VERSION: "overview.v1",
  CURRENT_OVERVIEW_MODEL: "claude-4.6-sonnet-medium",
  CURRENT_CODE_VERSION: "test-sha",
}));

vi.mock("../market-overview.js", () => ({
  synthesizeOverviewCore: vi.fn(),
  buildTemplateFallbackNarrative: vi.fn(() => "Template fallback"),
  fetchPriorOverviews: vi.fn(async () => []),
  fetchStockPriceTrajectory: vi.fn(async () => []),
  fetchCryptoPriceTrajectory: vi.fn(async () => []),
}));

// ── Imports ───────────────────────────────────────────────────────────

import { orchestrateDigestArtifact } from "../smart-digest-orchestrator.js";
import { orchestrateDailyOverviewArtifact } from "../daily-overview-orchestrator.js";
import type { RunContext } from "../artifact-logging.js";

import {
  getCurrentArtifact,
  acquireInFlightSlot,
  markGenerating as digestMarkGenerating,
  markReady as digestMarkReady,
  markFailed as digestMarkFailed,
} from "../smart-digest-repository.js";
import {
  getCurrentOverviewArtifact,
  acquireOverviewSlot,
  markOverviewGenerating,
  markOverviewReady,
  markOverviewFailed,
} from "../daily-overview-repository.js";
import { synthesizeOverviewCore } from "../market-overview.js";
import { generateDigestBrief } from "../digest-brief-generator.js";

// ── Shared helpers ────────────────────────────────────────────────────

const mockDb = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as never;

function makeLog() {
  return {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    debug: vi.fn(), trace: vi.fn(), fatal: vi.fn(),
    child: vi.fn().mockReturnThis(), level: "info",
  } as never;
}

const SNAPSHOT = {
  timestamp: new Date("2026-05-13T14:00:00Z"),
  sessionType: "pre_market" as const,
  indices: [{ symbol: "SPX500", name: "S&P 500", latestClose: 5400, previousClose: 5380, changePercent: 0.37 }],
  commodities: [], crypto: [], dxy: null, bondYields: [], topNews: [],
};

const digestRunCtx: RunContext = { runId: "d-run-1", artifactType: "smart_digest" };
const overviewRunCtx: RunContext = { runId: "o-run-1", artifactType: "daily_overview" };

const makeSignal = () => ({
  symbol: "AAPL", assetType: "stock" as const,
  type: "entry_zone", priority: "high", timeframeAlignment: "full",
  headline: "AAPL signal", rawData: { close: 100, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish" },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(synthesizeOverviewCore).mockResolvedValue({
    narrative: "LLM output", topStories: ["S1"], durationMs: 1500,
  });
});

// ── Tests ─────────────────────────────────────────────────────────────

describe("cross-product: reuse × success", () => {
  it("digest reuse skips generation", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue({ id: 10, digest_id: "d-uuid", payload: { ticker: "AAPL" } } as never);
    const r = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() }, digestRunCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );
    expect(r.source).toBe("reuse");
    expect(generateDigestBrief).not.toHaveBeenCalled();
  });

  it("overview reuse skips synthesis", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue({
      id: 20, overview_id: "o-uuid", narrative: "Old", top_stories: [], synthesis_source: "llm", llm_duration_ms: 500,
    } as never);
    const r = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() }, overviewRunCtx, SNAPSHOT, "pre_market", "2026-05-13",
    );
    expect(r.source).toBe("reuse");
    expect(synthesizeOverviewCore).not.toHaveBeenCalled();
  });
});

describe("cross-product: acquire × success", () => {
  it("digest fresh generation", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({ id: 1, digest_id: "d-new" });
    vi.mocked(digestMarkGenerating).mockResolvedValue(true);
    vi.mocked(digestMarkReady).mockResolvedValue(true);

    const r = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() }, digestRunCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );
    expect(r.source).toBe("fresh");
    expect(digestMarkReady).toHaveBeenCalledTimes(1);
  });

  it("overview fresh generation with LLM", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 2, overview_id: "o-new" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);

    const r = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() }, overviewRunCtx, SNAPSHOT, "pre_market", "2026-05-13",
    );
    expect(r.source).toBe("fresh");
    expect(r.brief!.synthesisSource).toBe("llm");
  });
});

describe("cross-product: acquire × failure", () => {
  it("digest generation error => fallback, markFailed", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({ id: 3, digest_id: "d-fail" });
    vi.mocked(digestMarkGenerating).mockResolvedValue(true);
    vi.mocked(generateDigestBrief).mockImplementation(() => { throw new Error("boom"); });
    vi.mocked(digestMarkFailed).mockResolvedValue(true);

    const r = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() }, digestRunCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );
    expect(r.source).toBe("fallback");
    expect(digestMarkFailed).toHaveBeenCalledTimes(1);
  });

  it("overview LLM error => fallback with template, markFailed", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 4, overview_id: "o-fail" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(synthesizeOverviewCore).mockRejectedValue(new Error("LLM timed out"));
    vi.mocked(markOverviewFailed).mockResolvedValue(true);

    const r = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() }, overviewRunCtx, SNAPSHOT, "pre_market", "2026-05-13",
    );
    expect(r.source).toBe("fallback");
    expect(r.brief!.synthesisSource).toBe("template_fallback");
    expect(markOverviewFailed).toHaveBeenCalledTimes(1);
  });
});

describe("cross-product: conflict × success", () => {
  it("digest slot conflict => slot_conflict_fallback (no buildFallback)", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue(null);

    const r = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() }, digestRunCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );
    expect(r.source).toBe("slot_conflict_fallback");
    expect(r.brief).toBeUndefined();
  });

  it("overview slot conflict => slot_conflict_fallback with template", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue(null);

    const r = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() }, overviewRunCtx, SNAPSHOT, "pre_market", "2026-05-13",
    );
    expect(r.source).toBe("slot_conflict_fallback");
    expect(r.brief!.synthesisSource).toBe("template_fallback");
  });
});

describe("cross-product: conflict × re-read reuse", () => {
  it("digest conflict then re-read finds artifact", async () => {
    let calls = 0;
    vi.mocked(getCurrentArtifact).mockImplementation(async () => {
      calls++;
      if (calls <= 1) return null;
      return { id: 50, digest_id: "d-reread", payload: { ticker: "AAPL" } } as never;
    });
    vi.mocked(acquireInFlightSlot).mockResolvedValue(null);

    const r = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() }, digestRunCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );
    expect(r.source).toBe("slot_conflict_reused");
    expect(r.artifactId).toBe(50);
  });

  it("overview conflict then re-read finds artifact", async () => {
    let calls = 0;
    vi.mocked(getCurrentOverviewArtifact).mockImplementation(async () => {
      calls++;
      if (calls <= 1) return null;
      return {
        id: 60, overview_id: "o-reread", narrative: "Reread",
        top_stories: [], synthesis_source: "llm", llm_duration_ms: 100,
      } as never;
    });
    vi.mocked(acquireOverviewSlot).mockResolvedValue(null);

    const r = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() }, overviewRunCtx, SNAPSHOT, "pre_market", "2026-05-13",
    );
    expect(r.source).toBe("slot_conflict_reused");
    expect(r.artifactId).toBe(60);
  });
});
