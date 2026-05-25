/**
 * Step 15.2 (slice B) — Smart Digest delivery failure path coverage.
 *
 * Production never naturally produced a `delivery_status='failed'` row
 * during the Step 15.1 cutover, so the failed shape was unverified at
 * runtime. These tests pin the four failure paths in `deliverSmartDigest`
 * against the unified `DeliveryFailureReason` union from
 * `delivery-failure.ts`:
 *
 *   - Telegram extension absent          → 'telegram_unavailable'
 *   - rendered card is null              → 'render_failed'
 *   - sendPhoto resolves { ok: false }   → 'send_failed'
 *   - sendPhoto throws                   → 'send_error'
 *
 * In every failure path we additionally assert:
 *   - one ledger row is written (no skip)
 *   - delivery_status='failed' and delivery_failure_reason matches
 *   - artifact_kind/artifact_id are still threaded when an ArtifactRef
 *     is supplied (Step 15.1 contract preserved)
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
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  deliverSmartDigest,
  type ArtifactRef,
  type DeliveryFailureReason,
} from "../digest-delivery.js";
import { isDeliveryFailureReason } from "../delivery-failure.js";
import type { DigestBrief } from "../digest-brief-generator.js";
import type { TickerSignal } from "../recommendation-engine.js";
import type { DigestTarget } from "../digest-eligibility.js";

interface CapturedQuery {
  sql: string;
  params?: unknown[];
}

const TARGET: DigestTarget = {
  clerkUserId: "user-1",
  platformChatId: "chat-1",
  channel: "telegram",
};

const BRIEF: DigestBrief = {
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

const PRIMARY: TickerSignal = {
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

const ARTIFACT: ArtifactRef = { kind: "smart_digest", id: 42 };

function makeDeps(opts: {
  telegram: unknown;
}): {
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
    extensions: {
      get: vi.fn(() => opts.telegram),
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

function getInsert(queries: CapturedQuery[]): CapturedQuery {
  const insert = queries.find((q) =>
    q.sql.includes("INSERT INTO user_recommendation_log"),
  );
  expect(insert).toBeDefined();
  return insert!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Smart Digest delivery — failed paths (Step 15.2 slice B)", () => {
  it("telegram extension absent → 'telegram_unavailable'", async () => {
    const deps = makeDeps({ telegram: null });

    const result = await deliverSmartDigest(
      deps as never,
      TARGET,
      BRIEF,
      PRIMARY,
      { photo: Buffer.from("png"), caption: "cap" },
      ARTIFACT,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("telegram_unavailable");

    const insert = getInsert(deps._queries);
    expect(insert.params![6]).toBe("failed");
    expect(insert.params![7]).toBe("telegram_unavailable");
    expect(insert.params![3]).toBe("smart_digest");
    expect(insert.params![4]).toBe(42);
    expect(isDeliveryFailureReason(insert.params![7])).toBe(true);
  });

  it("telegram present but sendPhoto missing → 'telegram_unavailable'", async () => {
    const deps = makeDeps({ telegram: { sendText: vi.fn() } }); // no sendPhoto

    const result = await deliverSmartDigest(
      deps as never,
      TARGET,
      BRIEF,
      PRIMARY,
      { photo: Buffer.from("png"), caption: "cap" },
      ARTIFACT,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("telegram_unavailable");
  });

  it("rendered card is null → 'render_failed'", async () => {
    const deps = makeDeps({
      telegram: {
        sendPhoto: vi.fn(async () => ({ ok: true })),
      },
    });

    const result = await deliverSmartDigest(
      deps as never,
      TARGET,
      BRIEF,
      PRIMARY,
      null,
      ARTIFACT,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("render_failed");

    const insert = getInsert(deps._queries);
    expect(insert.params![6]).toBe("failed");
    expect(insert.params![7]).toBe("render_failed");
    expect(insert.params![3]).toBe("smart_digest");
    expect(insert.params![4]).toBe(42);
    expect(isDeliveryFailureReason(insert.params![7])).toBe(true);
  });

  it("sendPhoto resolves { ok: false } → 'send_failed'", async () => {
    const deps = makeDeps({
      telegram: {
        sendPhoto: vi.fn(async () => ({ ok: false })),
      },
    });

    const result = await deliverSmartDigest(
      deps as never,
      TARGET,
      BRIEF,
      PRIMARY,
      { photo: Buffer.from("png"), caption: "cap" },
      ARTIFACT,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("send_failed");

    const insert = getInsert(deps._queries);
    expect(insert.params![6]).toBe("failed");
    expect(insert.params![7]).toBe("send_failed");
    expect(insert.params![3]).toBe("smart_digest");
    expect(insert.params![4]).toBe(42);
    expect(isDeliveryFailureReason(insert.params![7])).toBe(true);
  });

  it("sendPhoto throws → 'send_error'", async () => {
    const deps = makeDeps({
      telegram: {
        sendPhoto: vi.fn(async () => {
          throw new Error("network unreachable");
        }),
      },
    });

    const result = await deliverSmartDigest(
      deps as never,
      TARGET,
      BRIEF,
      PRIMARY,
      { photo: Buffer.from("png"), caption: "cap" },
      ARTIFACT,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("send_error");

    const insert = getInsert(deps._queries);
    expect(insert.params![6]).toBe("failed");
    expect(insert.params![7]).toBe("send_error");
    expect(insert.params![3]).toBe("smart_digest");
    expect(insert.params![4]).toBe(42);
    expect(isDeliveryFailureReason(insert.params![7])).toBe(true);
  });

  it("flag-off: failed-path still writes ledger row with NULL artifact link", async () => {
    const deps = makeDeps({ telegram: null });

    await deliverSmartDigest(
      deps as never,
      TARGET,
      BRIEF,
      PRIMARY,
      { photo: Buffer.from("png"), caption: "cap" },
      null, // no artifact ref
    );

    const insert = getInsert(deps._queries);
    expect(insert.params![6]).toBe("failed");
    expect(insert.params![7]).toBe("telegram_unavailable");
    expect(insert.params![3]).toBeNull();
    expect(insert.params![4]).toBeNull();
  });

  it("happy path: delivery_status='sent', delivery_failure_reason=NULL", async () => {
    const deps = makeDeps({
      telegram: {
        sendPhoto: vi.fn(async () => ({ ok: true })),
      },
    });

    const result = await deliverSmartDigest(
      deps as never,
      TARGET,
      BRIEF,
      PRIMARY,
      { photo: Buffer.from("png"), caption: "cap" },
      ARTIFACT,
    );

    expect(result.ok).toBe(true);

    const insert = getInsert(deps._queries);
    expect(insert.params![6]).toBe("sent");
    expect(insert.params![7]).toBeNull();
    expect(insert.params![3]).toBe("smart_digest");
    expect(insert.params![4]).toBe(42);
  });

  // Sanity: the union members named at runtime must round-trip the guard.
  it("all four reasons are accepted by isDeliveryFailureReason", () => {
    const reasons: DeliveryFailureReason[] = [
      "telegram_unavailable",
      "render_failed",
      "send_failed",
      "send_error",
    ];
    for (const r of reasons) {
      expect(isDeliveryFailureReason(r)).toBe(true);
    }
    expect(isDeliveryFailureReason("render_or_send_error")).toBe(false);
  });

  it("INSERT SQL does not reference legacy denorm columns", async () => {
    const deps = makeDeps({
      telegram: { sendPhoto: vi.fn(async () => ({ ok: true })) },
    });

    await deliverSmartDigest(
      deps as never,
      TARGET,
      BRIEF,
      PRIMARY,
      { photo: Buffer.from("png"), caption: "cap" },
      ARTIFACT,
    );

    const insert = getInsert(deps._queries);
    const sql = insert.sql;
    expect(sql).not.toContain("priority");
    expect(sql).not.toContain("headline");
    expect(sql).not.toContain("message_body");
    expect(sql).not.toContain("timeframe_alignment");
  });
});
