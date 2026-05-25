/**
 * Step 15.2 (slice I) / Step 16.2.a — ledger-row invariant tests.
 *
 * Pins the invariants that every new write to `user_recommendation_log`
 * must satisfy. These are cheap statics over the captured INSERT param
 * arrays from both writers (Smart Digest `deliverSmartDigest` and Daily
 * Overview `broadcastDailyOverview`).
 *
 * Step 16.2.a positional layout (8 columns, legacy denorms removed):
 *
 *   params[0]  clerk_user_id            string, non-null
 *   params[1]  ticker_symbol            string|null
 *   params[2]  recommendation_type      string, non-null (row-type discriminator)
 *   params[3]  artifact_kind            'smart_digest' | 'daily_overview' | null
 *   params[4]  artifact_id              number | null
 *   params[5]  channel_type             string, non-null ('telegram' today)
 *   params[6]  delivery_status          'sent' | 'failed'
 *   params[7]  delivery_failure_reason  DeliveryFailureReason | null
 *
 * Invariants asserted:
 *   1. delivery_status ∈ {'sent','failed'}
 *   2. (artifact_kind === null) === (artifact_id === null)
 *   3. delivery_status === 'failed' ⟹ delivery_failure_reason !== null
 *      AND delivery_failure_reason is a valid DeliveryFailureReason
 *   4. delivery_status === 'sent' ⟹ delivery_failure_reason === null
 *   5. INSERT SQL does not reference legacy denorm columns
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isDeliveryFailureReason,
} from "../delivery-failure.js";

// ── Smart Digest writer (deliverSmartDigest) ─────────────────────────

import {
  deliverSmartDigest,
  type ArtifactRef,
} from "../digest-delivery.js";
import type { DigestBrief } from "../digest-brief-generator.js";
import type { TickerSignal } from "../recommendation-engine.js";
import type { DigestTarget } from "../digest-eligibility.js";

// ── Daily Overview writer (broadcastDailyOverview) ───────────────────
// Mock the upstream snapshot/orchestrator boundary so the broadcaster
// reaches its INSERT path without touching real DB or LLM.

vi.mock("../market-overview.js", () => ({
  buildMarketSnapshot: vi.fn(),
  synthesizeOverviewCore: vi.fn(),
  formatMorningBrief: vi.fn(() => "Morning"),
  formatEveningRecap: vi.fn(() => "Recap"),
  buildTemplateFallbackNarrative: vi.fn(() => "fallback"),
  fetchPriorOverviews: vi.fn(async () => []),
  fetchStockPriceTrajectory: vi.fn(async () => []),
  fetchCryptoPriceTrajectory: vi.fn(async () => []),
}));

vi.mock("../daily-overview-orchestrator.js", () => ({
  orchestrateDailyOverviewArtifact: vi.fn(),
}));

import { broadcastDailyOverview } from "../daily-overview-broadcaster.js";
import {
  buildMarketSnapshot,
} from "../market-overview.js";
import { orchestrateDailyOverviewArtifact } from "../daily-overview-orchestrator.js";

// ── Shared fixtures ──────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params?: unknown[];
}

const SD_TARGET: DigestTarget = {
  clerkUserId: "user-1",
  platformChatId: "chat-1",
  channel: "telegram",
};

const SD_BRIEF: DigestBrief = {
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
};

const SD_PRIMARY: TickerSignal = {
  symbol: "AAPL",
  assetType: "stock",
  type: "entry_zone",
  priority: "high",
  timeframeAlignment: "full",
  headline: "AAPL signal",
  rawData: {
    close: 100,
    daySignal: "bullish",
    swingSignal: "bullish",
    longTermSignal: "bullish",
  },
};

const SD_ARTIFACT: ArtifactRef = { kind: "smart_digest", id: 7 };

const MINIMAL_SNAPSHOT = {
  timestamp: new Date("2026-05-13T14:00:00Z"),
  sessionType: "pre_market" as const,
  indices: [
    { symbol: "SPX500", name: "S&P 500", latestClose: 5400, previousClose: 5380, changePercent: 0.37 },
  ],
  commodities: [],
  crypto: [],
  dxy: null,
  bondYields: [],
  topNews: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildMarketSnapshot).mockResolvedValue(MINIMAL_SNAPSHOT);
  vi.mocked(orchestrateDailyOverviewArtifact).mockResolvedValue({
    source: "fresh",
    artifactId: 11,
    externalId: "uuid-11",
    brief: {
      narrative: "Orchestrated narrative",
      topStories: [],
      synthesisSource: "llm" as const,
      durationMs: 1000,
    },
    attempt: 1,
    durationMs: 50,
  });
});

// ── Helpers ──────────────────────────────────────────────────────────

function makeSDDeps(opts: { telegram: unknown }): {
  db: { query: ReturnType<typeof vi.fn> };
  extensions: { get: ReturnType<typeof vi.fn> };
  log: Record<string, ReturnType<typeof vi.fn>>;
  _queries: CapturedQuery[];
} {
  const queries: CapturedQuery[] = [];
  return {
    db: {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [], rowCount: 0 };
      }),
    },
    extensions: { get: vi.fn(() => opts.telegram) },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    },
    _queries: queries,
  };
}

function makeDODeps(
  recipients: Array<{ clerk_user_id: string; platform_user_id: string }>,
  telegramSendText: () => Promise<unknown>,
): {
  db: { query: ReturnType<typeof vi.fn> };
  redis: Record<string, ReturnType<typeof vi.fn>>;
  extensions: { get: ReturnType<typeof vi.fn> };
  log: Record<string, ReturnType<typeof vi.fn>>;
  _queries: CapturedQuery[];
} {
  const queries: CapturedQuery[] = [];
  return {
    db: {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params });
        if (sql.includes("SELECT DISTINCT ca.clerk_user_id")) {
          return { rows: recipients, rowCount: recipients.length };
        }
        return { rows: [], rowCount: 0 };
      }),
    },
    redis: { get: vi.fn(async () => null), set: vi.fn(async () => "OK") },
    extensions: {
      get: vi.fn(() => ({ sendText: vi.fn(telegramSendText) })),
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    },
    _queries: queries,
  };
}

function findInserts(queries: CapturedQuery[]): CapturedQuery[] {
  return queries.filter((q) =>
    q.sql.includes("INSERT INTO user_recommendation_log"),
  );
}

// ── The invariants — applied to a single captured INSERT ─────────────

function assertLedgerInvariants(insert: CapturedQuery): void {
  expect(insert.params).toBeDefined();
  expect(insert.params!.length).toBe(8);

  const status = insert.params![6];
  const reason = insert.params![7];
  const artifactKind = insert.params![3];
  const artifactId = insert.params![4];

  // 1. delivery_status ∈ {'sent','failed'}
  expect(status === "sent" || status === "failed").toBe(true);

  // 2. artifact pair: both null or both non-null
  expect(artifactKind === null).toBe(artifactId === null);

  // 3. failed ⟹ reason set AND valid
  if (status === "failed") {
    expect(reason).not.toBeNull();
    expect(isDeliveryFailureReason(reason)).toBe(true);
  }

  // 4. sent ⟹ reason null
  if (status === "sent") {
    expect(reason).toBeNull();
  }

  // 5. INSERT SQL does not reference legacy denorm columns
  const sql = insert.sql;
  expect(sql).not.toContain("priority");
  expect(sql).not.toContain("headline");
  expect(sql).not.toContain("message_body");
  expect(sql).not.toContain("timeframe_alignment");
}

// ── Smart Digest writer — exercise sent + 4 failure paths ────────────

describe("ledger invariants — Smart Digest writer", () => {
  it.each([
    {
      label: "happy path",
      telegram: { sendPhoto: vi.fn(async () => ({ ok: true })) },
      rendered: { photo: Buffer.from("png"), caption: "cap" },
      artifact: SD_ARTIFACT as ArtifactRef | null,
    },
    {
      label: "telegram_unavailable",
      telegram: null,
      rendered: { photo: Buffer.from("png"), caption: "cap" },
      artifact: SD_ARTIFACT as ArtifactRef | null,
    },
    {
      label: "render_failed",
      telegram: { sendPhoto: vi.fn(async () => ({ ok: true })) },
      rendered: null,
      artifact: SD_ARTIFACT as ArtifactRef | null,
    },
    {
      label: "send_failed",
      telegram: { sendPhoto: vi.fn(async () => ({ ok: false })) },
      rendered: { photo: Buffer.from("png"), caption: "cap" },
      artifact: SD_ARTIFACT as ArtifactRef | null,
    },
    {
      label: "send_error",
      telegram: {
        sendPhoto: vi.fn(async () => {
          throw new Error("boom");
        }),
      },
      rendered: { photo: Buffer.from("png"), caption: "cap" },
      artifact: SD_ARTIFACT as ArtifactRef | null,
    },
    {
      label: "no artifact ref (orchestrator fallback)",
      telegram: { sendPhoto: vi.fn(async () => ({ ok: true })) },
      rendered: { photo: Buffer.from("png"), caption: "cap" },
      artifact: null as ArtifactRef | null,
    },
  ])("upholds all invariants — $label", async ({ telegram, rendered, artifact }) => {
    const deps = makeSDDeps({ telegram });

    await deliverSmartDigest(
      deps as never,
      SD_TARGET,
      SD_BRIEF,
      SD_PRIMARY,
      rendered,
      artifact,
    );

    const inserts = findInserts(deps._queries);
    expect(inserts.length).toBe(1);
    assertLedgerInvariants(inserts[0]!);
  });
});

// ── Daily Overview writer — exercise sent + 2 failure paths ──────────

describe("ledger invariants — Daily Overview writer", () => {
  it.each([
    {
      label: "happy path",
      send: async () => ({ ok: true }),
    },
    {
      label: "send_failed",
      send: async () => ({ ok: false }),
    },
    {
      label: "send_error",
      send: async () => {
        throw new Error("network");
      },
    },
  ])("upholds all invariants — $label", async ({ send }) => {
    const deps = makeDODeps(
      [{ clerk_user_id: "u-1", platform_user_id: "c-1" }],
      send,
    );

    await broadcastDailyOverview(deps as never, "pre_market");

    const inserts = findInserts(deps._queries);
    expect(inserts.length).toBe(1);
    assertLedgerInvariants(inserts[0]!);
  });
});

// ── Cross-writer parity — INSERT shape is identical (8 cols) ─────────

describe("ledger invariants — both writers share the column shape", () => {
  it("both writers INSERT the same 8 columns in the same order", async () => {
    const sdDeps = makeSDDeps({
      telegram: { sendPhoto: vi.fn(async () => ({ ok: true })) },
    });
    await deliverSmartDigest(
      sdDeps as never,
      SD_TARGET,
      SD_BRIEF,
      SD_PRIMARY,
      { photo: Buffer.from("png"), caption: "cap" },
      SD_ARTIFACT,
    );

    const doDeps = makeDODeps(
      [{ clerk_user_id: "u-1", platform_user_id: "c-1" }],
      async () => ({ ok: true }),
    );
    await broadcastDailyOverview(doDeps as never, "pre_market");

    const sdInsert = findInserts(sdDeps._queries)[0]!;
    const doInsert = findInserts(doDeps._queries)[0]!;

    // Normalise whitespace before comparing the SQL bodies.
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    expect(norm(sdInsert.sql)).toBe(norm(doInsert.sql));
    expect(sdInsert.params!.length).toBe(doInsert.params!.length);
    expect(sdInsert.params!.length).toBe(8);
  });
});
