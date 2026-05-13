import { describe, it, expect, vi, beforeEach } from "vitest";
import { runArtifactJob, type JobSpec, type JobResult } from "../artifact-orchestrator.js";
import type { RunContext } from "../artifact-logging.js";

// ── Helpers ───────────────────────────────────────────────────────────

const runCtx: RunContext = { runId: "test-run-id", artifactType: "smart_digest" };

function makeLog() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: "info",
  } as never;
}

function makeSpec<B = string>(
  overrides: Partial<JobSpec<{ h: string }, B>> = {},
): JobSpec<{ h: string }, B> {
  return {
    artifactType: "smart_digest",
    runCtx,
    baseLog: makeLog(),
    slotKey: { symbol: "AAPL" },
    computeHashes: vi.fn(async () => ({ h: "hash-1" })),
    tryReuse: vi.fn(async () => null),
    acquireSlot: vi.fn(async () => ({ id: 1, externalId: "uuid-1" })),
    markGenerating: vi.fn(async () => true),
    generate: vi.fn(async () => "generated-brief" as unknown as B),
    markReady: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    conflictBackoffMs: 0,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("runArtifactJob", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("reuse path", () => {
    it("returns source='reuse' when tryReuse finds an artifact", async () => {
      const spec = makeSpec({
        tryReuse: vi.fn(async () => ({ id: 42, externalId: "uuid-42", brief: "reused" })),
      });
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("reuse");
      expect(result.artifactId).toBe(42);
      expect(result.externalId).toBe("uuid-42");
      expect(result.brief).toBe("reused");
      expect(result.attempt).toBe(0);
      expect(spec.acquireSlot).not.toHaveBeenCalled();
      expect(spec.generate).not.toHaveBeenCalled();
    });
  });

  describe("fresh generation path", () => {
    it("returns source='fresh' on successful generation", async () => {
      const spec = makeSpec();
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("fresh");
      expect(result.artifactId).toBe(1);
      expect(result.externalId).toBe("uuid-1");
      expect(result.brief).toBe("generated-brief");
      expect(result.attempt).toBe(1);
      expect(spec.markGenerating).toHaveBeenCalledWith(1);
      expect(spec.markReady).toHaveBeenCalledWith(1, "generated-brief");
    });

    it("calls computeHashes then tryReuse then acquireSlot in order", async () => {
      const order: string[] = [];
      const spec = makeSpec({
        computeHashes: vi.fn(async () => { order.push("hash"); return { h: "h" }; }),
        tryReuse: vi.fn(async () => { order.push("reuse"); return null; }),
        acquireSlot: vi.fn(async () => { order.push("slot"); return { id: 1, externalId: "x" }; }),
        markGenerating: vi.fn(async () => { order.push("gen"); return true; }),
        generate: vi.fn(async () => { order.push("make"); return "brief"; }),
        markReady: vi.fn(async () => { order.push("ready"); }),
      });
      await runArtifactJob(spec);
      expect(order).toEqual(["hash", "reuse", "slot", "gen", "make", "ready"]);
    });
  });

  describe("slot conflict path", () => {
    it("returns slot_conflict_reused when re-read finds artifact", async () => {
      let calls = 0;
      const spec = makeSpec({
        acquireSlot: vi.fn(async () => null),
        tryReuse: vi.fn(async () => {
          calls++;
          if (calls === 1) return null;
          return { id: 99, externalId: "uuid-99", brief: "conflict-reused" };
        }),
      });
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("slot_conflict_reused");
      expect(result.artifactId).toBe(99);
      expect(result.brief).toBe("conflict-reused");
      expect(spec.generate).not.toHaveBeenCalled();
    });

    it("returns slot_conflict_fallback with brief when buildFallback is provided", async () => {
      const spec = makeSpec({
        acquireSlot: vi.fn(async () => null),
        buildFallback: vi.fn(async () => "fallback-brief"),
      });
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("slot_conflict_fallback");
      expect(result.brief).toBe("fallback-brief");
    });

    it("returns slot_conflict_fallback without brief when no buildFallback", async () => {
      const spec = makeSpec({
        acquireSlot: vi.fn(async () => null),
      });
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("slot_conflict_fallback");
      expect(result.brief).toBeUndefined();
    });
  });

  describe("mark_generating CAS lost", () => {
    it("re-reads and returns slot_conflict_reused on CAS failure", async () => {
      let calls = 0;
      const spec = makeSpec({
        markGenerating: vi.fn(async () => false),
        tryReuse: vi.fn(async () => {
          calls++;
          if (calls === 1) return null;
          return { id: 77, externalId: "uuid-77", brief: "cas-reused" };
        }),
      });
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("slot_conflict_reused");
      expect(result.brief).toBe("cas-reused");
    });

    it("returns slot_conflict_fallback when CAS lost and no reuse", async () => {
      const spec = makeSpec({
        markGenerating: vi.fn(async () => false),
      });
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("slot_conflict_fallback");
    });
  });

  describe("generation failure path", () => {
    it("calls markFailed and returns fallback on generation error", async () => {
      const spec = makeSpec({
        generate: vi.fn(async () => { throw new Error("boom"); }),
        buildFallback: vi.fn(async () => "fallback-on-error"),
      });
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("fallback");
      expect(result.brief).toBe("fallback-on-error");
      expect(spec.markFailed).toHaveBeenCalledWith(1, "generation_failed", expect.any(Error));
    });

    it("classifies LLM timeout errors", async () => {
      const spec = makeSpec({
        artifactType: "daily_overview",
        generate: vi.fn(async () => { throw new Error("cursor-agent timed out"); }),
      });
      await runArtifactJob(spec);

      expect(spec.markFailed).toHaveBeenCalledWith(
        1,
        "llm_timeout",
        expect.any(Error),
      );
    });

    it("returns fallback without brief when no buildFallback on error", async () => {
      const spec = makeSpec({
        generate: vi.fn(async () => { throw new Error("boom"); }),
      });
      const result = await runArtifactJob(spec);

      expect(result.source).toBe("fallback");
      expect(result.brief).toBeUndefined();
      expect(result.attempt).toBe(1);
    });
  });

  describe("timing and metadata", () => {
    it("durationMs is non-negative", async () => {
      const spec = makeSpec();
      const result = await runArtifactJob(spec);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("passes slotKey to logger via child", async () => {
      const baseLog = makeLog();
      const spec = makeSpec({ baseLog, slotKey: { symbol: "TSLA", assetType: "stock" } });
      await runArtifactJob(spec);
      expect(baseLog.child).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: "test-run-id",
          artifactType: "smart_digest",
          symbol: "TSLA",
          assetType: "stock",
        }),
      );
    });
  });
});
