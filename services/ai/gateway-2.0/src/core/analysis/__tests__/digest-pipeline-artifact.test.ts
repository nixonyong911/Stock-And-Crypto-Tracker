/**
 * Artifact-layer pipeline tests.
 *
 * Covers:
 *   A. Write path — artifact persisted via orchestrator
 *   B. Delivery brief comes from the canonical artifact (carries the LLM
 *      action guide); local generateDigestBrief is the degraded fallback
 *   C. Crypto asset type flows through persistence path (no stock-hardcoding)
 *   D. Delivery — deliverSmartDigest receives ArtifactRef (Step 15)
 *   E. Cap consumed only on successful delivery (Step 15.2)
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
  vi.resetAllMocks();
  vi.mocked(generateDigestBrief).mockReturnValue({
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
  });
  vi.mocked(renderSmartDigestCard).mockResolvedValue({
    photo: Buffer.from("png-stub"),
    caption: "caption-stub",
  });
  vi.mocked(deliverSmartDigest).mockResolvedValue({ ok: true });
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
      actionGuide: "LLM-composed guide from the artifact",
      actionGuideSource: "llm",
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
    analystMixMap: new Map(),
    cardExtrasMap: new Map(),
      techLevelsMap: new Map(),
  });
}

// ── A. Write path ─────────────────────────────────────────────────────

describe("canonical artifact write path", () => {
  it("calls orchestrator for every signal batch", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(orchestrateDigestArtifact).toHaveBeenCalledTimes(1);
  });

  it("handles orchestrator failure gracefully", async () => {
    vi.mocked(orchestrateDigestArtifact).mockRejectedValueOnce(
      new Error("orchestration exploded"),
    );

    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    expect(call[5]).toBeNull();
  });
});

// ── B. Delivery brief from the canonical artifact ─────────────────────

describe("brief source and artifact ref", () => {
  it("delivers the artifact brief (LLM guide intact) without regenerating", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    // The artifact already carries the brief (incl. the LLM action guide);
    // a local regeneration would silently drop the LLM prose.
    expect(generateDigestBrief).not.toHaveBeenCalled();
    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const deliverCall = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    const deliveredBrief = deliverCall[2];
    expect(deliveredBrief.whatHappening).toBe("AAPL hit entry zone");
    expect(deliveredBrief.actionGuide).toBe("LLM-composed guide from the artifact");
    expect(deliveredBrief.actionGuideSource).toBe("llm");
  });

  it("falls back to generateDigestBrief when artifact persistence failed", async () => {
    vi.mocked(orchestrateDigestArtifact).mockRejectedValueOnce(
      new Error("orchestration exploded"),
    );
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(generateDigestBrief).toHaveBeenCalledTimes(1);
    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
  });

  it("passes artifact ref to deliverSmartDigest when artifact persisted", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps();

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
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const deliverCall = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    const artifactRef = deliverCall[5];
    expect(artifactRef).toBeNull();
  });
});

// ── C. Crypto asset type flows through persistence path ───────────────

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
      analystMixMap: new Map(),
      cardExtrasMap: new Map(),
      techLevelsMap: new Map(),
    });
    const deps = makeBaseDeps();

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
      analystMixMap: new Map(),
      cardExtrasMap: new Map(),
      techLevelsMap: new Map(),
    });
    const deps = makeBaseDeps();

    await processRecommendations(deps, "crypto");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    expect(call[5]).toEqual({ kind: "smart_digest", id: 5 });
  });
});

// ── D. Delivery — artifact ref threading ──────────────────────────────

describe("delivery — artifact ref threading", () => {
  it("deliverSmartDigest receives ArtifactRef when artifact persisted", async () => {
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
    const deps = makeBaseDeps();
    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    expect(call[5]).toEqual({ kind: "smart_digest", id: 7 });
  });

  it("deliverSmartDigest receives expected arg shape (ledger-INSERT contract)", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps();
    await processRecommendations(deps, "stock");

    expect(deliverSmartDigest).toHaveBeenCalledTimes(1);
    const call = vi.mocked(deliverSmartDigest).mock.calls[0]!;
    expect(call[1]).toEqual(fakeWatcher);
    expect(call[2]).toHaveProperty("ticker", "AAPL");
    expect(call[2]).toHaveProperty("whatHappening");
    expect(call[5]).toEqual({ kind: "smart_digest", id: 1 });
  });

  it("renderSmartDigestCard is called with the expected brief shape", async () => {
    setupDetectSignals("AAPL", "stock");
    const deps = makeBaseDeps();
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

// ── E. Step 15.2 — cap-not-incremented-on-failure (slice D) ──────────

describe("Step 15.2 — cap consumed only on successful delivery", () => {
  it("recordDigestSent is invoked when delivery succeeds", async () => {
    const { recordDigestSent } = await import("../digest-eligibility.js");
    setupDetectSignals("AAPL", "stock");
    vi.mocked(deliverSmartDigest).mockResolvedValueOnce({ ok: true });
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(recordDigestSent).toHaveBeenCalledTimes(1);
    expect(recordDigestSent).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
    );
  });

  it("recordDigestSent is NOT invoked when delivery fails (telegram_unavailable)", async () => {
    const { recordDigestSent } = await import("../digest-eligibility.js");
    setupDetectSignals("AAPL", "stock");
    vi.mocked(deliverSmartDigest).mockResolvedValueOnce({
      ok: false,
      reason: "telegram_unavailable",
    });
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(recordDigestSent).not.toHaveBeenCalled();
  });

  it("recordDigestSent is NOT invoked when delivery fails (render_failed)", async () => {
    const { recordDigestSent } = await import("../digest-eligibility.js");
    setupDetectSignals("AAPL", "stock");
    vi.mocked(deliverSmartDigest).mockResolvedValueOnce({
      ok: false,
      reason: "render_failed",
    });
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(recordDigestSent).not.toHaveBeenCalled();
  });

  it("recordDigestSent is NOT invoked when delivery fails (send_error)", async () => {
    const { recordDigestSent } = await import("../digest-eligibility.js");
    setupDetectSignals("AAPL", "stock");
    vi.mocked(deliverSmartDigest).mockResolvedValueOnce({
      ok: false,
      reason: "send_error",
    });
    const deps = makeBaseDeps();

    await processRecommendations(deps, "stock");

    expect(recordDigestSent).not.toHaveBeenCalled();
  });

  it("`sent` count reflects only successful deliveries", async () => {
    setupDetectSignals("AAPL", "stock");
    vi.mocked(deliverSmartDigest).mockResolvedValueOnce({
      ok: false,
      reason: "send_failed",
    });
    const deps = makeBaseDeps();

    const result = await processRecommendations(deps, "stock");

    expect(result.sent).toBe(0);
  });
});
