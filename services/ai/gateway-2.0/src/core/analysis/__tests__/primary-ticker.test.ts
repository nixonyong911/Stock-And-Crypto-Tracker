import { describe, it, expect } from "vitest";
import {
  computeArticlePrimary,
  computeStoryPrimary,
  computeMemoryPrimary,
  trustTierOf,
  type PrimaryTickerResult,
} from "../primary-ticker.js";

// ── computeArticlePrimary ────────────────────────────────────────────

describe("computeArticlePrimary", () => {
  it("returns null/null for a GNews article (no entities signal)", () => {
    const r = computeArticlePrimary({ source_api: "gnews", entities: null });
    expect(r).toEqual({ primary_ticker: null, primary_ticker_source: null });
  });

  it("returns null/null for MarketAux with empty entities array", () => {
    const r = computeArticlePrimary({ source_api: "marketaux", entities: [] });
    expect(r).toEqual({ primary_ticker: null, primary_ticker_source: null });
  });

  it("returns null/null when entities is non-array junk", () => {
    const r = computeArticlePrimary({
      source_api: "marketaux",
      entities: "not-an-array",
    });
    expect(r).toEqual({ primary_ticker: null, primary_ticker_source: null });
  });

  it("picks the highest match_score entity (deterministic)", () => {
    const r = computeArticlePrimary({
      source_api: "marketaux",
      entities: [
        { symbol: "AAPL", match_score: 0.5 },
        { symbol: "NVDA", match_score: 0.9 },
        { symbol: "MSFT", match_score: 0.7 },
      ],
    });
    expect(r).toEqual({
      primary_ticker: "NVDA",
      primary_ticker_source: "marketaux_entities",
    });
  });

  it("breaks ties alphabetically when match_score is equal", () => {
    const r = computeArticlePrimary({
      source_api: "marketaux",
      entities: [
        { symbol: "NVDA", match_score: 0.8 },
        { symbol: "AAPL", match_score: 0.8 },
      ],
    });
    expect(r.primary_ticker).toBe("AAPL");
    expect(r.primary_ticker_source).toBe("marketaux_entities");
  });

  it("uppercases the symbol", () => {
    const r = computeArticlePrimary({
      source_api: "marketaux",
      entities: [{ symbol: "aapl", match_score: 0.9 }],
    });
    expect(r.primary_ticker).toBe("AAPL");
  });

  it("skips malformed entries (missing symbol or non-numeric match_score)", () => {
    const r = computeArticlePrimary({
      source_api: "marketaux",
      entities: [
        { symbol: "AAPL" }, // missing match_score
        { match_score: 0.9 }, // missing symbol
        { symbol: "NVDA", match_score: "bad" }, // wrong type
        { symbol: "MSFT", match_score: 0.5 }, // valid
      ],
    });
    expect(r.primary_ticker).toBe("MSFT");
    expect(r.primary_ticker_source).toBe("marketaux_entities");
  });

  it("returns null/null when all entries are malformed", () => {
    const r = computeArticlePrimary({
      source_api: "marketaux",
      entities: [{ symbol: "" }, { match_score: 1 }],
    });
    expect(r).toEqual({ primary_ticker: null, primary_ticker_source: null });
  });
});

// ── computeStoryPrimary ──────────────────────────────────────────────

const nullResult: PrimaryTickerResult = {
  primary_ticker: null,
  primary_ticker_source: null,
};
const ap = (t: string | null): PrimaryTickerResult =>
  t === null
    ? nullResult
    : { primary_ticker: t, primary_ticker_source: "marketaux_entities" };

