import { describe, it, expect } from "vitest";
import {
  computeOverviewSnapshotHash,
  computeOverviewContextHash,
  projectSnapshotRefs,
  CURRENT_OVERVIEW_SCHEMA_VERSION,
  CURRENT_OVERVIEW_GENERATOR_VERSION,
  CURRENT_OVERVIEW_PROMPT_VERSION,
  CURRENT_OVERVIEW_MODEL,
  CURRENT_CODE_VERSION,
} from "../daily-overview-fingerprint.js";
import type { MarketSnapshot } from "../market-overview.js";

// ── Fixtures ──────────────────────────────────────────────────────────

function makeSnapshot(overrides?: Partial<MarketSnapshot>): MarketSnapshot {
  return {
    timestamp: new Date("2026-05-13T12:00:00Z"),
    sessionType: "pre_market",
    indices: [
      { symbol: "SPX500", name: "S&P 500", latestClose: 5200, previousClose: 5180, changePercent: 0.39 },
    ],
    commodities: [
      { symbol: "OIL", name: "Oil (WTI)", latestClose: 72.5, previousClose: 71.0, changePercent: 2.11 },
    ],
    crypto: [
      { symbol: "BTC/USD", name: "BTC", latestClose: 67000, previousClose: 66500, changePercent: 0.75 },
    ],
    dxy: { symbol: "USDOLLAR", name: "US Dollar Index", latestClose: 104.3, previousClose: 104.5, changePercent: -0.19 },
    bondYields: [
      { seriesId: "DGS10", displayName: "10Y", value: 4.34, previousValue: 4.39, changeBps: -5 },
    ],
    topNews: [
      { title: "Fed signals rate pause", source: "memory", sentiment: "neutral", category: "macro" },
    ],
    ...overrides,
  };
}

// ── Version constant well-formed tests ────────────────────────────────

describe("version constants", () => {
  it("CURRENT_OVERVIEW_SCHEMA_VERSION is a positive integer", () => {
    expect(Number.isInteger(CURRENT_OVERVIEW_SCHEMA_VERSION)).toBe(true);
    expect(CURRENT_OVERVIEW_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it("CURRENT_OVERVIEW_GENERATOR_VERSION is a non-empty string", () => {
    expect(typeof CURRENT_OVERVIEW_GENERATOR_VERSION).toBe("string");
    expect(CURRENT_OVERVIEW_GENERATOR_VERSION.length).toBeGreaterThan(0);
  });

  it("CURRENT_OVERVIEW_PROMPT_VERSION is a non-empty string", () => {
    expect(typeof CURRENT_OVERVIEW_PROMPT_VERSION).toBe("string");
    expect(CURRENT_OVERVIEW_PROMPT_VERSION.length).toBeGreaterThan(0);
  });

  it("CURRENT_OVERVIEW_MODEL is a non-empty string", () => {
    expect(typeof CURRENT_OVERVIEW_MODEL).toBe("string");
    expect(CURRENT_OVERVIEW_MODEL.length).toBeGreaterThan(0);
  });

  it("CURRENT_CODE_VERSION is a string (audit-only, not for reuse)", () => {
    expect(typeof CURRENT_CODE_VERSION).toBe("string");
    expect(CURRENT_CODE_VERSION.length).toBeGreaterThan(0);
  });
});

// ── Snapshot hash stability ───────────────────────────────────────────

describe("computeOverviewSnapshotHash", () => {
  it("returns identical hash for identical snapshots", () => {
    const a = computeOverviewSnapshotHash(makeSnapshot());
    const b = computeOverviewSnapshotHash(makeSnapshot());
    expect(a).toBe(b);
  });

  it("returns a 64-char hex string (SHA-256)", () => {
    const hash = computeOverviewSnapshotHash(makeSnapshot());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when indices change", () => {
    const a = computeOverviewSnapshotHash(makeSnapshot());
    const b = computeOverviewSnapshotHash(
      makeSnapshot({
        indices: [
          { symbol: "SPX500", name: "S&P 500", latestClose: 5300, previousClose: 5180, changePercent: 2.31 },
        ],
      }),
    );
    expect(a).not.toBe(b);
  });

  it("changes when topNews changes", () => {
    const a = computeOverviewSnapshotHash(makeSnapshot());
    const b = computeOverviewSnapshotHash(
      makeSnapshot({
        topNews: [
          { title: "Different headline", source: "memory", sentiment: "bullish", category: "market" },
        ],
      }),
    );
    expect(a).not.toBe(b);
  });

  it("is stable across re-imports (deterministic)", () => {
    const snap = makeSnapshot();
    const hash1 = computeOverviewSnapshotHash(snap);
    const hash2 = computeOverviewSnapshotHash(snap);
    const hash3 = computeOverviewSnapshotHash(snap);
    expect(hash1).toBe(hash2);
    expect(hash2).toBe(hash3);
  });
});

// ── projectSnapshotRefs ───────────────────────────────────────────────

describe("projectSnapshotRefs", () => {
  it("strips name and previousClose from indices", () => {
    const refs = projectSnapshotRefs(makeSnapshot());
    expect(refs.indices[0]).not.toHaveProperty("name");
    expect(refs.indices[0]).not.toHaveProperty("previousClose");
    expect(refs.indices[0]).toHaveProperty("symbol");
    expect(refs.indices[0]).toHaveProperty("latestClose");
    expect(refs.indices[0]).toHaveProperty("changePercent");
  });

  it("extracts topNews titles as topNewsThemeIds", () => {
    const refs = projectSnapshotRefs(makeSnapshot());
    expect(refs.topNewsThemeIds).toEqual(["Fed signals rate pause"]);
  });
});

// ── Context hash stability ────────────────────────────────────────────

describe("computeOverviewContextHash", () => {
  const baseRefs = {
    priorOverviews: [
      { date: "2026-05-12", sessionType: "post_close", narrative: "Markets fell" },
    ],
    stockTrajectory: [
      { symbol: "SPX500", date: "2026-05-12", close: 5180 },
    ],
    cryptoTrajectory: [
      { symbol: "BTC/USD", date: "2026-05-12", close: 66500 },
    ],
    memoryThemes: [
      { theme_id: "uuid-theme-1", last_updated: "2026-05-12T18:00:00Z" },
    ],
  };

  it("returns identical hash for identical context", () => {
    const a = computeOverviewContextHash(baseRefs);
    const b = computeOverviewContextHash(baseRefs);
    expect(a).toBe(b);
  });

  it("returns a 64-char hex string", () => {
    const hash = computeOverviewContextHash(baseRefs);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when a memory theme is updated", () => {
    const a = computeOverviewContextHash(baseRefs);
    const b = computeOverviewContextHash({
      ...baseRefs,
      memoryThemes: [
        { theme_id: "uuid-theme-1", last_updated: "2026-05-13T06:00:00Z" },
      ],
    });
    expect(a).not.toBe(b);
  });

  it("changes when a new prior overview appears", () => {
    const a = computeOverviewContextHash(baseRefs);
    const b = computeOverviewContextHash({
      ...baseRefs,
      priorOverviews: [
        ...baseRefs.priorOverviews,
        { date: "2026-05-13", sessionType: "pre_market", narrative: "Markets rose" },
      ],
    });
    expect(a).not.toBe(b);
  });

  it("handles empty refs gracefully", () => {
    const hash = computeOverviewContextHash({
      priorOverviews: [],
      stockTrajectory: [],
      cryptoTrajectory: [],
      memoryThemes: [],
    });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
