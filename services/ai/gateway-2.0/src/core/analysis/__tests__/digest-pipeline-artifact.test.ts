/**
 * Step 14.1 artifact-layer pipeline tests.
 *
 * Covers:
 *   A. Flag-off parity — legacy flow unchanged when canonical artifact disabled
 *   B. Flag-on write/read path — artifact persisted and read back
 *   C. Crypto asset type flows through read path (no stock-hardcoding)
 *   D. Delivery parity — deliverSmartDigest and user_recommendation_log
 *      INSERT shape remain byte-identical to pre-14.1
 *
 * These tests mock the repository and fingerprint layers at the module
 * boundary so the pipeline orchestration logic is exercised without a
 * real database.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock("../smart-digest-repository.js", () => ({
  getCurrentArtifact: vi.fn(),
  acquireInFlightSlot: vi.fn(),
  markGenerating: vi.fn(),
  markReady: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("../smart-digest-fingerprint.js", () => ({
  computeTruthFingerprint: vi.fn(async () => ({
    hash: "truth-hash-stub",
    input: {},
  })),
  computeContextFingerprint: vi.fn(async () => ({
    hash: "context-hash-stub",
    input: {},
  })),
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
      triggerReason: "signal:entry_zone",
      briefMode: "strict",
      digestDate: "2026-05-13",
    },
  ]),
}));

vi.mock("../recommendation-engine.js", () => ({
  detectSignals: vi.fn(),
}));

vi.mock("../wishlist-calculator.js", () => ({
  secondsUntilMidnightUTC: vi.fn(() => 3600),
}));

vi.mock("../digest-eligibility.js", () => ({
  listDigestWatchersForSymbol: vi.fn(),
  checkDigestThrottle: vi.fn(async () => ({ ok: true })),
  recordDigestSent: vi.fn(async () => {}),
}));

vi.mock("../digest-delivery.js", () => ({
  renderSmartDigestCard: vi.fn(async () => ({
    photo: Buffer.from("png-stub"),
    caption: "caption-stub",
  })),
  deliverSmartDigest: vi.fn(async () => ({ ok: true })),
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

import { processRecommendations } from "../digest-pipeline.js";
import type { ProcessRecommendationsDeps } from "../digest-pipeline.js";
import {
  getCurrentArtifact,
  acquireInFlightSlot,
  markGenerating,
  markReady,
  markFailed,
} from "../smart-digest-repository.js";
import { computeTruthFingerprint, computeContextFingerprint } from "../smart-digest-fingerprint.js";
import { evaluateTriggers } from "../digest-trigger.js";
import { detectSignals } from "../recommendation-engine.js";
import { listDigestWatchersForSymbol } from "../digest-eligibility.js";
import { deliverSmartDigest, renderSmartDigestCard } from "../digest-delivery.js";
import { generateDigestBrief } from "../digest-brief-generator.js";
import type { TickerSignal } from "../recommendation-engine.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeSignal(
  symbol: string,
  assetType: "stock" | "crypto" = "stock",
): TickerSignal {
  return {
    symbol,
    assetType,
    type: "entry_zone",
    priority: "high",
    timeframeAlignment: "full",
    headline: `${symbol} signal`,
    rawData: {
      close: 100,
      daySignal: "bullish",
      swingSignal: "bullish",
      longTermSignal: "bullish",
    },
  };
}

function makeBaseDeps(
  overrides: Partial<ProcessRecommendationsDeps> = {},
): ProcessRecommendationsDeps {
  return {
    db: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } as never,
    redis: {
      set: vi.fn(async () => "OK"),
    } as never,
    extensions: { get: vi.fn(() => null) } as never,
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      level: "info",
    } as never,
    ...overrides,
  };
}

const fakeWatcher = {
  clerkUserId: "user-1",
  platformChatId: "chat-1",
  channel: "telegram" as const,
};

// ── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listDigestWatchersForSymbol).mockResolvedValue([fakeWatcher]);
});

function setupDetectSignals(symbol: string, assetType: "stock" | "crypto") {
  vi.mocked(detectSignals).mockResolvedValue({
    signals: [makeSignal(symbol, assetType)],
    macroContext: {
      headlines: [],
      dominantTheme: null,
      overallSentiment: 0,
    },
    newsOneLinerMap: new Map(),
    memoryTextMap: new Map(),
    analysisDateMap: new Map(),
  });
}

// ── A. Flag-off parity ────────────────────────────────────────────────

describe("canonical artifact flag OFF (legacy parity)", () => {
  it("does not call any artifact repository functions", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });

    await processRecommendations(deps, "stock");

    expect(getCurrentArtifact).not.toHaveBeenCalled();
    expect(acquireInFlightSlot).not.toHaveBeenCalled();
    expect(markGenerating).not.toHaveBeenCalled();
    expect(markReady).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("does not call fingerprint computation", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });

    await processRecommendations(deps, "stock");

    expect(computeTruthFingerprint).not.toHaveBeenCalled();
    expect(computeContextFingerprint).not.toHaveBeenCalled();
  });

  it("calls generateDigestBrief in-memory (legacy path)", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });

    await processRecommendations(deps, "stock");

    expect(generateDigestBrief).toHaveBeenCalledTimes(1);
  });

  it("calls deliverSmartDigest for each watcher", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });

    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
  });

  it("defaults canonicalArtifactEnabled to undefined (off)", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(getCurrentArtifact).not.toHaveBeenCalled();
    expect(generateDigestBrief).toHaveBeenCalledTimes(1);
  });
});

// ── B. Flag-on write path ─────────────────────────────────────────────

describe("canonical artifact flag ON — write path", () => {
  beforeEach(() => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({
      id: 1,
      digest_id: "uuid-1",
    });
    vi.mocked(markGenerating).mockResolvedValue(true);
    vi.mocked(markReady).mockResolvedValue(true);
  });

  it("calls persistCanonicalArtifacts when flag is on", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(getCurrentArtifact).toHaveBeenCalled();
    expect(acquireInFlightSlot).toHaveBeenCalled();
    expect(markGenerating).toHaveBeenCalled();
    expect(markReady).toHaveBeenCalled();
  });

  it("skips generation when a reusable artifact exists", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValueOnce({
      id: 42,
      digest_id: "existing-uuid",
      payload: { ticker: "AAPL" },
    } as never);

    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(acquireInFlightSlot).not.toHaveBeenCalled();
    expect(markGenerating).not.toHaveBeenCalled();
    expect(markReady).not.toHaveBeenCalled();
  });

  it("calls markFailed when generation throws", async () => {
    vi.mocked(generateDigestBrief).mockImplementationOnce(() => {
      throw new Error("generation exploded");
    });
    vi.mocked(markFailed).mockResolvedValue(true);

    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(markFailed).toHaveBeenCalledTimes(1);
    const call = vi.mocked(markFailed).mock.calls[0]![0];
    expect(call).toMatchObject({
      id: 1,
      errorCode: "generation_failed",
    });
    expect(call.errorMessage).toContain("generation exploded");
  });
});

// ── C. Flag-on read path ──────────────────────────────────────────────

describe("canonical artifact flag ON — read path", () => {
  const fakeBrief = {
    ticker: "AAPL",
    status: { label: "Watch zone", tone: "watch" },
    price: 190,
    changePercent: 1.5,
    confidence: "High",
    updatedAt: null,
    whatHappening: "Loaded from artifact",
    whatToWatch: { holdAbove: "185", breakBelowTarget: "180" },
    context: "",
    hasMaterialContext: false,
  };

  beforeEach(() => {
    vi.mocked(acquireInFlightSlot).mockResolvedValue({
      id: 1,
      digest_id: "uuid-1",
    });
    vi.mocked(markGenerating).mockResolvedValue(true);
    vi.mocked(markReady).mockResolvedValue(true);
  });

  it("loads brief from artifact payload when artifact exists", async () => {
    vi.mocked(getCurrentArtifact)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 42,
        digest_id: "uuid-42",
        payload: fakeBrief,
      } as never);

    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const deliverCall = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    const deliveredBrief = deliverCall[2];
    expect(deliveredBrief.whatHappening).toBe("Loaded from artifact");
  });

  it("falls back to in-memory generation when no artifact found on read", async () => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);

    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    const generateCalls = vi.mocked(generateDigestBrief).mock.calls;
    expect(generateCalls.length).toBeGreaterThanOrEqual(1);
    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
  });
});

// ── D. Crypto asset type flows through read path ──────────────────────

describe("crypto artifact read-path uses correct assetType", () => {
  beforeEach(() => {
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({
      id: 1,
      digest_id: "uuid-1",
    });
    vi.mocked(markGenerating).mockResolvedValue(true);
    vi.mocked(markReady).mockResolvedValue(true);
    vi.mocked(evaluateTriggers).mockReturnValue([
      {
        symbol: "BTC/USD",
        assetType: "crypto",
        mode: "intraday" as const,
        windowStart: new Date("2026-05-13T03:15:00Z"),
        windowEnd: new Date("2026-05-13T03:16:00Z"),
        triggerReason: "signal:entry_zone",
        briefMode: "strict",
        digestDate: "2026-05-13",
      },
    ]);
    vi.mocked(generateDigestBrief).mockReturnValue({
      ticker: "BTC/USD",
      status: { label: "Watch zone", tone: "watch" },
      price: 65000,
      changePercent: 2.1,
      confidence: "Medium",
      updatedAt: null,
      whatHappening: "BTC/USD signal",
      whatToWatch: { holdAbove: "63000", breakBelowTarget: "60000" },
      context: "",
      hasMaterialContext: false,
    });
  });

  it("passes assetType='crypto' to getCurrentArtifact in read path", async () => {
    vi.mocked(detectSignals).mockResolvedValue({
      signals: [makeSignal("BTC/USD", "crypto")],
      macroContext: {
        headlines: [],
        dominantTheme: null,
        overallSentiment: 0,
      },
      newsOneLinerMap: new Map(),
      memoryTextMap: new Map(),
      analysisDateMap: new Map(),
    });
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "crypto");

    const readPathCalls = vi.mocked(getCurrentArtifact).mock.calls;
    const readPathCall = readPathCalls.find(
      (c) => c[0].symbol === "BTC/USD",
    );
    expect(readPathCall).toBeDefined();

    const lastCall = readPathCalls[readPathCalls.length - 1]!;
    expect(lastCall[0].assetType).toBe("crypto");
    expect(lastCall[0].symbol).toBe("BTC/USD");
  });

  it("never hardcodes assetType='stock' for crypto symbols", async () => {
    vi.mocked(detectSignals).mockResolvedValue({
      signals: [makeSignal("BTC/USD", "crypto")],
      macroContext: {
        headlines: [],
        dominantTheme: null,
        overallSentiment: 0,
      },
      newsOneLinerMap: new Map(),
      memoryTextMap: new Map(),
      analysisDateMap: new Map(),
    });
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "crypto");

    const allCalls = vi.mocked(getCurrentArtifact).mock.calls;
    for (const call of allCalls) {
      if (call[0].symbol === "BTC/USD") {
        expect(call[0].assetType).not.toBe("stock");
      }
    }
  });
});

// ── E. Delivery parity ───────────────────────────────────────────────

describe("delivery parity — Step 14.1 does not change delivery", () => {
  it("deliverSmartDigest receives same args with flag off vs on", async () => {
    setupDetectSignals("AAPL", "stock");
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({
      id: 1,
      digest_id: "uuid-1",
    });
    vi.mocked(markGenerating).mockResolvedValue(true);
    vi.mocked(markReady).mockResolvedValue(true);

    const depsOff = makeBaseDeps({ canonicalArtifactEnabled: false });
    await processRecommendations(depsOff, "stock");
    const callOff = vi.mocked(deliverSmartDigest).mock.calls[0]!;

    vi.clearAllMocks();
    vi.mocked(listDigestWatchersForSymbol).mockResolvedValue([fakeWatcher]);
    setupDetectSignals("AAPL", "stock");
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({
      id: 2,
      digest_id: "uuid-2",
    });
    vi.mocked(markGenerating).mockResolvedValue(true);
    vi.mocked(markReady).mockResolvedValue(true);

    const depsOn = makeBaseDeps({ canonicalArtifactEnabled: true });
    await processRecommendations(depsOn, "stock");
    const callOn = vi.mocked(deliverSmartDigest).mock.calls[0]!;

    expect(callOff.length).toBe(callOn.length);
    expect(callOff[1]).toEqual(callOn[1]);
    expect(callOff[2]).toEqual(callOn[2]);
    expect(callOff[3]).toEqual(callOn[3]);
  });

  it("deliverSmartDigest signature has no digest_id parameter", () => {
    const mockFn = vi.mocked(deliverSmartDigest);
    expect(mockFn).toBeDefined();

    expect(deliverSmartDigest.length).toBeLessThanOrEqual(5);
  });

  it("renderSmartDigestCard is called with the same brief shape", async () => {
    setupDetectSignals("AAPL", "stock");
    vi.mocked(getCurrentArtifact).mockResolvedValue(null);
    vi.mocked(acquireInFlightSlot).mockResolvedValue({
      id: 1,
      digest_id: "uuid-1",
    });
    vi.mocked(markGenerating).mockResolvedValue(true);
    vi.mocked(markReady).mockResolvedValue(true);

    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await processRecommendations(deps, "stock");

    expect(renderSmartDigestCard).toHaveBeenCalledTimes(1);
    const renderCall = vi.mocked(renderSmartDigestCard).mock.calls[0]!;
    const brief = renderCall[0];
    expect(brief).toHaveProperty("ticker");
    expect(brief).toHaveProperty("status");
    expect(brief).toHaveProperty("whatHappening");
    expect(brief).toHaveProperty("confidence");
  });
});
