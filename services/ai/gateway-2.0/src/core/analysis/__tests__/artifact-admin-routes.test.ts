import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// ── Mock the admin service ────────────────────────────────────────────

vi.mock("../artifact-admin-service.js", () => ({
  isValidKind: (v: string) => v === "smart_digest" || v === "daily_overview",
  getArtifactById: vi.fn(),
  listInflightArtifacts: vi.fn(),
  listRecentArtifacts: vi.fn(),
  explainCurrentDigest: vi.fn(),
  explainCurrentOverview: vi.fn(),
  invalidateArtifact: vi.fn(),
}));

// Mock all other heavy imports referenced in recommendations.ts
vi.mock("../recommendation-engine.js", () => ({ detectSignalsForTicker: vi.fn() }));
vi.mock("../daily-overview-broadcaster.js", () => ({ broadcastDailyOverview: vi.fn() }));
vi.mock("../digest-brief-generator.js", () => ({ generateDigestBrief: vi.fn() }));
vi.mock("../digest-brief-truth.js", () => ({ gatherTruth: vi.fn(), deriveSignals: vi.fn() }));
vi.mock("../news-processor.js", () => ({ processUnfilteredNews: vi.fn() }));
vi.mock("../memory-curator.js", () => ({ curateMarketMemory: vi.fn() }));
vi.mock("../digest-pipeline.js", () => ({ processRecommendations: vi.fn() }));
vi.mock("../digest-eligibility.js", () => ({ canReceiveSmartDigest: vi.fn() }));
vi.mock("../digest-delivery.js", () => ({ renderSmartDigestCard: vi.fn(), deliverSmartDigest: vi.fn() }));
vi.mock("../digest-debug.js", () => ({ buildDigestDebugReport: vi.fn() }));
vi.mock("../smart-digest-repository.js", () => ({ selectByDigestId: vi.fn(), listRecent: vi.fn() }));
vi.mock("../daily-overview-repository.js", () => ({ selectByOverviewId: vi.fn(), listRecentOverviews: vi.fn() }));

import * as adminService from "../artifact-admin-service.js";
import { registerRecommendationRoutes } from "../../../http/recommendations.js";

const SERVICE_KEY = "test-service-key";

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  registerRecommendationRoutes(app, {
    config: {
      internalServiceKey: SERVICE_KEY,
      apiKey: "ak",
      smartDigestBriefBlend: false,
      telegramBotToken: "",
      telegramErrorChatId: "",
    } as never,
    db: {} as never,
    redis: {} as never,
    extensions: {} as never,
  });
  return app;
}

let app: FastifyInstance;

beforeEach(() => {
  vi.resetAllMocks();
  app = buildApp();
});

afterAll(async () => {
  await app?.close();
});

const headers = { "x-service-key": SERVICE_KEY };

// ── GET /internal/artifacts/recent ────────────────────────────────────

