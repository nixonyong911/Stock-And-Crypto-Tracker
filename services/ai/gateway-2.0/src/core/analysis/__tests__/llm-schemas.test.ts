import { describe, it, expect } from "vitest";
import {
  filteredNewsEntrySchema,
  newThemeEntrySchema,
  themeUpdateEntrySchema,
  validateNewsEntries,
  validateNewThemes,
  validateThemeUpdates,
} from "../llm-schemas.js";

// ── filteredNewsEntrySchema ──────────────────────────────────────────

describe("filteredNewsEntrySchema", () => {
  const validEntry = {
    headline: "Fed Raises Rates, Markets React",
    summary: "The Federal Reserve raised rates by 25bps.",
    category: "macro",
    impact_level: "high",
    affected_sectors: ["finance", "tech"],
    affected_tickers: ["SPY", "QQQ"],
    sentiment: "bearish",
    sentiment_score: -0.6,
    key_points: ["Rate hike of 25bps", "Bond yields rose"],
    market_implications: "Higher borrowing costs",
    source_article_indices: [1, 3],
  };

  it("accepts a valid entry", () => {
    const result = filteredNewsEntrySchema.parse(validEntry);
    expect(result).not.toBeNull();
    expect(result!.headline).toBe("Fed Raises Rates, Markets React");
    expect(result!.category).toBe("macro");
    expect(result!.impact_level).toBe("high");
    expect(result!.sentiment).toBe("bearish");
    expect(result!.sentiment_score).toBe(-0.6);
    expect(result!.key_points).toEqual(["Rate hike of 25bps", "Bond yields rose"]);
    expect(result!.source_article_indices).toEqual([1, 3]);
  });

  it("returns null when headline is missing", () => {
    const result = filteredNewsEntrySchema.parse({ ...validEntry, headline: 42 });
    expect(result).toBeNull();
  });

  it("returns null when summary is missing", () => {
    const result = filteredNewsEntrySchema.parse({ ...validEntry, summary: null });
    expect(result).toBeNull();
  });

  it("returns null when key_points is empty", () => {
    const result = filteredNewsEntrySchema.parse({ ...validEntry, key_points: [] });
    expect(result).toBeNull();
  });

  it("defaults invalid category to 'market'", () => {
    const result = filteredNewsEntrySchema.parse({ ...validEntry, category: "entertainment" });
    expect(result!.category).toBe("market");
  });

  it("defaults invalid impact_level to 'medium'", () => {
    const result = filteredNewsEntrySchema.parse({ ...validEntry, impact_level: "extreme" });
    expect(result!.impact_level).toBe("medium");
  });

  it("defaults invalid sentiment to 'neutral'", () => {
    const result = filteredNewsEntrySchema.parse({ ...validEntry, sentiment: "happy" });
    expect(result!.sentiment).toBe("neutral");
  });

  it("clamps sentiment_score to [-1, 1]", () => {
    const hi = filteredNewsEntrySchema.parse({ ...validEntry, sentiment_score: 5.0 });
    expect(hi!.sentiment_score).toBe(1);
    const lo = filteredNewsEntrySchema.parse({ ...validEntry, sentiment_score: -3.0 });
    expect(lo!.sentiment_score).toBe(-1);
  });

  it("defaults sentiment_score to 0 when not a number", () => {
    const result = filteredNewsEntrySchema.parse({ ...validEntry, sentiment_score: "high" });
    expect(result!.sentiment_score).toBe(0);
  });

  it("uppercases affected_tickers", () => {
    const result = filteredNewsEntrySchema.parse({
      ...validEntry,
      affected_tickers: ["aapl", "Msft", "GOOG"],
    });
    expect(result!.affected_tickers).toEqual(["AAPL", "MSFT", "GOOG"]);
  });

  it("filters non-strings from affected_sectors", () => {
    const result = filteredNewsEntrySchema.parse({
      ...validEntry,
      affected_sectors: ["tech", 42, null, "energy"],
    });
    expect(result!.affected_sectors).toEqual(["tech", "energy"]);
  });

  it("filters non-numbers from source_article_indices", () => {
    const result = filteredNewsEntrySchema.parse({
      ...validEntry,
      source_article_indices: [1, "two", 3, null],
    });
    expect(result!.source_article_indices).toEqual([1, 3]);
  });

  it("defaults market_implications to empty string", () => {
    const result = filteredNewsEntrySchema.parse({
      ...validEntry,
      market_implications: undefined,
    });
    expect(result!.market_implications).toBe("");
  });
});

