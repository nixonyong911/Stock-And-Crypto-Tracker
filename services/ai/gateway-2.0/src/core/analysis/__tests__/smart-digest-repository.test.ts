import { describe, it, expect, vi } from "vitest";
import {
  getCurrentArtifact,
  findCurrentCandidates,
  findSlotPeers,
  acquireInFlightSlot,
  markGenerating,
  markReady,
  markFailed,
  markInvalidated,
  selectByDigestId,
  selectById,
  listRecent,
  listInflight,
} from "../smart-digest-repository.js";

// ── Mock pool ─────────────────────────────────────────────────────────

interface CapturedQuery {
  sql: string;
  params?: unknown[];
}

function makeMockPool(options?: {
  queryResult?: { rows: unknown[]; rowCount: number };
  throwOnInsert?: Error;
}) {
  const queries: CapturedQuery[] = [];
  const defaultResult = options?.queryResult ?? { rows: [], rowCount: 0 };
  const pool = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      if (
        options?.throwOnInsert &&
        typeof sql === "string" &&
        sql.includes("INSERT")
      ) {
        throw options.throwOnInsert;
      }
      return defaultResult;
    }),
  } as never;
  return { pool, queries };
}

// ── getCurrentArtifact ────────────────────────────────────────────────

describe("getCurrentArtifact", () => {
  it("returns null when no matching row exists", async () => {
    const { pool } = makeMockPool();
    const result = await getCurrentArtifact({
      db: pool,
      symbol: "AAPL",
      assetType: "stock",
      briefMode: "strict",
      truthHash: "abc",
      contextHash: "def",
      schemaVersion: 1,
      generatorVersion: "1",
      promptVersion: null,
      maxAgeMs: 86_400_000,
    });
    expect(result).toBeNull();
  });

  it("returns the matching row when found", async () => {
    const fakeRow = { id: 42, digest_id: "uuid-1", symbol: "AAPL" };
    const { pool } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await getCurrentArtifact({
      db: pool,
      symbol: "AAPL",
      assetType: "stock",
      briefMode: "strict",
      truthHash: "abc",
      contextHash: "def",
      schemaVersion: 1,
      generatorVersion: "1",
      promptVersion: null,
      maxAgeMs: 86_400_000,
    });
    expect(result).toEqual(fakeRow);
  });

  it("uses generator_version in WHERE, NOT code_version", async () => {
    const { pool, queries } = makeMockPool();
    await getCurrentArtifact({
      db: pool,
      symbol: "AAPL",
      assetType: "stock",
      briefMode: "strict",
      truthHash: "abc",
      contextHash: "def",
      schemaVersion: 1,
      generatorVersion: "1",
      promptVersion: null,
      maxAgeMs: 86_400_000,
    });
    expect(queries).toHaveLength(1);
    const sql = queries[0]!.sql;
    expect(sql).toContain("generator_version");
    expect(sql).not.toContain("code_version");
  });

  it("reuses artifact across different code_version when generator_version matches", async () => {
    const fakeRow = { id: 42, digest_id: "uuid-1", code_version: "sha-old" };
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await getCurrentArtifact({
      db: pool,
      symbol: "AAPL",
      assetType: "stock",
      briefMode: "strict",
      truthHash: "abc",
      contextHash: "def",
      schemaVersion: 1,
      generatorVersion: "1",
      promptVersion: null,
      maxAgeMs: 86_400_000,
    });
    expect(result).not.toBeNull();
    expect(result!.code_version).toBe("sha-old");
    const params = queries[0]!.params!;
    expect(params).not.toContain("sha-old");
    expect(params).not.toContain("sha-new");
  });

  it("passes prompt_version as IS NOT DISTINCT FROM parameter", async () => {
    const { pool, queries } = makeMockPool();
    await getCurrentArtifact({
      db: pool,
      symbol: "AAPL",
      assetType: "stock",
      briefMode: "strict",
      truthHash: "abc",
      contextHash: "def",
      schemaVersion: 1,
      generatorVersion: "1",
      promptVersion: null,
      maxAgeMs: 86_400_000,
    });
    const sql = queries[0]!.sql;
    expect(sql).toContain("IS NOT DISTINCT FROM");
    expect(queries[0]!.params![7]).toBeNull();
  });
});

