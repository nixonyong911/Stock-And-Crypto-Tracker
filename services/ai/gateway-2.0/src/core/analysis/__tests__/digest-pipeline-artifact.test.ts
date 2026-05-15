/**
 * Step 14.1 + Step 15 artifact-layer pipeline tests.
 *
 * Covers:
 *   A. Flag-off parity — legacy flow unchanged when canonical artifact disabled
 *   B. Flag-on write path — artifact persisted via orchestrator
 *   C. Flag-on: brief always from generateDigestBrief, artifact ref threaded
 *   D. Crypto asset type flows through persistence path (no stock-hardcoding)
 *   E. Delivery — deliverSmartDigest receives ArtifactRef when flag-on (Step 15)
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

vi.mock("../smart-digest-orchestrator.js", () => ({
  orchestrateDigestArtifact: vi.fn(),
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
import { detectSignals } from "../recommendation-engine.js";
import { listDigestWatchersForSymbol } from "../digest-eligibility.js";
import { deliverSmartDigest, renderSmartDigestCard } from "../digest-delivery.js";
import { generateDigestBrief } from "../digest-brief-generator.js";
import { orchestrateDigestArtifact } from "../smart-digest-orchestrator.js";
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
  vi.mocked(orchestrateDigestArtifact).mockResolvedValue({
    source: "fresh",
    artifactId: 1,
    externalId: "uuid-1",
    brief: {
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
    },
    attempt: 1,
    durationMs: 50,
  });
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
  it("calls orchestrator when flag is on", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(orchestrateDigestArtifact).toHaveBeenCalledTimes(1);
  });

  it("does not call orchestrator when flag is off", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });

    await processRecommendations(deps, "stock");

    expect(orchestrateDigestArtifact).not.toHaveBeenCalled();
  });

  it("handles orchestrator failure gracefully", async () => {
    vi.mocked(orchestrateDigestArtifact).mockRejectedValueOnce(
      new Error("orchestration exploded"),
    );

    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    expect(call[5]).toBeNull();
  });
});

// ── C. Flag-on: brief always from generateDigestBrief, artifact ref threaded ──

describe("canonical artifact flag ON — brief source and artifact ref", () => {
  it("always uses generateDigestBrief for the delivery brief", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(generateDigestBrief).toHaveBeenCalled();
    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const deliverCall = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    const deliveredBrief = deliverCall[2];
    expect(deliveredBrief.whatHappening).toBe("AAPL hit entry zone");
  });

  it("passes artifact ref to deliverSmartDigest when artifact persisted", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const deliverCall = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    const artifactRef = deliverCall[5];
    expect(artifactRef).toEqual({ kind: "smart_digest", id: 1 });
  });

  it("passes null artifact ref when orchestrator returns no artifactId (fallback)", async () => {
    vi.mocked(orchestrateDigestArtifact).mockResolvedValueOnce({
      source: "fallback",
      brief: {
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
      },
      attempt: 1,
      durationMs: 50,
    });

    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });

    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const deliverCall = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    const artifactRef = deliverCall[5];
    expect(artifactRef).toBeNull();
  });
});

// ── D. Crypto asset type flows through persistence path ───────────────

describe("crypto artifact persistence uses correct assetType", () => {
  beforeEach(() => {
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
    vi.mocked(orchestrateDigestArtifact).mockResolvedValue({
      source: "fresh",
      artifactId: 5,
      externalId: "uuid-crypto",
      brief: {
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
      },
      attempt: 1,
      durationMs: 50,
    });
  });

  it("passes assetType='crypto' to orchestrator during persistence", async () => {
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

    const calls = vi.mocked(orchestrateDigestArtifact).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const cryptoCall = calls.find((c) => c[2] === "BTC/USD");
    expect(cryptoCall).toBeDefined();
    expect(cryptoCall![3]).toBe("crypto");
  });

  it("threads crypto artifact ref to delivery", async () => {
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

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    expect(call[5]).toEqual({ kind: "smart_digest", id: 5 });
  });
});

// ── E. Delivery — Step 15 artifact ref threading ──────────────────────

describe("delivery — Step 15 artifact ref threading", () => {
  it("flag-off: deliverSmartDigest receives null artifactRef", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });

    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    expect(call[5]).toBeNull();
  });

  it("flag-on: deliverSmartDigest receives ArtifactRef when artifact persisted", async () => {
    vi.mocked(orchestrateDigestArtifact).mockResolvedValueOnce({
      source: "fresh",
      artifactId: 7,
      externalId: "uuid-7",
      brief: {
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
      },
      attempt: 1,
      durationMs: 50,
    });

    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    expect(call[5]).toEqual({ kind: "smart_digest", id: 7 });
  });

  it("first 5 args are identical between flag-off and flag-on", async () => {
    setupDetectSignals("AAPL", "stock");
    const depsOff = makeBaseDeps({ canonicalArtifactEnabled: false });
    await processRecommendations(depsOff, "stock");
    const callOff = vi.mocked(deliverSmartDigest).mock.calls[0]!;

    vi.clearAllMocks();
    vi.mocked(listDigestWatchersForSymbol).mockResolvedValue([fakeWatcher]);
    vi.mocked(orchestrateDigestArtifact).mockResolvedValue({
      source: "fresh",
      artifactId: 2,
      externalId: "uuid-2",
      brief: {
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
      },
      attempt: 1,
      durationMs: 50,
    });
    setupDetectSignals("AAPL", "stock");

    const depsOn = makeBaseDeps({ canonicalArtifactEnabled: true });
    await processRecommendations(depsOn, "stock");
    const callOn = vi.mocked(deliverSmartDigest).mock.calls[0]!;

    expect(callOff[1]).toEqual(callOn[1]);
    expect(callOff[2]).toEqual(callOn[2]);
    expect(callOff[3]).toEqual(callOn[3]);
  });

  it("renderSmartDigestCard is called with the same brief shape", async () => {
    setupDetectSignals("AAPL", "stock");
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