describe("computeStoryPrimary", () => {
  it("returns null/null when all article primaries are null", () => {
    expect(computeStoryPrimary([nullResult, nullResult])).toEqual(nullResult);
  });

  it("returns null/null on empty input", () => {
    expect(computeStoryPrimary([])).toEqual(nullResult);
  });

  it("returns the majority ticker", () => {
    const r = computeStoryPrimary([ap("AAPL"), ap("AAPL"), ap("NVDA")]);
    expect(r).toEqual({
      primary_ticker: "AAPL",
      primary_ticker_source: "marketaux_entities",
    });
  });

  it("breaks ties on count alphabetically", () => {
    const r = computeStoryPrimary([ap("NVDA"), ap("AAPL")]);
    expect(r.primary_ticker).toBe("AAPL");
    expect(r.primary_ticker_source).toBe("marketaux_entities");
  });

  it("ignores null contributors when computing majority", () => {
    const r = computeStoryPrimary([nullResult, ap("NVDA"), nullResult]);
    expect(r).toEqual({
      primary_ticker: "NVDA",
      primary_ticker_source: "marketaux_entities",
    });
  });
});

// ── computeMemoryPrimary ─────────────────────────────────────────────

describe("computeMemoryPrimary", () => {
  it("returns null/null when theme tickers list is empty", () => {
    const r = computeMemoryPrimary(
      [],
      [{ affected_tickers: ["AAPL"], primary_ticker: "AAPL" }],
    );
    expect(r).toEqual(nullResult);
  });

  it("returns null/null when no story overlaps the theme", () => {
    const r = computeMemoryPrimary(
      ["AAPL"],
      [
        { affected_tickers: ["NVDA"], primary_ticker: "NVDA" },
        { affected_tickers: ["MSFT"], primary_ticker: "MSFT" },
      ],
    );
    expect(r).toEqual(nullResult);
  });

  it("returns null/null when overlapping stories all have null primary", () => {
    const r = computeMemoryPrimary(
      ["AAPL"],
      [
        { affected_tickers: ["AAPL"], primary_ticker: null },
        { affected_tickers: ["AAPL", "NVDA"], primary_ticker: null },
      ],
    );
    expect(r).toEqual(nullResult);
  });

  it("returns the majority primary across overlapping stories with batch_heuristic source", () => {
    const r = computeMemoryPrimary(
      ["AAPL"],
      [
        { affected_tickers: ["AAPL"], primary_ticker: "AAPL" },
        { affected_tickers: ["AAPL"], primary_ticker: "AAPL" },
        { affected_tickers: ["AAPL", "NVDA"], primary_ticker: "NVDA" },
      ],
    );
    expect(r).toEqual({
      primary_ticker: "AAPL",
      primary_ticker_source: "batch_heuristic",
    });
  });

  it("excludes non-overlapping stories even if their primary is non-null", () => {
    // Story 3's primary is "NVDA" but its affected_tickers don't include AAPL,
    // so it must be excluded; AAPL wins with 2 votes.
    const r = computeMemoryPrimary(
      ["AAPL"],
      [
        { affected_tickers: ["AAPL"], primary_ticker: "AAPL" },
        { affected_tickers: ["AAPL"], primary_ticker: "AAPL" },
        { affected_tickers: ["NVDA"], primary_ticker: "NVDA" },
      ],
    );
    expect(r.primary_ticker).toBe("AAPL");
    expect(r.primary_ticker_source).toBe("batch_heuristic");
  });

  it("does case-insensitive overlap", () => {
    const r = computeMemoryPrimary(
      ["aapl"],
      [{ affected_tickers: ["AAPL"], primary_ticker: "AAPL" }],
    );
    expect(r.primary_ticker).toBe("AAPL");
  });

  it("breaks ties alphabetically", () => {
    const r = computeMemoryPrimary(
      ["AAPL", "NVDA"],
      [
        { affected_tickers: ["AAPL"], primary_ticker: "NVDA" },
        { affected_tickers: ["NVDA"], primary_ticker: "AAPL" },
      ],
    );
    expect(r.primary_ticker).toBe("AAPL");
    expect(r.primary_ticker_source).toBe("batch_heuristic");
  });
});

// ── trustTierOf ──────────────────────────────────────────────────────

describe("trustTierOf", () => {
  it("maps marketaux_entities to strong", () => {
    expect(trustTierOf("marketaux_entities")).toBe("strong");
  });
  it("maps batch_heuristic to heuristic", () => {
    expect(trustTierOf("batch_heuristic")).toBe("heuristic");
  });
  it("maps null to none", () => {
    expect(trustTierOf(null)).toBe("none");
  });
});