// ── acquireInFlightSlot ───────────────────────────────────────────────

describe("acquireInFlightSlot", () => {
  const baseParams = {
    symbol: "AAPL",
    assetType: "stock",
    digestDate: "2026-05-13",
    mode: "intraday" as const,
    windowStart: new Date("2026-05-13T15:30:00Z"),
    windowEnd: new Date("2026-05-13T15:31:00Z"),
    triggerReason: "signal:target_reached",
    briefMode: "strict",
    truthHash: "abc",
    contextHash: "def",
    schemaVersion: 1,
    generatorVersion: "1",
    promptVersion: null,
    codeVersion: "sha-abc",
  };

  it("returns id and digest_id on success", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [{ id: 1, digest_id: "uuid-1" }], rowCount: 1 },
    });
    const result = await acquireInFlightSlot({ db: pool, ...baseParams });
    expect(result).toEqual({ id: 1, digest_id: "uuid-1" });
  });

  it("returns null on partial-unique violation (another worker owns the slot)", async () => {
    const err = new Error("uq_smart_digest_inflight");
    const { pool } = makeMockPool({ throwOnInsert: err });
    const result = await acquireInFlightSlot({ db: pool, ...baseParams });
    expect(result).toBeNull();
  });

  it("re-throws non-conflict errors", async () => {
    const err = new Error("connection refused");
    const { pool } = makeMockPool({ throwOnInsert: err });
    await expect(
      acquireInFlightSlot({ db: pool, ...baseParams }),
    ).rejects.toThrow("connection refused");
  });

  it("records code_version for audit", async () => {
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [{ id: 1, digest_id: "uuid-1" }], rowCount: 1 },
    });
    await acquireInFlightSlot({ db: pool, ...baseParams });
    const sql = queries[0]!.sql;
    expect(sql).toContain("code_version");
    expect(queries[0]!.params).toContain("sha-abc");
  });
});

// ── markGenerating ────────────────────────────────────────────────────

describe("markGenerating", () => {
  it("returns true when row updated", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    const ok = await markGenerating(pool, 42);
    expect(ok).toBe(true);
  });

  it("returns false when no row matched (wrong status)", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [], rowCount: 0 },
    });
    const ok = await markGenerating(pool, 42);
    expect(ok).toBe(false);
  });

  it("includes status = pending guard", async () => {
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    await markGenerating(pool, 42);
    expect(queries[0]!.sql).toContain("status = 'pending'");
  });
});

// ── markReady ─────────────────────────────────────────────────────────

describe("markReady", () => {
  it("returns true when row updated", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    const ok = await markReady({
      db: pool,
      id: 42,
      payload: { ticker: "AAPL" },
      title: "AAPL digest",
      summary: "Price moved",
      primarySignalType: "target_reached",
      confidence: "High",
      stanceLabel: "Watch zone",
      stanceTone: "bullish",
      truthRefs: { priceTargetId: 1 },
    });
    expect(ok).toBe(true);
  });

  it("only transitions from pending or generating", async () => {
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    await markReady({
      db: pool,
      id: 42,
      payload: {},
      title: null,
      summary: null,
      primarySignalType: null,
      confidence: null,
      stanceLabel: null,
      stanceTone: null,
      truthRefs: {},
    });
    expect(queries[0]!.sql).toContain("IN ('pending', 'generating')");
  });
});

// ── markFailed ────────────────────────────────────────────────────────

describe("markFailed", () => {
  it("returns true when row updated", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    const ok = await markFailed({
      db: pool,
      id: 42,
      errorCode: "truth_fetch_failed",
      errorMessage: "timeout",
      errorStack: "Error: timeout\n  at ...",
    });
    expect(ok).toBe(true);
  });

  it("returns false when no row matched", async () => {
    const { pool } = makeMockPool();
    const ok = await markFailed({
      db: pool,
      id: 42,
      errorCode: "unknown",
      errorMessage: "fail",
      errorStack: "",
    });
    expect(ok).toBe(false);
  });
});

