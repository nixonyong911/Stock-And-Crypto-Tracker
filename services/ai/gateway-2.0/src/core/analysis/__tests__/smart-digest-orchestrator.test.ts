import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../smart-digest-repository.js", () => ({
  getCurrentArtifact: vi.fn(),
  acquireInFlightSlot: vi.fn(),
  markGenerating: vi.fn(),
  markReady: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("../smart-digest-fingerprint.js", () => ({
  computeTruthFingerprint: vi.fn(async () => ({ hash: "truth-hash", input: {} })),
  computeContextFingerprint: vi.fn(async () => ({ hash: "ctx-hash", input: {} })),
  CURRENT_DIGEST_BRIEF_SCHEMA_VERSION: 1,
  CURRENT_GENERATOR_VERSION: "1",
  CURRENT_PROMPT_VERSION: null,
  CURRENT_CODE_VERSION: "test-sha",
}));

vi.mock("../digest-trigger.js", () => ({
  evaluateTriggers: vi.fn(() => [
    {
      symbol: "AAPL",
      assetType: "stock",
      mode: "intraday",
      windowStart: new Date("2026-05-13T15:30:00Z"),
      windowEnd: new Date("2026-05-13T15:31:00Z"),
      triggerReason: "signal:intraday:entry_zone",
      briefMode: "strict",
      digestDate: "2026-05-13",
    },
  ]),
}));

vi.mock("../digest-brief-generator.js", () => ({
  generateDigestBrief: vi.fn(() => ({
    ticker: "AAPL",
    status: { label: "Watch zone", tone: "watch" },
    price: 190,
    changePercent: 1.5,
    confidence: "High",
    updatedAt: null,
    whatHappening: "AAPL hit entry zone",
    whatToWatch: { holdAbove: "185", breakBelowTarget: "180" },
    context: "",
    hasMaterialContext: false,
  })),
}));

import { orchestrateDigestArtifact } from "../smart-digest-orchestrator.js";
import type { RunContext } from "../artifact-logging.js";
import {
  getCurrentArtifact,
  acquireInFlightSlot,
  markGenerating,
  markReady,
  markFailed,
} from "../smart-digest-repository.js";
import { generateDigestBrief } from "../digest-brief-generator.js";
import type { TickerSignal } from "../recommendation-engine.js";

const runCtx: RunContext = { runId: "test-run", artifactType: "smart_digest" };

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

function makeSignal(symbol = "AAPL"): TickerSignal {
  return {
    symbol,
    assetType: "stock",
    type: "entry_zone",
    priority: "high",
    timeframeAlignment: "full",
    headline: `${symbol} signal`,
    rawData: { close: 100, daySignal: "bullish", swingSignal: "bullish", longTermSignal: "bullish" },
  };
}

const mockDb = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as never;

beforeEach(() => vi.clearAllMocks());

describe("orchestrateDigestArtifact", () => {
  it("returns reuse when getCurrentArtifact hits", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue({
      id: 42,
      digest_id: "uuid-42",
      payload: { ticker: "AAPL" },
    } as never);

    const result = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );

    expect(result.source).toBe("reuse");
    expect(result.artifactId).toBe(42);
    expect(acquireInFlightSlot).not.toHaveBeenCalled();
  });

  it("generates fresh artifact on miss", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({ id: 1, digest_id: "uuid-1" });
    vi.mocked(markGenerating).mockResolvedValue(true);
    vi.mocked(markReady).mockResolvedValue(true);

    const result = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );

    expect(result.source).toBe("fresh");
    expect(result.artifactId).toBe(1);
    expect(generateDigestBrief).toHaveBeenCalledTimes(1);
    expect(markReady).toHaveBeenCalledTimes(1);
  });

  it("returns slot_conflict_fallback on conflict (no buildFallback)", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue(null);

    const result = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );

    expect(result.source).toBe("slot_conflict_fallback");
    expect(result.brief).toBeUndefined();
    expect(generateDigestBrief).not.toHaveBeenCalled();
  });

  it("calls markFailed with classified error code on generation throw", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({ id: 5, digest_id: "uuid-5" });
    vi.mocked(markGenerating).mockResolvedValue(true);
    vi.mocked(generateDigestBrief).mockImplementation(() => {
      throw new Error("render failed: sharp module crash");
    });
    vi.mocked(markFailed).mockResolvedValue(true);

    const result = await orchestrateDigestArtifact(
      { db: mockDb, log: makeLog() },
      runCtx, "AAPL", "stock", [makeSignal()],
      { macroContext: { headlines: [], dominantTheme: null, overallSentiment: 0 } },
    );

    expect(result.source).toBe("fallback");
    expect(markFailed).toHaveBeenCalledTimes(1);
    const failArgs = vi.mocked(markFailed).mock.calls[0]![0];
    expect(failArgs.errorCode).toBe("render_failed");
  });
});
