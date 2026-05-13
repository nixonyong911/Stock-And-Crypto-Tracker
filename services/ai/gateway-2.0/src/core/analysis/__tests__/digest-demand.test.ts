import { describe, it, expect, vi } from "vitest";
import { resolveDemandSet } from "../digest-demand.js";

function makeMockPool(rows: Array<{ ticker_symbol: string; asset_type: string }>) {
  return {
    query: vi.fn(async () => ({ rows })),
  } as never;
}

describe("resolveDemandSet", () => {
  it("returns distinct watchlist entries", async () => {
    const pool = makeMockPool([
      { ticker_symbol: "AAPL", asset_type: "stock" },
      { ticker_symbol: "BTC/USD", asset_type: "crypto" },
    ]);
    const result = await resolveDemandSet(pool);
    expect(result).toEqual([
      { symbol: "AAPL", assetType: "stock" },
      { symbol: "BTC/USD", assetType: "crypto" },
    ]);
  });

  it("filters by assetType when provided", async () => {
    const pool = makeMockPool([
      { ticker_symbol: "AAPL", asset_type: "stock" },
    ]);
    await resolveDemandSet(pool, "stock");
    const call = (pool as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0]!;
    expect(call[1]).toEqual([["stock"]]);
  });

  it("uses both stock and crypto when assetType is undefined", async () => {
    const pool = makeMockPool([]);
    await resolveDemandSet(pool);
    const call = (pool as { query: ReturnType<typeof vi.fn> }).query.mock.calls[0]!;
    expect(call[1]).toEqual([["stock", "crypto"]]);
  });

  it("returns empty array when no watchlist entries", async () => {
    const pool = makeMockPool([]);
    const result = await resolveDemandSet(pool);
    expect(result).toEqual([]);
  });
});
