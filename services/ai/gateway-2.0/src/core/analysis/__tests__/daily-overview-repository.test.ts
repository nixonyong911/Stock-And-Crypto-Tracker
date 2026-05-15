import { describe, it, expect, vi } from "vitest";
import {
  getCurrentOverviewArtifact,
  findCurrentOverviewCandidates,
  findOverviewSlotPeers,
  acquireOverviewSlot,
  markOverviewGenerating,
  markOverviewReady,
  markOverviewFailed,
  markOverviewInvalidated,
  selectByOverviewId,
  selectOverviewById,
  listRecentOverviews,
  listInflightOverviews,
} from "../daily-overview-repository.js";

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

// ── getCurrentOverviewArtifact ────────────────────────────────────────

describe("getCurrentOverviewArtifact", () => {
  const baseParams = {
    overviewDate: "2026-05-13",
    sessionType: "pre_market",
    locale: "en",
    snapshotHash: "snap-abc",
    contextHash: "ctx-def",
    schemaVersion: 1,
    generatorVersion: "1",
    promptVersion: "overview.v1",
    modelName: "claude-4.6-sonnet-medium",
  };

  it("returns null when no matching row exists", async () => {
    const { pool } = makeMockPool();
    const result = await getCurrentOverviewArtifact({ db: pool, ...baseParams });
    expect(result).toBeNull();
  });

  it("returns the matching row when found", async () => {
    const fakeRow = { id: 1, overview_id: "uuid-1", session_type: "pre_market" };
    const { pool } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await getCurrentOverviewArtifact({ db: pool, ...baseParams });
    expect(result).toEqual(fakeRow);
  });

  it("uses model_name in WHERE clause (reuse-eligibility)", async () => {
    const { pool, queries } = makeMockPool();
    await getCurrentOverviewArtifact({ db: pool, ...baseParams });
    expect(queries).toHaveLength(1);
    const sql = queries[0]!.sql;
    expect(sql).toContain("model_name");
    expect(queries[0]!.params).toContain("claude-4.6-sonnet-medium");
  });

  it("does NOT use code_version in WHERE clause", async () => {
    const { pool, queries } = makeMockPool();
    await getCurrentOverviewArtifact({ db: pool, ...baseParams });
    const sql = queries[0]!.sql;
    expect(sql).not.toContain("code_version");
  });

  it("reuses artifact across different code_version when model_name matches", async () => {
    const fakeRow = {
      id: 1,
      overview_id: "uuid-1",
      code_version: "sha-old",
      model_name: "claude-4.6-sonnet-medium",
    };
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await getCurrentOverviewArtifact({ db: pool, ...baseParams });
    expect(result).not.toBeNull();
    expect(result!.code_version).toBe("sha-old");
    const params = queries[0]!.params!;
    expect(params).not.toContain("sha-old");
  });

  it("uses IS NOT DISTINCT FROM for prompt_version", async () => {
    const { pool, queries } = makeMockPool();
    await getCurrentOverviewArtifact({ db: pool, ...baseParams });
    const sql = queries[0]!.sql;
    expect(sql).toContain("IS NOT DISTINCT FROM");
  });

  it("uses overview_date as natural-key bound instead of rolling freshness", async () => {
    const { pool, queries } = makeMockPool();
    await getCurrentOverviewArtifact({ db: pool, ...baseParams });
    const sql = queries[0]!.sql;
    expect(sql).toContain("overview_date");
    expect(sql).not.toContain("generated_at > NOW()");
  });
});

// ── acquireOverviewSlot ───────────────────────────────────────────────

describe("acquireOverviewSlot", () => {
  const baseParams = {
    overviewDate: "2026-05-13",
    sessionType: "pre_market",
    locale: "en",
    triggerReason: "cron:pre_market",
    snapshotRefs: { indices: [] },
    snapshotHash: "snap-abc",
    contextHash: "ctx-def",
    schemaVersion: 1,
    generatorVersion: "1",
    promptVersion: "overview.v1",
    modelName: "claude-4.6-sonnet-medium",
    codeVersion: "sha-abc",
  };

  it("returns id and overview_id on success", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [{ id: 1, overview_id: "uuid-1" }], rowCount: 1 },
    });
    const result = await acquireOverviewSlot({ db: pool, ...baseParams });
    expect(result).toEqual({ id: 1, overview_id: "uuid-1" });
  });

  it("returns null on partial-unique violation (another worker owns the slot)", async () => {
    const err = new Error("uq_dov_inflight");
    const { pool } = makeMockPool({ throwOnInsert: err });
    const result = await acquireOverviewSlot({ db: pool, ...baseParams });
    expect(result).toBeNull();
  });

  it("re-throws non-conflict errors", async () => {
    const err = new Error("connection refused");
    const { pool } = makeMockPool({ throwOnInsert: err });
    await expect(
      acquireOverviewSlot({ db: pool, ...baseParams }),
    ).rejects.toThrow("connection refused");
  });

  it("records code_version for audit", async () => {
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [{ id: 1, overview_id: "uuid-1" }], rowCount: 1 },
    });
    await acquireOverviewSlot({ db: pool, ...baseParams });
    const sql = queries[0]!.sql;
    expect(sql).toContain("code_version");
    expect(queries[0]!.params).toContain("sha-abc");
  });
});

