import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pool } from "pg";

// ── Mock repos ────────────────────────────────────────────────────────

vi.mock("../smart-digest-repository.js", () => ({
  selectById: vi.fn(),
  markInvalidated: vi.fn(),
  listInflight: vi.fn(),
  listRecent: vi.fn(),
  findCurrentCandidates: vi.fn(),
  findSlotPeers: vi.fn(),
}));

vi.mock("../daily-overview-repository.js", () => ({
  selectOverviewById: vi.fn(),
  markOverviewInvalidated: vi.fn(),
  listInflightOverviews: vi.fn(),
  listRecentOverviews: vi.fn(),
  findCurrentOverviewCandidates: vi.fn(),
  findOverviewSlotPeers: vi.fn(),
}));

import * as sdRepo from "../smart-digest-repository.js";
import * as dovRepo from "../daily-overview-repository.js";
import {
  getArtifactById,
  listInflightArtifacts,
  listRecentArtifacts,
  invalidateArtifact,
  explainCurrentDigest,
  explainCurrentOverview,
  isValidKind,
} from "../artifact-admin-service.js";

const db = {} as Pool;
const log = { warn: vi.fn(), error: vi.fn() } as unknown as import("fastify").FastifyBaseLogger;

beforeEach(() => {
  vi.resetAllMocks();
});

// ── isValidKind ───────────────────────────────────────────────────────

describe("isValidKind", () => {
  it("accepts smart_digest", () => expect(isValidKind("smart_digest")).toBe(true));
  it("accepts daily_overview", () => expect(isValidKind("daily_overview")).toBe(true));
  it("rejects unknown", () => expect(isValidKind("other")).toBe(false));
});

// ── getArtifactById ───────────────────────────────────────────────────

describe("getArtifactById", () => {
  it("dispatches to smart digest repo", async () => {
    const fake = { id: 1 };
    vi.mocked(sdRepo.selectById).mockResolvedValue(fake as never);
    const result = await getArtifactById(db, "smart_digest", 1);
    expect(sdRepo.selectById).toHaveBeenCalledWith(db, 1);
    expect(result).toBe(fake);
  });

  it("dispatches to daily overview repo", async () => {
    const fake = { id: 2 };
    vi.mocked(dovRepo.selectOverviewById).mockResolvedValue(fake as never);
    const result = await getArtifactById(db, "daily_overview", 2);
    expect(dovRepo.selectOverviewById).toHaveBeenCalledWith(db, 2);
    expect(result).toBe(fake);
  });
});

// ── listInflightArtifacts ─────────────────────────────────────────────

describe("listInflightArtifacts", () => {
  it("dispatches to smart digest listInflight", async () => {
    vi.mocked(sdRepo.listInflight).mockResolvedValue([]);
    await listInflightArtifacts(db, "smart_digest", { olderThanMs: 60000 });
    expect(sdRepo.listInflight).toHaveBeenCalledWith(db, { olderThanMs: 60000 });
  });

  it("dispatches to overview listInflightOverviews", async () => {
    vi.mocked(dovRepo.listInflightOverviews).mockResolvedValue([]);
    await listInflightArtifacts(db, "daily_overview");
    expect(dovRepo.listInflightOverviews).toHaveBeenCalledWith(db, {});
  });
});

// ── listRecentArtifacts ───────────────────────────────────────────────

describe("listRecentArtifacts", () => {
  it("passes status and summary to smart digest", async () => {
    vi.mocked(sdRepo.listRecent).mockResolvedValue([]);
    await listRecentArtifacts(db, "smart_digest", {
      symbol: "AAPL",
      status: "ready",
      summary: true,
      limit: 10,
    });
    expect(sdRepo.listRecent).toHaveBeenCalledWith(db, {
      symbol: "AAPL",
      status: "ready",
      summary: true,
      limit: 10,
    });
  });

  it("passes status and summary to daily overview", async () => {
    vi.mocked(dovRepo.listRecentOverviews).mockResolvedValue([]);
    await listRecentArtifacts(db, "daily_overview", {
      sessionType: "pre_market",
      status: "failed",
      summary: true,
    });
    expect(dovRepo.listRecentOverviews).toHaveBeenCalledWith(db, {
      sessionType: "pre_market",
      status: "failed",
      summary: true,
      limit: undefined,
    });
  });
});

// ── invalidateArtifact ────────────────────────────────────────────────

