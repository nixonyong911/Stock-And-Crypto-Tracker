import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../daily-overview-repository.js", () => ({
  getCurrentOverviewArtifact: vi.fn(),
  acquireOverviewSlot: vi.fn(),
  markOverviewGenerating: vi.fn(),
  markOverviewReady: vi.fn(),
  markOverviewFailed: vi.fn(),
}));

vi.mock("../daily-overview-fingerprint.js", () => ({
  computeOverviewSnapshotHash: vi.fn(() => "snap-hash"),
  computeOverviewContextHash: vi.fn(() => "ctx-hash"),
  projectSnapshotRefs: vi.fn(() => ({ indices: [] })),
  gatherContextRefs: vi.fn(async () => ({
    priorOverviews: [],
    stockTrajectory: [],
    cryptoTrajectory: [],
    memoryThemes: [],
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

import { orchestrateDailyOverviewArtifact } from "../daily-overview-orchestrator.js";
import type { RunContext } from "../artifact-logging.js";
import {
  getCurrentOverviewArtifact,
  acquireOverviewSlot,
  markOverviewGenerating,
  markOverviewReady,
  markOverviewFailed,
} from "../daily-overview-repository.js";
import { synthesizeOverviewCore, buildTemplateFallbackNarrative } from "../market-overview.js";

const runCtx: RunContext = { runId: "test-run", artifactType: "daily_overview" };

const MINIMAL_SNAPSHOT = {
  timestamp: new Date("2026-05-13T14:00:00Z"),
  sessionType: "pre_market" as const,
  indices: [{ symbol: "SPX500", name: "S&P 500", latestClose: 5400, previousClose: 5380, changePercent: 0.37 }],
  commodities: [],
  crypto: [{ symbol: "BTC/USD", name: "BTC", latestClose: 105000, previousClose: 104000, changePercent: 0.96 }],
  dxy: null,
  bondYields: [],
  topNews: [],
};

function makeLog() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "info",
  } as never;
}

const mockDb = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(synthesizeOverviewCore).mockResolvedValue({
    narrative: "LLM narrative",
    topStories: ["Story A"],
    durationMs: 3000,
  });
});

describe("orchestrateDailyOverviewArtifact", () => {
  it("returns reuse when getCurrentOverviewArtifact hits", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue({
      id: 42,
      overview_id: "uuid-42",
      narrative: "Existing narrative",
      top_stories: ["Old story"],
      synthesis_source: "llm",
      llm_duration_ms: 2000,
    } as never);

    const result = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, MINIMAL_SNAPSHOT, "pre_market", "2026-05-13",
    );

    expect(result.source).toBe("reuse");
    expect(result.brief!.narrative).toBe("Existing narrative");
    expect(acquireOverviewSlot).not.toHaveBeenCalled();
  });

  it("generates fresh artifact with LLM synthesis", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 1, overview_id: "uuid-1" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);

    const result = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, MINIMAL_SNAPSHOT, "pre_market", "2026-05-13",
    );

    expect(result.source).toBe("fresh");
    expect(result.brief!.narrative).toBe("LLM narrative");
    expect(result.brief!.synthesisSource).toBe("llm");
    expect(markOverviewReady).toHaveBeenCalledTimes(1);
    const readyArgs = vi.mocked(markOverviewReady).mock.calls[0]![0];
    expect(readyArgs.synthesisSource).toBe("llm");
  });

  it("uses template fallback when synthesizeOverviewCore returns null", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 2, overview_id: "uuid-2" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);
    vi.mocked(synthesizeOverviewCore).mockResolvedValue(null);

    const result = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, MINIMAL_SNAPSHOT, "pre_market", "2026-05-13",
    );

    expect(result.source).toBe("fresh");
    expect(result.brief!.synthesisSource).toBe("template_fallback");
    expect(buildTemplateFallbackNarrative).toHaveBeenCalledTimes(1);
  });

  it("calls markFailed + returns fallback on LLM throw", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 3, overview_id: "uuid-3" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(synthesizeOverviewCore).mockRejectedValue(new Error("cursor-agent timed out"));
    vi.mocked(markOverviewFailed).mockResolvedValue(true);

    const result = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, MINIMAL_SNAPSHOT, "pre_market", "2026-05-13",
    );

    expect(result.source).toBe("fallback");
    expect(result.brief!.synthesisSource).toBe("template_fallback");
    expect(markOverviewFailed).toHaveBeenCalledTimes(1);
    const failArgs = vi.mocked(markOverviewFailed).mock.calls[0]![0];
    expect(failArgs.errorCode).toBe("llm_timeout");
  });

  it("returns slot_conflict_fallback with template on slot conflict", async () => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue(null);

    const result = await orchestrateDailyOverviewArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, MINIMAL_SNAPSHOT, "pre_market", "2026-05-13",
    );

    expect(result.source).toBe("slot_conflict_fallback");
    expect(result.brief).toBeDefined();
    expect(result.brief!.synthesisSource).toBe("template_fallback");
  });
});
