import { describe, it, expect } from "vitest";
import type { Redis } from "ioredis";
import { filterDedupSignals } from "../digest-pipeline.js";
import type { TickerSignal } from "../recommendation-engine.js";

// ── Tiny NX-aware Redis stub ─────────────────────────────────────────
//
// `filterDedupSignals` only calls `redis.set(key, value, "EX", ttl, "NX")`.
// We model that one path correctly: returns "OK" when the key did not
// exist, returns null otherwise. All concurrent calls share the same
// underlying Map, so the implementation's race resistance is exercised.
class NxRedisStub {
  private readonly store = new Map<string, string>();
  // The real ioredis signature is overloaded; only the NX path is used here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async set(key: string, value: string, ..._args: any[]): Promise<"OK" | null> {
    if (this.store.has(key)) return null;
    this.store.set(key, value);
    return "OK";
  }
  size(): number {
    return this.store.size;
  }
}

function asRedis(stub: NxRedisStub): Redis {
  return stub as unknown as Redis;
}

function makeSignal(symbol: string, type: TickerSignal["type"]): TickerSignal {
  return {
    symbol,
    assetType: "stock",
    type,
    priority: "high",
    timeframeAlignment: "full",
    headline: `${symbol} signal`,
    rawData: {
      close: 100,
      daySignal: "bullish",
      swingSignal: "bullish",
      longTermSignal: "bullish",
    },
  };
}

describe("filterDedupSignals — A3 atomic dedup", () => {
  it("returns the signal exactly once across 100 concurrent dedup attempts", async () => {
    const redis = new NxRedisStub();
    const signal = makeSignal("AAPL", "news_sentiment");

    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        filterDedupSignals(asRedis(redis), [signal]),
      ),
    );

    const survivors = results.flat().length;
    expect(survivors).toBe(1);
    expect(redis.size()).toBe(1);
  });

  it("dedups distinct types separately", async () => {
    const redis = new NxRedisStub();
    const signals: TickerSignal[] = [
      makeSignal("AAPL", "entry_zone"),
      makeSignal("AAPL", "news_sentiment"),
      makeSignal("AAPL", "entry_zone"),
    ];

    const out = await filterDedupSignals(asRedis(redis), signals);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.type).sort()).toEqual(["entry_zone", "news_sentiment"]);
  });

  it("treats different symbols as independent", async () => {
    const redis = new NxRedisStub();
    const signals: TickerSignal[] = [
      makeSignal("AAPL", "entry_zone"),
      makeSignal("MSFT", "entry_zone"),
      makeSignal("AAPL", "entry_zone"),
    ];

    const out = await filterDedupSignals(asRedis(redis), signals);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.symbol).sort()).toEqual(["AAPL", "MSFT"]);
  });
});
