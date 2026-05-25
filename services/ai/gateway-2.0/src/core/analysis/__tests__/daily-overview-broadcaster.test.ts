/**
 * Broadcaster-level tests (post-Step 16.1 — canonical path is the only path).
 *
 * Covers:
 *   A. Write path — orchestrator invoked, synthesis from artifact
 *   B. Reuse path — existing artifact reused, synthesis skipped
 *   C. Fallback path visibility — template_fallback from orchestrator, broadcast proceeds
 *   D. Delivery ledger — artifact linkage (artifact_kind, artifact_id),
 *      delivery_status, always-insert semantics
 *   E. INSERT SQL does not reference legacy denorm columns
 *   F. Failed-path delivery
 *   G. Per-user ledger dedup
 *
 * Step 16.2.a: positional layout is now 8 columns (legacy denorm
 * columns removed from the INSERT).
 *
 *   params[0]  clerk_user_id
 *   params[1]  ticker_symbol
 *   params[2]  recommendation_type
 *   params[3]  artifact_kind
 *   params[4]  artifact_id
 *   params[5]  channel_type
 *   params[6]  delivery_status
 *   params[7]  delivery_failure_reason
 *
 * The broadcaster delegates to `orchestrateDailyOverviewArtifact`
 * which is mocked at the module boundary. The repo/fingerprint layer is tested
 * in `daily-overview-orchestrator.test.ts` instead.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ──────────────────────────────────────────────────────

vi.mock("../market-overview.js", () => ({
  buildMarketSnapshot: vi.fn(),
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

// ── A. Artifact write path via orchestrator ───────────────────────────

describe("artifact write path via orchestrator", () => {
  it("calls orchestrator for every broadcast", async () => {
    const deps = makeBaseDeps();
    await broadcastDailyOverview(deps, "pre_market");

    expect(orchestrateDailyOverviewArtifact).toHaveBeenCalledTimes(1);
  });

  it("uses orchestrator result for formatting", async () => {
    const deps = makeBaseDeps();
    await broadcastDailyOverview(deps, "pre_market");

    const formatCall = vi.mocked(formatMorningBrief).mock.calls[0]!;
    const synthesis = formatCall[1] as { narrative: string; topStories: string[] };
    expect(synthesis.narrative).toBe("Orchestrated narrative");
    expect(synthesis.topStories).toEqual(["Story B"]);
  });

  it("still broadcasts after orchestrator returns", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    expect(deps._sendTextCalls.length).toBe(1);
  });
});

// ── B. Artifact reuse path ────────────────────────────────────────────

describe("artifact reuse path", () => {
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
    const deps = makeBaseDeps();
    await broadcastDailyOverview(deps, "pre_market");

    const formatCall = vi.mocked(formatMorningBrief).mock.calls[0]!;
    const synthesis = formatCall[1] as { narrative: string; topStories: string[] };
    expect(synthesis.narrative).toBe("Previously generated narrative");
    expect(synthesis.topStories).toEqual(["Reused story"]);
  });

  it("still broadcasts to recipients", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    expect(deps._sendTextCalls.length).toBe(1);
  });
});

// ── C. Fallback path visibility ───────────────────────────────────────

describe("template fallback from orchestrator", () => {
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

    const deps = makeBaseDeps();
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

    const deps = makeBaseDeps();
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

    const deps = makeDepsWithRecipients();
    const result = await broadcastDailyOverview(deps, "pre_market");

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(0);
  });
});

// ── D. Delivery ledger — artifact linkage ─────────────────────────────

describe("delivery ledger — artifact linkage", () => {
  it("INSERT has exactly 8 positional params (ledger shape)", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    expect(insert!.params).toHaveLength(8);
  });

  it("INSERT contains artifact_kind and artifact_id columns", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain("artifact_kind");
    expect(insert!.sql).toContain("artifact_id");
    expect(insert!.sql).toContain("delivery_status");
    expect(insert!.sql).toContain("channel_type");
  });

  it("artifact_kind='daily_overview', artifact_id populated", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![3]).toBe("daily_overview");
    expect(insert!.params![4]).toBe(1);
  });

  it("delivery_status='sent' on successful send", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![6]).toBe("sent");
    expect(insert!.params![7]).toBeNull();
  });

  it("recommendation_type is still 'daily_overview'", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![2]).toBe("daily_overview");
  });

  it("always inserts a row even on send failure", async () => {
    const deps = makeDepsWithRecipients();
    (deps.extensions.get as ReturnType<typeof vi.fn>).mockReturnValue({
      sendText: vi.fn(async () => ({ ok: false })),
    });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    expect(insert!.params![6]).toBe("failed");
    expect(insert!.params![7]).toBe("send_failed");
  });
});

// ── E. INSERT SQL does not reference legacy denorm columns ────────────

describe("Step 16.2.a — INSERT SQL shape lock-in", () => {
  it("INSERT SQL does not reference legacy denorm columns", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert).toBeDefined();
    const sql = insert!.sql;
    expect(sql).not.toContain("priority");
    expect(sql).not.toContain("headline");
    expect(sql).not.toContain("message_body");
    expect(sql).not.toContain("timeframe_alignment");
  });

  it("ticker_symbol is NULL for daily_overview rows", async () => {
    const deps = makeDepsWithRecipients();
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![1]).toBeNull();
  });
});

// ── F. Failed-path coverage ───────────────────────────────────────────

describe("Step 15.2 — failed-path delivery", () => {
  it("sendText returns ok=false → delivery_status='failed', reason 'send_failed'", async () => {
    const deps = makeDepsWithRecipients();
    (deps.extensions.get as ReturnType<typeof vi.fn>).mockReturnValue({
      sendText: vi.fn(async () => ({ ok: false })),
    });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![6]).toBe("failed");
    expect(insert!.params![7]).toBe("send_failed");
  });

  it("sendText throws → delivery_status='failed', reason 'send_error'", async () => {
    const deps = makeDepsWithRecipients();
    (deps.extensions.get as ReturnType<typeof vi.fn>).mockReturnValue({
      sendText: vi.fn(async () => {
        throw new Error("network blew up");
      }),
    });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![6]).toBe("failed");
    expect(insert!.params![7]).toBe("send_error");
  });

  it("failed delivery still carries artifact link", async () => {
    const deps = makeDepsWithRecipients();
    (deps.extensions.get as ReturnType<typeof vi.fn>).mockReturnValue({
      sendText: vi.fn(async () => ({ ok: false })),
    });
    await broadcastDailyOverview(deps, "pre_market");

    const insert = deps._queries.find((q) => q.sql.includes("INSERT INTO user_recommendation_log"));
    expect(insert!.params![3]).toBe("daily_overview");
    expect(insert!.params![4]).toBe(1);
  });
});

// ── G. Per-user ledger dedup ──────────────────────────────────────────

describe("Step 15.2 — per-user ledger dedup", () => {
  function makeDepsWithDedup(
    alreadyDeliveredUserIds: string[],
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
              rows: [
                { clerk_user_id: "user-1", platform_user_id: "chat-1" },
                { clerk_user_id: "user-2", platform_user_id: "chat-2" },
              ],
              rowCount: 2,
            };
          }
          if (sql.includes("FROM user_recommendation_log") && sql.includes("artifact_kind")) {
            return {
              rows: alreadyDeliveredUserIds.map((id) => ({ clerk_user_id: id })),
              rowCount: alreadyDeliveredUserIds.length,
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

  it("skips recipients already in ledger for this artifact (no send, no row)", async () => {
    const deps = makeDepsWithDedup(["user-1"]);
    const result = await broadcastDailyOverview(deps, "pre_market");

    expect(deps._sendTextCalls.length).toBe(1);
    const inserts = deps._queries.filter((q) =>
      q.sql.includes("INSERT INTO user_recommendation_log"),
    );
    expect(inserts.length).toBe(1);
    expect(inserts[0]!.params![0]).toBe("user-2");
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("ledger query failure degrades to no-dedup (does not block broadcast)", async () => {
    const queries: CapturedQuery[] = [];
    const sendTextCalls: unknown[][] = [];
    const deps: BroadcastDeps & { _queries: CapturedQuery[]; _sendTextCalls: unknown[][] } = {
      db: {
        query: vi.fn(async (sql: string, params?: unknown[]) => {
          queries.push({ sql, params });
          if (sql.includes("SELECT DISTINCT ca.clerk_user_id")) {
            return {
              rows: [{ clerk_user_id: "user-1", platform_user_id: "chat-1" }],
              rowCount: 1,
            };
          }
          if (sql.includes("FROM user_recommendation_log") && sql.includes("artifact_kind")) {
            throw new Error("ledger query failed");
          }
          return { rows: [], rowCount: 0 };
        }),
      } as never,
      redis: { get: vi.fn(async () => null), set: vi.fn(async () => "OK") } as never,
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
    };

    const result = await broadcastDailyOverview(deps, "pre_market");

    expect(sendTextCalls.length).toBe(1);
    expect(result.sent).toBe(1);
  });
});