describe("GET /internal/artifacts/recent", () => {
  it("returns 401 without service key", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/artifacts/recent" });
    expect(res.statusCode).toBe(401);
  });

  it("returns rows for smart_digest", async () => {
    vi.mocked(adminService.listRecentArtifacts).mockResolvedValue([{ id: 1 }] as never);
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/recent?kind=smart_digest&limit=5&summary=true",
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.kind).toBe("smart_digest");
    expect(body.rows).toHaveLength(1);
  });

  it("passes status filter through", async () => {
    vi.mocked(adminService.listRecentArtifacts).mockResolvedValue([]);
    await app.inject({
      method: "GET",
      url: "/internal/artifacts/recent?status=failed",
      headers,
    });
    expect(adminService.listRecentArtifacts).toHaveBeenCalledWith(
      expect.anything(),
      "smart_digest",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("rejects invalid kind", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/recent?kind=bogus",
      headers,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /internal/artifacts/inflight ──────────────────────────────────

describe("GET /internal/artifacts/inflight", () => {
  it("returns inflight rows", async () => {
    vi.mocked(adminService.listInflightArtifacts).mockResolvedValue([{ id: 2 }] as never);
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/inflight?kind=smart_digest&olderThanSec=600",
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().rows).toHaveLength(1);
    expect(adminService.listInflightArtifacts).toHaveBeenCalledWith(
      expect.anything(),
      "smart_digest",
      expect.objectContaining({ olderThanMs: 600_000 }),
    );
  });

  it("returns 401 without service key", async () => {
    const res = await app.inject({ method: "GET", url: "/internal/artifacts/inflight" });
    expect(res.statusCode).toBe(401);
  });
});

// ── GET /internal/artifacts/:kind/:id ─────────────────────────────────

describe("GET /internal/artifacts/:kind/:id", () => {
  it("returns artifact when found", async () => {
    vi.mocked(adminService.getArtifactById).mockResolvedValue({ id: 42 } as never);
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/smart_digest/42",
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.artifact.id).toBe(42);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(adminService.getArtifactById).mockResolvedValue(null);
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/smart_digest/999",
      headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for invalid kind", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/bogus/1",
      headers,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for non-integer id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/smart_digest/abc",
      headers,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET /internal/artifacts/explain-current ───────────────────────────

describe("GET /internal/artifacts/explain-current", () => {
  it("returns explain result for smart_digest", async () => {
    const fakeResult = {
      kind: "smart_digest" as const,
      inputs: {},
      current: { id: 1, artifactId: "d-1", generatedAt: "2026-05-13" },
      candidates: [],
      slotPeers: [],
    };
    vi.mocked(adminService.explainCurrentDigest).mockResolvedValue(fakeResult);
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/explain-current?kind=smart_digest&symbol=AAPL&truthHash=abc&contextHash=def&generatorVersion=1",
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().current.id).toBe(1);
  });

  it("returns 400 when required digest params missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/explain-current?kind=smart_digest&symbol=AAPL",
      headers,
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns explain result for daily_overview", async () => {
    const fakeResult = {
      kind: "daily_overview" as const,
      inputs: {},
      current: null,
      candidates: [],
      slotPeers: [],
    };
    vi.mocked(adminService.explainCurrentOverview).mockResolvedValue(fakeResult);
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/explain-current?kind=daily_overview&overviewDate=2026-05-13&snapshotHash=snap&contextHash=ctx&generatorVersion=1&modelName=claude",
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().kind).toBe("daily_overview");
  });

  it("returns 400 when required overview params missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/internal/artifacts/explain-current?kind=daily_overview&overviewDate=2026-05-13",
      headers,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── POST /internal/artifacts/:kind/:id/invalidate ─────────────────────

describe("POST /internal/artifacts/:kind/:id/invalidate", () => {
  it("returns 200 on successful invalidation", async () => {
    vi.mocked(adminService.invalidateArtifact).mockResolvedValue({
      status: "ok",
      row: { id: 1, status: "invalidated" } as never,
    });
    const res = await app.inject({
      method: "POST",
      url: "/internal/artifacts/smart_digest/1/invalidate",
      headers: { ...headers, "content-type": "application/json" },
      payload: { reason: "corrupt data" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("returns 404 when not found", async () => {
    vi.mocked(adminService.invalidateArtifact).mockResolvedValue({ status: "not_found" });
    const res = await app.inject({
      method: "POST",
      url: "/internal/artifacts/smart_digest/999/invalidate",
      headers: { ...headers, "content-type": "application/json" },
      payload: { reason: "gone" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 when artifact not in ready status", async () => {
    vi.mocked(adminService.invalidateArtifact).mockResolvedValue({ status: "not_ready" });
    const res = await app.inject({
      method: "POST",
      url: "/internal/artifacts/smart_digest/1/invalidate",
      headers: { ...headers, "content-type": "application/json" },
      payload: { reason: "try again" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("returns 400 when reason missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/artifacts/smart_digest/1/invalidate",
      headers: { ...headers, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when reason too long", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/artifacts/smart_digest/1/invalidate",
      headers: { ...headers, "content-type": "application/json" },
      payload: { reason: "x".repeat(501) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for invalid kind", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/artifacts/bogus/1/invalidate",
      headers: { ...headers, "content-type": "application/json" },
      payload: { reason: "test" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 401 without service key", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/artifacts/smart_digest/1/invalidate",
      headers: { "content-type": "application/json" },
      payload: { reason: "test" },
    });
    expect(res.statusCode).toBe(401);
  });
});