// ── newThemeEntrySchema ──────────────────────────────────────────────

describe("newThemeEntrySchema", () => {
  const validTheme = {
    theme: "Oil Price Surge",
    summary: "Oil prices rising due to supply cuts",
    key_facts: ["OPEC cuts production", "Demand rising"],
    category: "geopolitical",
    impact_level: "high",
    affected_sectors: ["energy"],
    affected_tickers: ["XOM", "OIL"],
    market_implications: "Inflation risk",
    sentiment: "bearish",
    sentiment_score: -0.5,
    news_one_liner: "Oil prices are rising due to supply disruptions.",
  };

  it("accepts a valid new theme", () => {
    const result = newThemeEntrySchema.parse(validTheme);
    expect(result).not.toBeNull();
    expect(result!.theme).toBe("Oil Price Surge");
    expect(result!.key_facts).toEqual(["OPEC cuts production", "Demand rising"]);
    expect(result!.affected_tickers).toEqual(["XOM", "OIL"]);
  });

  it("returns null when theme is missing", () => {
    const result = newThemeEntrySchema.parse({ ...validTheme, theme: 42 });
    expect(result).toBeNull();
  });

  it("returns null when summary is missing", () => {
    const result = newThemeEntrySchema.parse({ ...validTheme, summary: null });
    expect(result).toBeNull();
  });

  it("returns null when key_facts is empty", () => {
    const result = newThemeEntrySchema.parse({ ...validTheme, key_facts: [] });
    expect(result).toBeNull();
  });

  it("trims theme and summary", () => {
    const result = newThemeEntrySchema.parse({
      ...validTheme,
      theme: "  Oil Surge  ",
      summary: "  Rising  ",
    });
    expect(result!.theme).toBe("Oil Surge");
    expect(result!.summary).toBe("Rising");
  });

  it("accepts 'critical' as impact_level (memory curator extra value)", () => {
    const result = newThemeEntrySchema.parse({
      ...validTheme,
      impact_level: "critical",
    });
    expect(result!.impact_level).toBe("critical");
  });

  it("accepts 'sector' and 'earnings' as categories (memory curator extras)", () => {
    const sector = newThemeEntrySchema.parse({ ...validTheme, category: "sector" });
    expect(sector!.category).toBe("sector");
    const earnings = newThemeEntrySchema.parse({ ...validTheme, category: "earnings" });
    expect(earnings!.category).toBe("earnings");
  });

  it("defaults news_one_liner to empty string when missing", () => {
    const { news_one_liner: _, ...noLiner } = validTheme;
    const result = newThemeEntrySchema.parse(noLiner);
    expect(result!.news_one_liner).toBe("");
  });

  it("truncates news_one_liner to 200 chars", () => {
    const result = newThemeEntrySchema.parse({
      ...validTheme,
      news_one_liner: "x".repeat(300),
    });
    expect(result!.news_one_liner).toHaveLength(200);
  });

  it("uppercases affected_tickers", () => {
    const result = newThemeEntrySchema.parse({
      ...validTheme,
      affected_tickers: ["aapl", "Msft"],
    });
    expect(result!.affected_tickers).toEqual(["AAPL", "MSFT"]);
  });

  it("clamps sentiment_score to [-1, 1]", () => {
    const result = newThemeEntrySchema.parse({
      ...validTheme,
      sentiment_score: 2.5,
    });
    expect(result!.sentiment_score).toBe(1);
  });
});

// ── themeUpdateEntrySchema ───────────────────────────────────────────