// ── markOverviewGenerating ────────────────────────────────────────────

describe("markOverviewGenerating", () => {
  it("returns true when row updated", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    const ok = await markOverviewGenerating(pool, 42);
    expect(ok).toBe(true);
  });

  it("returns false when no row matched (wrong status)", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [], rowCount: 0 },
    });
    const ok = await markOverviewGenerating(pool, 42);
    expect(ok).toBe(false);
  });

  it("includes status = pending guard", async () => {
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    await markOverviewGenerating(pool, 42);
    expect(queries[0]!.sql).toContain("status = 'pending'");
  });
});

// ── markOverviewReady ─────────────────────────────────────────────────

describe("markOverviewReady", () => {
  it("returns true when row updated", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    const ok = await markOverviewReady({
      db: pool,
      id: 42,
      synthesisSource: "llm",
      payload: { snapshot: {}, synthesis: {} },
      narrative: "Markets were up",
      topStories: ["Story 1"],
      messageBody: "*Morning Brief*\nMarkets were up",
      llmDurationMs: 5000,
    });
    expect(ok).toBe(true);
  });

  it("only transitions from pending or generating", async () => {
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    await markOverviewReady({
      db: pool,
      id: 42,
      synthesisSource: "llm",
      payload: {},
      narrative: null,
      topStories: null,
      messageBody: null,
      llmDurationMs: null,
    });
    expect(queries[0]!.sql).toContain("IN ('pending', 'generating')");
  });

  it("accepts template_fallback as synthesis source", async () => {
    const { pool, queries } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    await markOverviewReady({
      db: pool,
      id: 42,
      synthesisSource: "template_fallback",
      payload: {},
      narrative: "Template narrative",
      topStories: [],
      messageBody: null,
      llmDurationMs: null,
    });
    expect(queries[0]!.params).toContain("template_fallback");
  });
});

// ── markOverviewFailed ────────────────────────────────────────────────

describe("markOverviewFailed", () => {
  it("returns true when row updated", async () => {
    const { pool } = makeMockPool({
      queryResult: { rows: [], rowCount: 1 },
    });
    const ok = await markOverviewFailed({
      db: pool,
      id: 42,
      errorCode: "llm_timeout",
      errorMessage: "timed out after 60s",
      errorStack: "Error: timed out\n  at ...",
    });
    expect(ok).toBe(true);
  });

  it("returns false when no row matched", async () => {
    const { pool } = makeMockPool();
    const ok = await markOverviewFailed({
      db: pool,
      id: 42,
      errorCode: "unknown",
      errorMessage: "fail",
      errorStack: "",
    });
    expect(ok).toBe(false);
  });
});

// ── selectByOverviewId ────────────────────────────────────────────────

describe("selectByOverviewId", () => {
  it("returns the row when found", async () => {
    const fakeRow = { id: 1, overview_id: "uuid-1" };
    const { pool } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await selectByOverviewId(pool, "uuid-1");
    expect(result).toEqual(fakeRow);
  });

  it("returns null when not found", async () => {
    const { pool } = makeMockPool();
    const result = await selectByOverviewId(pool, "uuid-missing");
    expect(result).toBeNull();
  });
});

// ── findCurrentOverviewCandidates ─────────────────────────────────────

describe("findCurrentOverviewCandidates", () => {
  const baseParams = {
    overviewDate: "2026-05-13",
    sessionType: "pre_market",
    locale: "en",
    snapshotHash: "snap-abc",
    contextHash: "ctx-def",
    schemaVersion: 1,
    generatorVersion: "1",
    promptVersion: "overview.v1",
    modelName: "claude-4.6-sonnet-medium",
  };

  it("shares the same WHERE clause as getCurrentOverviewArtifact", async () => {
    const { pool: pool1, queries: q1 } = makeMockPool();
    const { pool: pool2, queries: q2 } = makeMockPool();
    await getCurrentOverviewArtifact({ db: pool1, ...baseParams });
    await findCurrentOverviewCandidates({ db: pool2, ...baseParams });
    const where1 = q1[0]!.sql.split("ORDER BY")[0]!.replace(/SELECT \*/, "");
    const where2 = q2[0]!.sql.split("ORDER BY")[0]!.replace(/SELECT \*/, "");
    expect(where2).toBe(where1);
  });

  it("defaults candidateLimit to 5", async () => {
    const { pool, queries } = makeMockPool();
    await findCurrentOverviewCandidates({ db: pool, ...baseParams });
    expect(queries[0]!.params![9]).toBe(5);
  });
});