// ── selectByDigestId ──────────────────────────────────────────────────

describe("selectByDigestId", () => {
  it("returns the row when found", async () => {
    const fakeRow = { id: 1, digest_id: "uuid-1" };
    const { pool } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await selectByDigestId(pool, "uuid-1");
    expect(result).toEqual(fakeRow);
  });

  it("returns null when not found", async () => {
    const { pool } = makeMockPool();
    const result = await selectByDigestId(pool, "uuid-missing");
    expect(result).toBeNull();
  });
});

// ── findCurrentCandidates ─────────────────────────────────────────────

describe("findCurrentCandidates", () => {
  const baseParams = {
    symbol: "AAPL",
    assetType: "stock",
    briefMode: "strict",
    truthHash: "abc",
    contextHash: "def",
    schemaVersion: 1,
    generatorVersion: "1",
    promptVersion: null,
    maxAgeMs: 86_400_000,
  };

  it("shares the same WHERE clause as getCurrentArtifact", async () => {
    const { pool: pool1, queries: q1 } = makeMockPool();
    const { pool: pool2, queries: q2 } = makeMockPool();
    await getCurrentArtifact({ db: pool1, ...baseParams });
    await findCurrentCandidates({ db: pool2, ...baseParams });
    const where1 = q1[0]!.sql.split("ORDER BY")[0]!.replace(/SELECT \*/, "");
    const where2 = q2[0]!.sql.split("ORDER BY")[0]!.replace(/SELECT \*/, "");
    expect(where2).toBe(where1);
  });

  it("returns up to candidateLimit rows", async () => {
    const { pool, queries } = makeMockPool();
    await findCurrentCandidates({ db: pool, ...baseParams, candidateLimit: 3 });
    expect(queries[0]!.params![9]).toBe(3);
  });

  it("defaults candidateLimit to 5", async () => {
    const { pool, queries } = makeMockPool();
    await findCurrentCandidates({ db: pool, ...baseParams });
    expect(queries[0]!.params![9]).toBe(5);
  });
});

// ── findSlotPeers ─────────────────────────────────────────────────────

describe("findSlotPeers", () => {
  it("filters by slot keys and status ready", async () => {
    const { pool, queries } = makeMockPool();
    await findSlotPeers(pool, { symbol: "AAPL", assetType: "stock", briefMode: "strict" });
    const sql = queries[0]!.sql;
    expect(sql).toContain("symbol = $1");
    expect(sql).toContain("asset_type = $2");
    expect(sql).toContain("brief_mode = $3");
    expect(sql).toContain("status = 'ready'");
  });

  it("defaults limit to 3", async () => {
    const { pool, queries } = makeMockPool();
    await findSlotPeers(pool, { symbol: "AAPL", assetType: "stock", briefMode: "strict" });
    expect(queries[0]!.params![3]).toBe(3);
  });
});

// ── selectById ────────────────────────────────────────────────────────

describe("selectById", () => {
  it("returns the row when found", async () => {
    const fakeRow = { id: 42, digest_id: "uuid-1" };
    const { pool } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await selectById(pool, 42);
    expect(result).toEqual(fakeRow);
  });

  it("returns null when not found", async () => {
    const { pool } = makeMockPool();
    const result = await selectById(pool, 999);
    expect(result).toBeNull();
  });
});

// ── markInvalidated ───────────────────────────────────────────────────

