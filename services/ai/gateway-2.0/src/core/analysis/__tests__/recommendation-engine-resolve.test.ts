import { describe, expect, it } from "vitest";
import {
  cryptoPairBase,
  newsLookupCandidateSymbols,
  resolveNewsOneLiner,
} from "../recommendation-engine.js";

describe("cryptoPairBase", () => {
  it("returns base for pair symbols", () => {
    expect(cryptoPairBase("BTC/USD")).toBe("BTC");
    expect(cryptoPairBase("eth/usd")).toBe("ETH");
  });
  it("returns null for non-pairs", () => {
    expect(cryptoPairBase("BTC")).toBeNull();
    expect(cryptoPairBase("SPX500")).toBeNull();
  });
});

describe("newsLookupCandidateSymbols", () => {
  it("includes index ETF aliases for SPX500", () => {
    const c = newsLookupCandidateSymbols("SPX500");
    expect(c).toContain("SPX500");
    expect(c).toContain("SPY");
  });
  it("includes base and pair for crypto", () => {
    const c = newsLookupCandidateSymbols("BTC/USD");
    expect(c).toContain("BTC/USD");
    expect(c).toContain("BTC");
  });
});

describe("resolveNewsOneLiner", () => {
  it("matches exact symbol", () => {
    const m = new Map([["NVDA", "Line"]]);
    expect(resolveNewsOneLiner("NVDA", m)).toBe("Line");
  });
  it("resolves BTC/USD from BTC key", () => {
    const m = new Map([["BTC", "Crypto line"]]);
    expect(resolveNewsOneLiner("BTC/USD", m)).toBe("Crypto line");
  });
  it("resolves SPX500 from SPY key", () => {
    const m = new Map([["SPY", "Index line"]]);
    expect(resolveNewsOneLiner("SPX500", m)).toBe("Index line");
  });
  it("returns undefined when no match", () => {
    expect(resolveNewsOneLiner("ZZZ", new Map())).toBeUndefined();
  });
});
