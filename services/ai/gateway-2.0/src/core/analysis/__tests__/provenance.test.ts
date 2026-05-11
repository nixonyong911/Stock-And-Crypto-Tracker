import { describe, it, expect, vi } from "vitest";
import {
  NEWS_PROCESSOR_PROMPT_VERSION,
  MEMORY_CURATOR_PROMPT_VERSION,
  NEWS_PROCESSOR_VALIDATOR_VERSION,
  MEMORY_CURATOR_VALIDATOR_VERSION,
  validateTickersAgainstUniverse,
} from "../provenance.js";

// ── Constants ─────────────────────────────────────────────────────────

describe("provenance constants", () => {
  it("exports expected version strings", () => {
    expect(NEWS_PROCESSOR_PROMPT_VERSION).toBe("news-processor.v1");
    expect(MEMORY_CURATOR_PROMPT_VERSION).toBe("memory-curator.v1");
    expect(NEWS_PROCESSOR_VALIDATOR_VERSION).toBe("news-processor.zod.v1");
    expect(MEMORY_CURATOR_VALIDATOR_VERSION).toBe("memory-curator.zod.v1");
  });
});

// ── validateTickersAgainstUniverse ────────────────────────────────────

function mockPool(knownSymbols: string[]) {
  return {
    query: vi.fn().mockResolvedValue({
      rows: knownSymbols.map((s) => ({ symbol: s })),
    }),
  } as never;
}

function failingPool() {
  return {
    query: vi.fn().mockRejectedValue(new Error("connection refused")),
  } as never;
}

describe("validateTickersAgainstUniverse", () => {
  it("splits tickers into known and unknown", async () => {
    const pool = mockPool(["AAPL", "BTC"]);
    const result = await validateTickersAgainstUniverse(pool, ["AAPL", "FAKE1", "BTC"]);
    expect(result.known).toEqual(["AAPL", "BTC"]);
    expect(result.unknown).toEqual(["FAKE1"]);
  });

  it("returns all known on empty input", async () => {
    const pool = mockPool([]);
    const result = await validateTickersAgainstUniverse(pool, []);
    expect(result.known).toEqual([]);
    expect(result.unknown).toEqual([]);
  });

  it("returns all as unknown when none match", async () => {
    const pool = mockPool([]);
    const result = await validateTickersAgainstUniverse(pool, ["FAKE1", "FAKE2"]);
    expect(result.known).toEqual([]);
    expect(result.unknown).toEqual(["FAKE1", "FAKE2"]);
  });

  it("returns all as known on DB failure (fail-open)", async () => {
    const pool = failingPool();
    const result = await validateTickersAgainstUniverse(pool, ["AAPL", "FAKE1"]);
    expect(result.known).toEqual(["AAPL", "FAKE1"]);
    expect(result.unknown).toEqual([]);
  });

  it("preserves ticker order", async () => {
    const pool = mockPool(["BTC", "AAPL"]);
    const result = await validateTickersAgainstUniverse(pool, ["BTC", "FAKE", "AAPL"]);
    expect(result.known).toEqual(["BTC", "AAPL"]);
    expect(result.unknown).toEqual(["FAKE"]);
  });
});