describe("themeUpdateEntrySchema", () => {
  const validUpdate = {
    theme_id: "550e8400-e29b-41d4-a716-446655440001",
    updated_summary: "Fed policy reinforced by strong data",
    new_facts: ["Manufacturing index at 4-year high"],
    updated_impact: "critical",
    updated_relevance: 0.92,
    updated_sentiment: "bearish",
    updated_sentiment_score: -0.7,
    updated_one_liner: "Markets are reacting to new data.",
  };

  it("accepts a valid update", () => {
    const result = themeUpdateEntrySchema.parse(validUpdate);
    expect(result).not.toBeNull();
    expect(result!.theme_id).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(result!.updated_relevance).toBe(0.92);
  });

  it("returns null when theme_id is missing", () => {
    const result = themeUpdateEntrySchema.parse({ ...validUpdate, theme_id: null });
    expect(result).toBeNull();
  });

  it("returns null when updated_summary is missing", () => {
    const result = themeUpdateEntrySchema.parse({ ...validUpdate, updated_summary: 42 });
    expect(result).toBeNull();
  });

  it("clamps updated_relevance to [0, 1]", () => {
    const hi = themeUpdateEntrySchema.parse({ ...validUpdate, updated_relevance: 1.5 });
    expect(hi!.updated_relevance).toBe(1);
    const lo = themeUpdateEntrySchema.parse({ ...validUpdate, updated_relevance: -0.5 });
    expect(lo!.updated_relevance).toBe(0);
  });

  it("defaults updated_relevance to 0.8 when not a number", () => {
    const result = themeUpdateEntrySchema.parse({ ...validUpdate, updated_relevance: "high" });
    expect(result!.updated_relevance).toBe(0.8);
  });

  it("defaults updated_impact to 'medium' when invalid", () => {
    const result = themeUpdateEntrySchema.parse({ ...validUpdate, updated_impact: "extreme" });
    expect(result!.updated_impact).toBe("medium");
  });

  it("truncates updated_one_liner to 200 chars", () => {
    const result = themeUpdateEntrySchema.parse({
      ...validUpdate,
      updated_one_liner: "y".repeat(300),
    });
    expect(result!.updated_one_liner).toHaveLength(200);
  });

  it("sets optional sentiment fields to undefined when invalid", () => {
    const result = themeUpdateEntrySchema.parse({
      ...validUpdate,
      updated_sentiment: "happy",
      updated_sentiment_score: "not a number",
    });
    expect(result!.updated_sentiment).toBeUndefined();
    expect(result!.updated_sentiment_score).toBeUndefined();
  });
});

// ── Batch helpers ────────────────────────────────────────────────────

describe("validateNewsEntries", () => {
  it("filters invalid entries from array", () => {
    const items = [
      {
        headline: "Valid", summary: "Good", key_points: ["p"],
        category: "market", impact_level: "low", sentiment: "neutral",
        sentiment_score: 0, source_article_indices: [],
      },
      { headline: "No summary" },
      null,
      42,
    ];
    const result = validateNewsEntries(items);
    expect(result).toHaveLength(1);
    expect(result[0]!.headline).toBe("Valid");
  });
});

describe("validateNewThemes", () => {
  it("returns empty array for non-array input", () => {
    expect(validateNewThemes("not an array")).toEqual([]);
    expect(validateNewThemes(42)).toEqual([]);
    expect(validateNewThemes(null)).toEqual([]);
  });

  it("filters invalid themes", () => {
    const items = [
      {
        theme: "Valid", summary: "Good", key_facts: ["f"], category: "macro",
        impact_level: "high", sentiment: "neutral", sentiment_score: 0,
        market_implications: "", news_one_liner: "",
      },
      { theme: "No summary" },
    ];
    const result = validateNewThemes(items);
    expect(result).toHaveLength(1);
  });
});

describe("validateThemeUpdates", () => {
  it("returns empty array for non-array input", () => {
    expect(validateThemeUpdates("not an array")).toEqual([]);
  });

  it("filters invalid updates", () => {
    const items = [
      {
        theme_id: "id-1", updated_summary: "Good", updated_impact: "high",
        updated_relevance: 0.9, new_facts: ["fact"],
      },
      { updated_summary: "No ID" },
    ];
    const result = validateThemeUpdates(items);
    expect(result).toHaveLength(1);
    expect(result[0]!.theme_id).toBe("id-1");
  });
});
