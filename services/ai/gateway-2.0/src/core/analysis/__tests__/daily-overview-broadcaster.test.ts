/**
 * Step 14.2 broadcaster-level tests.
 *
 * Covers:
 *   A. Flag-off parity — legacy synthesizeOverview path, no artifact writes
 *   B. Flag-on write path — fingerprint, slot acquire, synthesizeOverviewCore, artifact persist
 *   C. Flag-on reuse path — existing artifact reused, synthesis skipped
 *   D. Fallback path visibility — template_fallback persisted, broadcast proceeds
 *   E. Delivery boundary — user_recommendation_log INSERT shape unchanged,
 *      no overview_id/Step 15 linkage leaked
 *
 * Mocks at module boundary so the broadcaster orchestration is exercised
 * without a real database, Redis, LLM, or Telegram.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock("../market-overview.js", () => ({
  buildMarketSnapshot: vi.fn(),
  synthesizeOverview: vi.fn(),
  synthesizeOverviewCore: vi.fn(),
  formatMorningBrief: vi.fn(
    (_snap: unknown, synth: { narrative: string } | null) =>
      `*Morning Brief*\n${synth?.narrative ?? "fallback"}`,
  ),
  formatEveningRecap: vi.fn(
    (_snap: unknown, synth: { narrative: string } | null) =>
      `*Market Recap*\n${synth?.narrative ?? "fallback"}`,
  ),
  buildTemplateFallbackNarrative: vi.fn(() => "Template fallback narrative"),
  fetchPriorOverviews: vi.fn(async () => []),
  fetchStockPriceTrajectory: vi.fn(async () => []),
  fetchCryptoPriceTrajectory: vi.fn(async () => []),
}));

vi.mock("../daily-overview-fingerprint.js", () => ({
  computeOverviewSnapshotHash: vi.fn(() => "snap-hash-stub"),
  computeOverviewContextHash: vi.fn(() => "ctx-hash-stub"),
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

vi.mock("../daily-overview-repository.js", () => ({
  getCurrentOverviewArtifact: vi.fn(),
  acquireOverviewSlot: vi.fn(),
  markOverviewGenerating: vi.fn(),
  markOverviewReady: vi.fn(),
  markOverviewFailed: vi.fn(),
}));

import { broadcastDailyOverview, type BroadcastDeps } from "../daily-overview-broadcaster.js";
import {
  buildMarketSnapshot,
  synthesizeOverview,
  synthesizeOverviewCore,
  formatMorningBrief,
  buildTemplateFallbackNarrative,
} from "../market-overview.js";
import {
  getCurrentOverviewArtifact,
  acquireOverviewSlot,
  markOverviewGenerating,
  markOverviewReady,
  markOverviewFailed,
} from "../daily-overview-repository.js";
import {
  computeOverviewSnapshotHash,
  computeOverviewContextHash,
  gatherContextRefs,
} from "../daily-overview-fingerprint.js";

// ── Helpers ───────────────────────────────────────────────────────────

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

interface CapturedQuery {
  sql: string;
  params?: unknown[];
}

function makeBaseDeps(overrides: Partial<BroadcastDeps> = {}): BroadcastDeps & { _queries: CapturedQuery[] } {
  const queries: CapturedQuery[] = [];
  return {
    db: {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      }),
    } as never,
    redis: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => "OK"),
    } as never,
    extensions: {
      get: vi.fn(() => ({
        sendText: vi.fn(async () => ({ ok: true })),
      })),
    } as never,
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
    _queries: queries,
    ...overrides,
  };
}

function makeDepsWithRecipients(
  overrides: Partial<BroadcastDeps> = {},
): BroadcastDeps & { _queries: CapturedQuery[]; _sendTextCalls: unknown[][] } {
  const queries: CapturedQuery[] = [];
  const sendTextCalls: unknown[][] = [];
  return {
    db: {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("SELECT DISTINCT ca.clerk_user_id")) {
          return {
            rows: [{ clerk_user_id: "user-1", platform_user_id: "chat-1" }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    } as never,
    redis: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => "OK"),
    } as never,
    extensions: {
      get: vi.fn(() => ({
        sendText: vi.fn(async (...args: unknown[]) => {
          sendTextCalls.push(args);
          return { ok: true };
        }),
      })),
    } as never,
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
    _queries: queries,
    _sendTextCalls: sendTextCalls,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildMarketSnapshot).mockResolvedValue(MINIMAL_SNAPSHOT);
  vi.mocked(synthesizeOverview).mockResolvedValue({
    narrative: "Legacy narrative from LLM",
    topStories: ["Story A"],
  });
  vi.mocked(synthesizeOverviewCore).mockResolvedValue({
    narrative: "Core narrative from LLM",
    topStories: ["Story B"],
    durationMs: 3000,
  });
});

// ── A. Flag-off parity ────────────────────────────────────────────────

describe("flag OFF — legacy parity", () => {
  it("does not call any artifact repository functions", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(deps, "pre_market");

    expect(getCurrentOverviewArtifact).not.toHaveBeenCalled();
    expect(acquireOverviewSlot).not.toHaveBeenCalled();
    expect(markOverviewGenerating).not.toHaveBeenCalled();
    expect(markOverviewReady).not.toHaveBeenCalled();
    expect(markOverviewFailed).not.toHaveBeenCalled();
  });

  it("does not call fingerprint functions", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(deps, "pre_market");

    expect(computeOverviewSnapshotHash).not.toHaveBeenCalled();
    expect(computeOverviewContextHash).not.toHaveBeenCalled();
    expect(gatherContextRefs).not.toHaveBeenCalled();
  });

  it("calls legacy synthesizeOverview path", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(deps, "pre_market");

    expect(synthesizeOverview).toHaveBeenCalledTimes(1);
    expect(synthesizeOverviewCore).not.toHaveBeenCalled();
  });

  it("defaults to flag-off when canonicalArtifactEnabled is undefined", async () => {
    const deps = makeBaseDeps();
    await broadcastDailyOverview(deps, "pre_market");

    expect(synthesizeOverview).toHaveBeenCalledTimes(1);
    expect(getCurrentOverviewArtifact).not.toHaveBeenCalled();
  });

  it("still formats and broadcasts through the same path", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(deps, "pre_market");

    expect(formatMorningBrief).toHaveBeenCalledTimes(1);
    expect(deps._sendTextCalls.length).toBe(1);
  });
});

// ── B. Flag-on write path ─────────────────────────────────────────────

describe("flag ON — artifact write path (no reusable artifact)", () => {
  beforeEach(() => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 1, overview_id: "uuid-1" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);
  });

  it("checks fingerprint and reuse before synthesis", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(computeOverviewSnapshotHash).toHaveBeenCalledTimes(1);
    expect(gatherContextRefs).toHaveBeenCalledTimes(1);
    expect(computeOverviewContextHash).toHaveBeenCalledTimes(1);
    expect(getCurrentOverviewArtifact).toHaveBeenCalledTimes(1);
  });

  it("acquires slot and transitions through pending → generating → ready", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(acquireOverviewSlot).toHaveBeenCalledTimes(1);
    expect(markOverviewGenerating).toHaveBeenCalledWith(expect.anything(), 1);
    expect(markOverviewReady).toHaveBeenCalledTimes(1);
  });

  it("calls synthesizeOverviewCore (not legacy synthesizeOverview)", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(synthesizeOverviewCore).toHaveBeenCalledTimes(1);
    expect(synthesizeOverview).not.toHaveBeenCalled();
  });

  it("persists artifact with synthesis_source='llm' and llm duration", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const readyCall = vi.mocked(markOverviewReady).mock.calls[0]![0];
    expect(readyCall).toMatchObject({
      id: 1,
      synthesisSource: "llm",
      narrative: "Core narrative from LLM",
      topStories: ["Story B"],
      llmDurationMs: 3000,
    });
  });

  it("falls back to legacy synthesizeOverview when slot acquisition fails", async () => {
    vi.mocked(acquireOverviewSlot).mockResolvedValue(null);
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(synthesizeOverview).toHaveBeenCalledTimes(1);
    expect(synthesizeOverviewCore).not.toHaveBeenCalled();
  });

  it("still broadcasts after artifact write", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(formatMorningBrief).toHaveBeenCalledTimes(1);
    expect(deps._sendTextCalls.length).toBe(1);
  });
});

// ── C. Flag-on reuse path ─────────────────────────────────────────────

describe("flag ON — artifact reuse path", () => {
  beforeEach(() => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue({
      id: 42,
      overview_id: "reused-uuid",
      narrative: "Previously generated narrative",
      top_stories: ["Reused story"],
    } as never);
  });

  it("skips synthesis entirely when reusable artifact found", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(synthesizeOverviewCore).not.toHaveBeenCalled();
    expect(synthesizeOverview).not.toHaveBeenCalled();
  });

  it("does not acquire slot or mark lifecycle transitions", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(acquireOverviewSlot).not.toHaveBeenCalled();
    expect(markOverviewGenerating).not.toHaveBeenCalled();
    expect(markOverviewReady).not.toHaveBeenCalled();
    expect(markOverviewFailed).not.toHaveBeenCalled();
  });

  it("uses artifact narrative/topStories for formatting", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const formatCall = vi.mocked(formatMorningBrief).mock.calls[0]!;
    const synthesis = formatCall[1] as { narrative: string; topStories: string[] };
    expect(synthesis.narrative).toBe("Previously generated narrative");
    expect(synthesis.topStories).toEqual(["Reused story"]);
  });

  it("still broadcasts to recipients", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(deps._sendTextCalls.length).toBe(1);
  });
});

// ── D. Fallback path visibility ───────────────────────────────────────

describe("flag ON — template fallback when synthesis fails", () => {
  beforeEach(() => {
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 1, overview_id: "uuid-1" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);
  });

  it("persists artifact with synthesis_source='template_fallback' when core returns null", async () => {
    vi.mocked(synthesizeOverviewCore).mockResolvedValue(null);
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(buildTemplateFallbackNarrative).toHaveBeenCalledTimes(1);
    const readyCall = vi.mocked(markOverviewReady).mock.calls[0]![0];
    expect(readyCall).toMatchObject({
      synthesisSource: "template_fallback",
      narrative: "Template fallback narrative",
      topStories: [],
      llmDurationMs: null,
    });
  });

  it("persists failure artifact and uses fallback when core throws", async () => {
    vi.mocked(synthesizeOverviewCore).mockRejectedValue(new Error("LLM timed out"));
    vi.mocked(markOverviewFailed).mockResolvedValue(true);
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(markOverviewFailed).toHaveBeenCalledTimes(1);
    const failCall = vi.mocked(markOverviewFailed).mock.calls[0]![0];
    expect(failCall).toMatchObject({
      id: 1,
      errorCode: "llm_timeout",
    });
    expect(failCall.errorMessage).toContain("LLM timed out");
  });

  it("broadcast still succeeds even after fallback", async () => {
    vi.mocked(synthesizeOverviewCore).mockResolvedValue(null);
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    const result = await broadcastDailyOverview(deps, "pre_market");

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(0);
  });

  it("broadcast still succeeds after synthesis exception", async () => {
    vi.mocked(synthesizeOverviewCore).mockRejectedValue(new Error("spawn failed"));
    vi.mocked(markOverviewFailed).mockResolvedValue(true);
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    const result = await broadcastDailyOverview(deps, "pre_market");

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(0);
  });

  it("classifies error codes correctly", async () => {
    vi.mocked(markOverviewFailed).mockResolvedValue(true);

    vi.mocked(synthesizeOverviewCore).mockRejectedValue(new Error("cursor-agent exited with code 1"));
    const deps1 = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps1, "pre_market");
    expect(vi.mocked(markOverviewFailed).mock.calls[0]![0].errorCode).toBe("llm_exit_nonzero");

    vi.clearAllMocks();
    vi.mocked(buildMarketSnapshot).mockResolvedValue(MINIMAL_SNAPSHOT);
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 2, overview_id: "uuid-2" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewFailed).mockResolvedValue(true);

    vi.mocked(synthesizeOverviewCore).mockRejectedValue(new Error("ENOENT: spawn cursor-agent"));
    const deps2 = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps2, "pre_market");
    expect(vi.mocked(markOverviewFailed).mock.calls[0]![0].errorCode).toBe("llm_spawn_failed");
  });
});

// ── E. Delivery boundary — user_recommendation_log unchanged ──────────

describe("delivery boundary — user_recommendation_log shape unchanged", () => {
  it("INSERT columns are identical in flag-off and flag-on paths", async () => {
    const depsOff = makeDepsWithRecipients({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(depsOff, "pre_market");
    const insertOff = depsOff._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));

    vi.clearAllMocks();
    vi.mocked(buildMarketSnapshot).mockResolvedValue(MINIMAL_SNAPSHOT);
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 1, overview_id: "uuid-1" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);
    vi.mocked(synthesizeOverviewCore).mockResolvedValue({
      narrative: "Core narrative",
      topStories: ["Story"],
      durationMs: 2000,
    });

    const depsOn = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(depsOn, "pre_market");
    const insertOn = depsOn._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));

    expect(insertOff).toBeDefined();
    expect(insertOn).toBeDefined();
    expect(insertOff!.sql).toBe(insertOn!.sql);
  });

  it("INSERT has exactly 7 positional params: clerk_user_id, ticker_symbol, recommendation_type, priority, headline, message_body, timeframe_alignment", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 1, overview_id: "uuid-1" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    expect(insert!.params).toHaveLength(7);
    expect(insert!.sql).toContain("clerk_user_id");
    expect(insert!.sql).toContain("ticker_symbol");
    expect(insert!.sql).toContain("recommendation_type");
    expect(insert!.sql).toContain("priority");
    expect(insert!.sql).toContain("headline");
    expect(insert!.sql).toContain("message_body");
    expect(insert!.sql).toContain("timeframe_alignment");
  });

  it("INSERT does NOT contain overview_id (no Step 15 leakage)", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 1, overview_id: "uuid-1" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    expect(insert!.sql).not.toContain("overview_id");
    expect(insert!.sql).not.toContain("artifact_id");
    expect(insert!.sql).not.toContain("digest_id");
  });

  it("recommendation_type is still 'daily_overview'", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 1, overview_id: "uuid-1" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![2]).toBe("daily_overview");
  });

  it("ticker_symbol is still 'MARKET'", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    vi.mocked(getCurrentOverviewArtifact).mockResolvedValue(null);
    vi.mocked(acquireOverviewSlot).mockResolvedValue({ id: 1, overview_id: "uuid-1" });
    vi.mocked(markOverviewGenerating).mockResolvedValue(true);
    vi.mocked(markOverviewReady).mockResolvedValue(true);
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![1]).toBe("MARKET");
  });
});
