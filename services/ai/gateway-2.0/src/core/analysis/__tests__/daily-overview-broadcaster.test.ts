/**
 * Step 14.2/14.3 + Step 15 broadcaster-level tests.
 *
 * Covers:
 *   A. Flag-off parity — legacy synthesizeOverview path, no artifact writes
 *   B. Flag-on write path — orchestrator invoked, synthesis from artifact
 *   C. Flag-on reuse path — existing artifact reused, synthesis skipped
 *   D. Fallback path visibility — template_fallback from orchestrator, broadcast proceeds
 *   E. Delivery ledger — Step 15 artifact linkage (artifact_kind, artifact_id),
 *      delivery_status, message_body=NULL cutover, always-insert semantics
 *
 * After 14.3, the broadcaster delegates to `orchestrateDailyOverviewArtifact`
 * which is mocked at the module boundary. The repo/fingerprint layer is tested
 * in `daily-overview-orchestrator.test.ts` instead.
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

vi.mock("../daily-overview-orchestrator.js", () => ({
  orchestrateDailyOverviewArtifact: vi.fn(),
}));

import { broadcastDailyOverview, type BroadcastDeps } from "../daily-overview-broadcaster.js";
import {
  buildMarketSnapshot,
  synthesizeOverview,
  formatMorningBrief,
} from "../market-overview.js";
import { orchestrateDailyOverviewArtifact } from "../daily-overview-orchestrator.js";

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
  vi.mocked(orchestrateDailyOverviewArtifact).mockResolvedValue({
    source: "fresh",
    artifactId: 1,
    externalId: "uuid-1",
    brief: {
      narrative: "Orchestrated narrative",
      topStories: ["Story B"],
      synthesisSource: "llm" as const,
      durationMs: 3000,
    },
    attempt: 1,
    durationMs: 100,
  });
});

// ── A. Flag-off parity ────────────────────────────────────────────────

describe("flag OFF — legacy parity", () => {
  it("does not call orchestrator", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(deps, "pre_market");

    expect(orchestrateDailyOverviewArtifact).not.toHaveBeenCalled();
  });

  it("calls legacy synthesizeOverview path", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(deps, "pre_market");

    expect(synthesizeOverview).toHaveBeenCalledTimes(1);
  });

  it("defaults to flag-off when canonicalArtifactEnabled is undefined", async () => {
    const deps = makeBaseDeps();
    await broadcastDailyOverview(deps, "pre_market");

    expect(synthesizeOverview).toHaveBeenCalledTimes(1);
    expect(orchestrateDailyOverviewArtifact).not.toHaveBeenCalled();
  });

  it("still formats and broadcasts through the same path", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(deps, "pre_market");

    expect(formatMorningBrief).toHaveBeenCalledTimes(1);
    expect(deps._sendTextCalls.length).toBe(1);
  });
});

// ── B. Flag-on write path ─────────────────────────────────────────────

describe("flag ON — artifact write path via orchestrator", () => {
  it("calls orchestrator when flag is on", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(orchestrateDailyOverviewArtifact).toHaveBeenCalledTimes(1);
    expect(synthesizeOverview).not.toHaveBeenCalled();
  });

  it("uses orchestrator result for formatting", async () => {
    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const formatCall = vi.mocked(formatMorningBrief).mock.calls[0]!;
    const synthesis = formatCall[1] as { narrative: string; topStories: string[] };
    expect(synthesis.narrative).toBe("Orchestrated narrative");
    expect(synthesis.topStories).toEqual(["Story B"]);
  });

  it("still broadcasts after orchestrator returns", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    expect(deps._sendTextCalls.length).toBe(1);
  });
});

// ── C. Flag-on reuse path ─────────────────────────────────────────────

describe("flag ON — artifact reuse path", () => {
  beforeEach(() => {
    vi.mocked(orchestrateDailyOverviewArtifact).mockResolvedValue({
      source: "reuse",
      artifactId: 42,
      externalId: "reused-uuid",
      brief: {
        narrative: "Previously generated narrative",
        topStories: ["Reused story"],
        synthesisSource: "llm" as const,
        durationMs: 2000,
      },
      attempt: 0,
      durationMs: 5,
    });
  });

  it("uses reused artifact narrative for formatting", async () => {
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

describe("flag ON — template fallback from orchestrator", () => {
  it("uses fallback narrative when orchestrator returns fallback source", async () => {
    vi.mocked(orchestrateDailyOverviewArtifact).mockResolvedValue({
      source: "fallback",
      brief: {
        narrative: "Template fallback narrative",
        topStories: [],
        synthesisSource: "template_fallback" as const,
        durationMs: null,
      },
      attempt: 1,
      durationMs: 50,
    });

    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const formatCall = vi.mocked(formatMorningBrief).mock.calls[0]!;
    const synthesis = formatCall[1] as { narrative: string; topStories: string[] };
    expect(synthesis.narrative).toBe("Template fallback narrative");
  });

  it("uses slot_conflict_fallback narrative for formatting", async () => {
    vi.mocked(orchestrateDailyOverviewArtifact).mockResolvedValue({
      source: "slot_conflict_fallback",
      brief: {
        narrative: "Conflict fallback narrative",
        topStories: [],
        synthesisSource: "template_fallback" as const,
        durationMs: null,
      },
      attempt: 1,
      durationMs: 300,
    });

    const deps = makeBaseDeps({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const formatCall = vi.mocked(formatMorningBrief).mock.calls[0]!;
    const synthesis = formatCall[1] as { narrative: string; topStories: string[] };
    expect(synthesis.narrative).toBe("Conflict fallback narrative");
  });

  it("broadcast still succeeds after fallback", async () => {
    vi.mocked(orchestrateDailyOverviewArtifact).mockResolvedValue({
      source: "fallback",
      brief: {
        narrative: "Template fallback",
        topStories: [],
        synthesisSource: "template_fallback" as const,
        durationMs: null,
      },
      attempt: 1,
      durationMs: 50,
    });

    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    const result = await broadcastDailyOverview(deps, "pre_market");

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(0);
  });
});

// ── E. Delivery ledger — Step 15 artifact linkage + message_body=NULL ──

describe("delivery ledger — Step 15 artifact linkage", () => {
  it("INSERT SQL is identical in flag-off and flag-on paths", async () => {
    const depsOff = makeDepsWithRecipients({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(depsOff, "pre_market");
    const insertOff = depsOff._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));

    vi.clearAllMocks();
    vi.mocked(buildMarketSnapshot).mockResolvedValue(MINIMAL_SNAPSHOT);
    vi.mocked(orchestrateDailyOverviewArtifact).mockResolvedValue({
      source: "fresh",
      artifactId: 1,
      externalId: "uuid-1",
      brief: {
        narrative: "Orchestrated narrative",
        topStories: ["Story"],
        synthesisSource: "llm" as const,
        durationMs: 2000,
      },
      attempt: 1,
      durationMs: 100,
    });

    const depsOn = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(depsOn, "pre_market");
    const insertOn = depsOn._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));

    expect(insertOff).toBeDefined();
    expect(insertOn).toBeDefined();
    expect(insertOff!.sql).toBe(insertOn!.sql);
  });

  it("INSERT has exactly 12 positional params (ledger shape)", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    expect(insert!.params).toHaveLength(12);
  });

  it("INSERT contains artifact_kind and artifact_id columns", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain("artifact_kind");
    expect(insert!.sql).toContain("artifact_id");
    expect(insert!.sql).toContain("delivery_status");
    expect(insert!.sql).toContain("channel_type");
  });

  it("flag-on: artifact_kind='daily_overview', artifact_id populated", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![7]).toBe("daily_overview");
    expect(insert!.params![8]).toBe(1);
  });

  it("flag-off: artifact_kind and artifact_id are null", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: false });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![7]).toBeNull();
    expect(insert!.params![8]).toBeNull();
  });

  it("message_body is NULL (Step 15 cutover)", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![5]).toBeNull();
  });

  it("delivery_status='sent' on successful send", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![10]).toBe("sent");
    expect(insert!.params![11]).toBeNull();
  });

  it("recommendation_type is still 'daily_overview'", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![2]).toBe("daily_overview");
  });

  it("ticker_symbol is still 'MARKET'", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![1]).toBe("MARKET");
  });

  it("always inserts a row even on send failure", async () => {
    const deps = makeDepsWithRecipients({ canonicalArtifactEnabled: true });
    (deps.extensions.get as ReturnType<typeof vi.fn>).mockReturnValue({
      sendText: vi.fn(async () => ({ ok: false })),
    });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    expect(insert!.params![10]).toBe("failed");
    expect(insert!.params![11]).toBe("send_failed");
  });
});