describe("markInvalidated", () => {
  it("returns updated row when CAS succeeds", async () => {
    const fakeRow = { id: 42, status: "invalidated" };
    const { pool } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await markInvalidated({ db: pool, id: 42, reason: "bad data" });
    expect(result).toEqual(fakeRow);
  });

  it("returns null when row is not in ready status", async () => {
    const { pool } = makeMockPool();
    const result = await markInvalidated({ db: pool, id: 42, reason: "test" });
    expect(result).toBeNull();
  });

  it("uses CAS guard status = ready", async () => {
    const { pool, queries } = makeMockPool();
    await markInvalidated({ db: pool, id: 42, reason: "test" });
    expect(queries[0]!.sql).toContain("status = 'ready'");
    expect(queries[0]!.sql).toContain("RETURNING *");
  });

  it("sets invalidated_at and error_message", async () => {
    const { pool, queries } = makeMockPool();
    await markInvalidated({ db: pool, id: 42, reason: "corrupt payload" });
    const sql = queries[0]!.sql;
    expect(sql).toContain("invalidated_at = NOW()");
    expect(sql).toContain("error_message = $2");
    expect(queries[0]!.params![1]).toBe("corrupt payload");
  });
});

// ── listInflight ──────────────────────────────────────────────────────

describe("listInflight", () => {
  it("filters by pending/generating status", async () => {
    const { pool, queries } = makeMockPool();
    await listInflight(pool);
    const sql = queries[0]!.sql;
    expect(sql).toContain("IN ('pending','generating')");
  });

  it("applies olderThanMs threshold", async () => {
    const { pool, queries } = makeMockPool();
    await listInflight(pool, { olderThanMs: 600_000 });
    expect(queries[0]!.params![0]).toBe("600");
  });

  it("defaults olderThanMs to 0", async () => {
    const { pool, queries } = makeMockPool();
    await listInflight(pool);
    expect(queries[0]!.params![0]).toBe("0");
  });

  it("respects custom limit", async () => {
    const { pool, queries } = makeMockPool();
    await listInflight(pool, { limit: 10 });
    expect(queries[0]!.params![1]).toBe(10);
  });

  it("orders by requested_at ASC", async () => {
    const { pool, queries } = makeMockPool();
    await listInflight(pool);
    expect(queries[0]!.sql).toContain("ORDER BY requested_at ASC");
  });
});

// ── listRecent ────────────────────────────────────────────────────────

describe("listRecent", () => {
  it("queries without symbol filter when symbol not provided", async () => {
    const { pool, queries } = makeMockPool();
    await listRecent(pool);
    expect(queries[0]!.sql).not.toContain("WHERE");
    expect(queries[0]!.params).toContain(20);
  });

  it("queries with symbol filter when provided", async () => {
    const { pool, queries } = makeMockPool();
    await listRecent(pool, { symbol: "AAPL" });
    expect(queries[0]!.sql).toContain("symbol = $1");
    expect(queries[0]!.params![0]).toBe("AAPL");
  });

  it("respects custom limit", async () => {
    const { pool, queries } = makeMockPool();
    await listRecent(pool, { limit: 5 });
    expect(queries[0]!.params).toContain(5);
  });

  it("filters by status when provided", async () => {
    const { pool, queries } = makeMockPool();
    await listRecent(pool, { status: "ready" });
    expect(queries[0]!.sql).toContain("status = $1");
    expect(queries[0]!.params![0]).toBe("ready");
  });

  it("combines symbol and status filters", async () => {
    const { pool, queries } = makeMockPool();
    await listRecent(pool, { symbol: "AAPL", status: "failed" });
    expect(queries[0]!.sql).toContain("symbol = $1");
    expect(queries[0]!.sql).toContain("status = $2");
    expect(queries[0]!.params![0]).toBe("AAPL");
    expect(queries[0]!.params![1]).toBe("failed");
  });

  it("uses summary projection when summary=true", async () => {
    const { pool, queries } = makeMockPool();
    await listRecent(pool, { summary: true });
    const sql = queries[0]!.sql;
    expect(sql).not.toContain("SELECT *");
    expect(sql).not.toContain("payload");
    expect(sql).not.toContain("truth_refs");
    expect(sql).toContain("digest_id");
    expect(sql).toContain("status");
  });

  it("uses SELECT * when summary not set", async () => {
    const { pool, queries } = makeMockPool();
    await listRecent(pool);
    expect(queries[0]!.sql).toContain("SELECT *");
  });
});