describe("invalidateArtifact", () => {
  it("returns ok when CAS succeeds (smart_digest)", async () => {
    const fakeRow = { id: 1, status: "invalidated" };
    vi.mocked(sdRepo.markInvalidated).mockResolvedValue(fakeRow as never);
    const result = await invalidateArtifact({ db, log }, {
      kind: "smart_digest", id: 1, reason: "bad",
    });
    expect(result.status).toBe("ok");
    expect(result.row).toBe(fakeRow);
    expect(log.warn).toHaveBeenCalled();
  });

  it("returns not_found when row doesn't exist", async () => {
    vi.mocked(dovRepo.markOverviewInvalidated).mockResolvedValue(null);
    vi.mocked(dovRepo.selectOverviewById).mockResolvedValue(null);
    const result = await invalidateArtifact({ db, log }, {
      kind: "daily_overview", id: 999, reason: "gone",
    });
    expect(result.status).toBe("not_found");
  });

  it("returns not_ready when row exists but wrong status", async () => {
    vi.mocked(sdRepo.markInvalidated).mockResolvedValue(null);
    vi.mocked(sdRepo.selectById).mockResolvedValue({ id: 1, status: "failed" } as never);
    const result = await invalidateArtifact({ db, log }, {
      kind: "smart_digest", id: 1, reason: "test",
    });
    expect(result.status).toBe("not_ready");
  });
});

// ── explainCurrentDigest ──────────────────────────────────────────────

describe("explainCurrentDigest", () => {
  it("returns candidates and slotPeers", async () => {
    const cand = [
      { id: 1, digest_id: "d-1", generated_at: "2026-05-13T00:00:00Z" },
      { id: 2, digest_id: "d-2", generated_at: "2026-05-12T00:00:00Z" },
    ];
    const peers = [
      { id: 3, digest_id: "d-3", generated_at: "2026-05-11T00:00:00Z",
        truth_hash: "x", context_hash: "y", schema_version: 1,
        generator_version: "1", prompt_version: null },
    ];
    vi.mocked(sdRepo.findCurrentCandidates).mockResolvedValue(cand as never);
    vi.mocked(sdRepo.findSlotPeers).mockResolvedValue(peers as never);

    const result = await explainCurrentDigest(db, {
      symbol: "AAPL", assetType: "stock", briefMode: "strict",
      truthHash: "abc", contextHash: "def",
      schemaVersion: 1, generatorVersion: "1", promptVersion: null,
      maxAgeMs: 86_400_000,
    });

    expect(result.kind).toBe("smart_digest");
    expect(result.current).toEqual({ id: 1, artifactId: "d-1", generatedAt: "2026-05-13T00:00:00Z" });
    expect(result.candidates).toHaveLength(2);
    expect(result.slotPeers).toHaveLength(1);
  });

  it("returns null current when no candidates", async () => {
    vi.mocked(sdRepo.findCurrentCandidates).mockResolvedValue([]);
    vi.mocked(sdRepo.findSlotPeers).mockResolvedValue([]);

    const result = await explainCurrentDigest(db, {
      symbol: "AAPL", assetType: "stock", briefMode: "strict",
      truthHash: "abc", contextHash: "def",
      schemaVersion: 1, generatorVersion: "1", promptVersion: null,
      maxAgeMs: 86_400_000,
    });
    expect(result.current).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});

// ── explainCurrentOverview ────────────────────────────────────────────

describe("explainCurrentOverview", () => {
  it("returns candidates and slotPeers", async () => {
    const cand = [
      { id: 1, overview_id: "o-1", generated_at: "2026-05-13T00:00:00Z" },
    ];
    const peers = [
      { id: 2, overview_id: "o-2", generated_at: "2026-05-12T00:00:00Z",
        snapshot_hash: "s", context_hash: "c", schema_version: 1,
        generator_version: "1", prompt_version: "overview.v1" },
    ];
    vi.mocked(dovRepo.findCurrentOverviewCandidates).mockResolvedValue(cand as never);
    vi.mocked(dovRepo.findOverviewSlotPeers).mockResolvedValue(peers as never);

    const result = await explainCurrentOverview(db, {
      overviewDate: "2026-05-13", sessionType: "pre_market", locale: "en",
      snapshotHash: "snap", contextHash: "ctx",
      schemaVersion: 1, generatorVersion: "1", promptVersion: "overview.v1",
      modelName: "claude-4.6-sonnet-medium",
    });

    expect(result.kind).toBe("daily_overview");
    expect(result.current).toEqual({ id: 1, artifactId: "o-1", generatedAt: "2026-05-13T00:00:00Z" });
    expect(result.slotPeers).toHaveLength(1);
  });
});