// ── findOverviewSlotPeers ─────────────────────────────────────────────

describe("findOverviewSlotPeers", () => {
  it("filters by slot keys and status ready", async () => {
    const { pool, queries } = makeMockPool();
    await findOverviewSlotPeers(pool, {
      overviewDate: "2026-05-13",
      sessionType: "pre_market",
      locale: "en",
    });
    const sql = queries[0]!.sql;
    expect(sql).toContain("overview_date = $1");
    expect(sql).toContain("session_type = $2");
    expect(sql).toContain("locale = $3");
    expect(sql).toContain("status = 'ready'");
  });

  it("defaults limit to 3", async () => {
    const { pool, queries } = makeMockPool();
    await findOverviewSlotPeers(pool, {
      overviewDate: "2026-05-13",
      sessionType: "pre_market",
      locale: "en",
    });
    expect(queries[0]!.params![3]).toBe(3);
  });
});

// ── selectOverviewById ────────────────────────────────────────────────

describe("selectOverviewById", () => {
  it("returns the row when found", async () => {
    const fakeRow = { id: 42, overview_id: "uuid-1" };
    const { pool } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await selectOverviewById(pool, 42);
    expect(result).toEqual(fakeRow);
  });

  it("returns null when not found", async () => {
    const { pool } = makeMockPool();
    const result = await selectOverviewById(pool, 999);
    expect(result).toBeNull();
  });
});

// ── markOverviewInvalidated ──────────────────────────────────────────

describe("markOverviewInvalidated", () => {
  it("returns updated row when CAS succeeds", async () => {
    const fakeRow = { id: 42, status: "invalidated" };
    const { pool } = makeMockPool({
      queryResult: { rows: [fakeRow], rowCount: 1 },
    });
    const result = await markOverviewInvalidated({ db: pool, id: 42, reason: "bad data" });
    expect(result).toEqual(fakeRow);
  });

  it("returns null when row is not in ready status", async () => {
    const { pool } = makeMockPool();
    const result = await markOverviewInvalidated({ db: pool, id: 42, reason: "test" });
    expect(result).toBeNull();
  });

  it("uses CAS guard status = ready", async () => {
    const { pool, queries } = makeMockPool();
    await markOverviewInvalidated({ db: pool, id: 42, reason: "test" });
    expect(queries[0]!.sql).toContain("status = 'ready'");
    expect(queries[0]!.sql).toContain("RETURNING *");
  });
});

// ── listInflightOverviews ────────────────────────────────────────────

describe("listInflightOverviews", () => {
  it("filters by pending/generating status", async () => {
    const { pool, queries } = makeMockPool();
    await listInflightOverviews(pool);
    expect(queries[0]!.sql).toContain("IN ('pending','generating')");
  });

  it("applies olderThanMs threshold", async () => {
    const { pool, queries } = makeMockPool();
    await listInflightOverviews(pool, { olderThanMs: 600_000 });
    expect(queries[0]!.params![0]).toBe("600");
  });

  it("orders by requested_at ASC", async () => {
    const { pool, queries } = makeMockPool();
    await listInflightOverviews(pool);
    expect(queries[0]!.sql).toContain("ORDER BY requested_at ASC");
  });
});

// ── listRecentOverviews ───────────────────────────────────────────────

describe("listRecentOverviews", () => {
  it("queries without session_type filter when not provided", async () => {
    const { pool, queries } = makeMockPool();
    await listRecentOverviews(pool);
    expect(queries[0]!.sql).not.toContain("WHERE");
    expect(queries[0]!.params).toContain(20);
  });

  it("queries with session_type filter when provided", async () => {
    const { pool, queries } = makeMockPool();
    await listRecentOverviews(pool, { sessionType: "pre_market" });
    expect(queries[0]!.sql).toContain("session_type = $1");
    expect(queries[0]!.params![0]).toBe("pre_market");
  });

  it("respects custom limit", async () => {
    const { pool, queries } = makeMockPool();
    await listRecentOverviews(pool, { limit: 5 });
    expect(queries[0]!.params).toContain(5);
  });

  it("filters by status when provided", async () => {
    const { pool, queries } = makeMockPool();
    await listRecentOverviews(pool, { status: "failed" });
    expect(queries[0]!.sql).toContain("status = $1");
    expect(queries[0]!.params![0]).toBe("failed");
  });

  it("uses summary projection when summary=true", async () => {
    const { pool, queries } = makeMockPool();
    await listRecentOverviews(pool, { summary: true });
    const sql = queries[0]!.sql;
    expect(sql).not.toContain("SELECT *");
    expect(sql).not.toContain("snapshot_refs");
    expect(sql).toContain("overview_id");
    expect(sql).toContain("status");
  });

  it("uses SELECT * when summary not set", async () => {
    const { pool, queries } = makeMockPool();
    await listRecentOverviews(pool);
    expect(queries[0]!.sql).toContain("SELECT *");
  });
});
