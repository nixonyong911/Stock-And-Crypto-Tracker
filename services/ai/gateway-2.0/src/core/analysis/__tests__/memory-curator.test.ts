import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseCuratorOutput,
  formatCuratorNotification,
  chunkArray,
  buildCompactThemeList,
  buildBatchCuratorPrompt,
  mergeBatchResults,
  computeCuratorLockTtlSeconds,
  applyChanges,
  type CuratorResult,
  type CuratorOutput,
  type MemoryTheme,
  type NewThemeEntry,
  type ThemeUpdateEntry,
} from "../memory-curator.js";

// ── Mock logger ──────────────────────────────────────────────────────

const noopLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  fatal: () => {},
  trace: () => {},
  child: () => noopLog,
  level: "silent",
  silent: () => {},
} as never;

// ── parseCuratorOutput ───────────────────────────────────────────────

describe("parseCuratorOutput", () => {
  it("parses valid curator JSON with all sections", () => {
    const output = JSON.stringify({
      new_themes: [
        {
          theme: "US-Iran Tensions",
          summary: "Escalating conflict in the Middle East",
          key_facts: ["Trump threatens Iran", "Oil surges"],
          category: "geopolitical",
          impact_level: "high",
          affected_sectors: ["energy", "defense"],
          affected_tickers: ["XOM", "LMT"],
          market_implications: "Oil volatility expected",
        },
      ],
      updates: [
        {
          theme_id: "550e8400-e29b-41d4-a716-446655440001",
          new_facts: ["Manufacturing index at 4-year high"],
          updated_summary: "Fed policy reinforced by strong data",
          updated_impact: "critical",
          updated_relevance: 0.92,
        },
      ],
      decay: [
        {
          theme_id: "550e8400-e29b-41d4-a716-446655440002",
          reason: "No new evidence",
        },
      ],
      reasoning: "Merged duplicate articles",
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes).toHaveLength(1);
    expect(result.new_themes[0]!.theme).toBe("US-Iran Tensions");
    expect(result.new_themes[0]!.key_facts).toEqual(["Trump threatens Iran", "Oil surges"]);
    expect(result.new_themes[0]!.affected_tickers).toEqual(["XOM", "LMT"]);

    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]!.theme_id).toBe("550e8400-e29b-41d4-a716-446655440001");
    expect(result.updates[0]!.updated_relevance).toBe(0.92);

    expect(result.decay).toHaveLength(1);
    expect(result.decay[0]!.theme_id).toBe("550e8400-e29b-41d4-a716-446655440002");

    expect(result.reasoning).toBe("Merged duplicate articles");
  });

  it("extracts JSON from markdown-wrapped output", () => {
    const output = `Here is the analysis:\n\`\`\`json\n${JSON.stringify({
      new_themes: [{
        theme: "Test", summary: "Test summary", key_facts: ["Fact"],
        category: "macro", impact_level: "medium",
        affected_sectors: [], affected_tickers: [], market_implications: "",
      }],
      updates: [],
      decay: [],
    })}\n\`\`\``;

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes).toHaveLength(1);
    expect(result.new_themes[0]!.theme).toBe("Test");
  });

  it("extracts JSON with preamble text before it", () => {
    const output = `Looking at the articles, I need to analyze them.\n${JSON.stringify({
      new_themes: [{
        theme: "With Preamble", summary: "Test", key_facts: ["Fact"],
        category: "market", impact_level: "low",
        affected_sectors: [], affected_tickers: [], market_implications: "",
      }],
      updates: [],
      decay: [],
    })}`;

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes).toHaveLength(1);
    expect(result.new_themes[0]!.theme).toBe("With Preamble");
  });

  it("returns empty result for non-JSON output", () => {
    const result = parseCuratorOutput("I cannot process this request.", noopLog);
    expect(result.new_themes).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.decay).toEqual([]);
  });

  it("returns empty result for malformed JSON", () => {
    const result = parseCuratorOutput("{invalid json here}", noopLog);
    expect(result.new_themes).toEqual([]);
  });

  // ── New theme validation ───────────────────────────────────────────

  it("skips new themes missing required fields", () => {
    const output = JSON.stringify({
      new_themes: [
        { theme: "No summary" },
        { summary: "No theme name" },
        {
          theme: "Valid Theme", summary: "Has all fields",
          key_facts: ["Fact"], category: "macro", impact_level: "high",
          affected_sectors: [], affected_tickers: [], market_implications: "",
        },
      ],
      updates: [], decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes).toHaveLength(1);
    expect(result.new_themes[0]!.theme).toBe("Valid Theme");
  });

  it("skips new themes with empty key_facts", () => {
    const output = JSON.stringify({
      new_themes: [{
        theme: "No Facts", summary: "Theme without facts",
        key_facts: [], category: "macro", impact_level: "high",
        affected_sectors: [], affected_tickers: [], market_implications: "",
      }],
      updates: [], decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes).toEqual([]);
  });

  it("defaults invalid category to 'market'", () => {
    const output = JSON.stringify({
      new_themes: [{
        theme: "Bad Category", summary: "Test",
        key_facts: ["Fact"], category: "entertainment",
        impact_level: "low", affected_sectors: [], affected_tickers: [],
        market_implications: "",
      }],
      updates: [], decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes[0]!.category).toBe("market");
  });

  it("defaults invalid impact_level to 'medium'", () => {
    const output = JSON.stringify({
      new_themes: [{
        theme: "Bad Impact", summary: "Test",
        key_facts: ["Fact"], category: "macro",
        impact_level: "extreme", affected_sectors: [], affected_tickers: [],
        market_implications: "",
      }],
      updates: [], decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes[0]!.impact_level).toBe("medium");
  });

  it("uppercases affected_tickers in new themes", () => {
    const output = JSON.stringify({
      new_themes: [{
        theme: "Ticker Case", summary: "Test",
        key_facts: ["Fact"], category: "market", impact_level: "low",
        affected_sectors: [], affected_tickers: ["aapl", "Msft", "GOOG"],
        market_implications: "",
      }],
      updates: [], decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes[0]!.affected_tickers).toEqual(["AAPL", "MSFT", "GOOG"]);
  });

  it("extracts news_one_liner from new themes", () => {
    const output = JSON.stringify({
      new_themes: [{
        theme: "Oil Surge", summary: "Oil prices rising",
        key_facts: ["Fact"], category: "market", impact_level: "high",
        affected_sectors: ["energy"], affected_tickers: ["XOM"],
        market_implications: "", news_one_liner: "Oil prices are rising due to supply disruptions.",
      }],
      updates: [], decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes[0]!.news_one_liner).toBe("Oil prices are rising due to supply disruptions.");
  });

  it("defaults news_one_liner to empty string when missing", () => {
    const output = JSON.stringify({
      new_themes: [{
        theme: "No Liner", summary: "Test",
        key_facts: ["Fact"], category: "macro", impact_level: "low",
        affected_sectors: [], affected_tickers: [], market_implications: "",
      }],
      updates: [], decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes[0]!.news_one_liner).toBe("");
  });

  // ── Update validation ──────────────────────────────────────────────

  it("skips updates missing theme_id", () => {
    const output = JSON.stringify({
      new_themes: [],
      updates: [
        { updated_summary: "No ID", updated_impact: "high", updated_relevance: 0.9 },
        {
          theme_id: "valid-id", updated_summary: "Has ID",
          updated_impact: "high", updated_relevance: 0.9, new_facts: [],
        },
      ],
      decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]!.theme_id).toBe("valid-id");
  });

  it("clamps updated_relevance to [0, 1]", () => {
    const output = JSON.stringify({
      new_themes: [],
      updates: [{
        theme_id: "test-id", updated_summary: "Test",
        updated_impact: "high", updated_relevance: 1.5, new_facts: [],
      }],
      decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.updates[0]!.updated_relevance).toBe(1);
  });

  it("defaults updated_relevance to 0.8 when missing", () => {
    const output = JSON.stringify({
      new_themes: [],
      updates: [{
        theme_id: "test-id", updated_summary: "Test",
        updated_impact: "high", new_facts: [],
      }],
      decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.updates[0]!.updated_relevance).toBe(0.8);
  });

  it("extracts updated_one_liner from updates", () => {
    const output = JSON.stringify({
      new_themes: [],
      updates: [{
        theme_id: "test-id", updated_summary: "Updated summary",
        updated_impact: "high", updated_relevance: 0.9, new_facts: ["new fact"],
        updated_one_liner: "Markets are reacting to new trade policy changes.",
      }],
      decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.updates[0]!.updated_one_liner).toBe("Markets are reacting to new trade policy changes.");
  });

  // ── Decay validation ───────────────────────────────────────────────

  it("skips decay entries missing theme_id", () => {
    const output = JSON.stringify({
      new_themes: [], updates: [],
      decay: [
        { reason: "No ID" },
        { theme_id: "valid-id", reason: "Has ID" },
      ],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.decay).toHaveLength(1);
    expect(result.decay[0]!.theme_id).toBe("valid-id");
  });

  it("defaults decay reason when missing", () => {
    const output = JSON.stringify({
      new_themes: [], updates: [],
      decay: [{ theme_id: "test-id" }],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.decay[0]!.reason).toBe("No new evidence");
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  it("handles empty sections gracefully", () => {
    const output = JSON.stringify({
      new_themes: [], updates: [], decay: [],
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.decay).toEqual([]);
  });

  it("handles missing sections as empty arrays", () => {
    const output = JSON.stringify({});

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.decay).toEqual([]);
  });

  it("handles non-array sections gracefully", () => {
    const output = JSON.stringify({
      new_themes: "not an array",
      updates: 42,
      decay: null,
    });

    const result = parseCuratorOutput(output, noopLog);
    expect(result.new_themes).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.decay).toEqual([]);
  });
});

// ── formatCuratorNotification ────────────────────────────────────────

describe("formatCuratorNotification", () => {
  it("formats successful curator result with all counts", () => {
    const result: CuratorResult = {
      newThemes: 3,
      updatedThemes: 5,
      decayedThemes: 1,
      archivedThemes: 2,
      activeThemes: 42,
      processingTimeMs: 57000,
    };

    const msg = formatCuratorNotification(result);
    expect(msg).toContain("Memory Curator:");
    expect(msg).toContain("+3 new");
    expect(msg).toContain("~5 updated");
    expect(msg).toContain("↓1 decayed");
    expect(msg).toContain("-2 archived");
    expect(msg).toContain("42 active");
    expect(msg).toContain("57.0s");
  });

  it("omits zero counts from notification", () => {
    const result: CuratorResult = {
      newThemes: 2,
      updatedThemes: 0,
      decayedThemes: 0,
      archivedThemes: 0,
      activeThemes: 10,
      processingTimeMs: 5000,
    };

    const msg = formatCuratorNotification(result);
    expect(msg).toContain("+2 new");
    expect(msg).toContain("10 active");
    expect(msg).not.toContain("updated");
    expect(msg).not.toContain("decayed");
    expect(msg).not.toContain("archived");
  });

  it("formats error result", () => {
    const result: CuratorResult = {
      newThemes: 0,
      updatedThemes: 0,
      decayedThemes: 0,
      archivedThemes: 0,
      activeThemes: 0,
      processingTimeMs: 1500,
      error: "Curator LLM call timed out",
    };

    const msg = formatCuratorNotification(result);
    expect(msg).toContain("FAILED");
    expect(msg).toContain("Curator LLM call timed out");
  });

  it("escapes HTML in error messages", () => {
    const result: CuratorResult = {
      newThemes: 0, updatedThemes: 0, decayedThemes: 0,
      archivedThemes: 0, activeThemes: 0, processingTimeMs: 100,
      error: "Error <script>alert('xss')</script>",
    };

    const msg = formatCuratorNotification(result);
    expect(msg).not.toContain("<script>");
    expect(msg).toContain("&lt;script&gt;");
  });

  it("truncates long errors to telegramErrorMaxChars", () => {
    const longErr = "x".repeat(5000);
    const result: CuratorResult = {
      newThemes: 0, updatedThemes: 0, decayedThemes: 0,
      archivedThemes: 0, activeThemes: 0, processingTimeMs: 100,
      error: longErr,
    };

    const msg = formatCuratorNotification(result, { telegramErrorMaxChars: 400 });
    const body = msg.split("\n")[1] ?? "";
    expect(body.length).toBeLessThanOrEqual(400);
    expect(body).toContain("xxx");
  });
});

describe("computeCuratorLockTtlSeconds", () => {
  it("uses per-batch timeout for lock TTL math", () => {
    const high = computeCuratorLockTtlSeconds(2, false, 800_000);
    const low = computeCuratorLockTtlSeconds(2, false, 200_000);
    expect(high).toBeGreaterThan(low);
  });

  it("extends TTL for sequential multi-batch runs", () => {
    const parallel = computeCuratorLockTtlSeconds(3, false);
    const sequential = computeCuratorLockTtlSeconds(3, true);
    expect(sequential).toBeGreaterThan(parallel);
    expect(sequential).toBeLessThanOrEqual(3600);
    expect(parallel).toBeGreaterThanOrEqual(900);
  });
});

// ── Test helpers ─────────────────────────────────────────────────────

function makeTheme(overrides: Partial<MemoryTheme> = {}): MemoryTheme {
  return {
    theme_id: "550e8400-e29b-41d4-a716-446655440001",
    theme: "Fed Rate Policy",
    status: "active",
    summary: "Federal Reserve maintaining hawkish stance",
    key_facts: ["CPI elevated", "Strong jobs data"],
    category: "macro",
    impact_level: "high",
    relevance_score: 0.9,
    affected_sectors: ["financials"],
    affected_tickers: ["SPY"],
    market_implications: "Higher for longer rates",
    first_observed: "2026-03-01T00:00:00Z",
    last_updated: "2026-03-28T00:00:00Z",
    update_count: 5,
    ...overrides,
  };
}

function makeStory(overrides: Partial<{ headline: string; summary: string; category: string; impact_level: string; sentiment: string; sentiment_score: number; key_points: string[]; affected_tickers: string[]; affected_sectors: string[]; market_implications: string; batch_id: string; primary_ticker: string | null }> = {}) {
  return {
    headline: "Fed signals patience on rate cuts",
    summary: "Federal Reserve officials...",
    category: "macro",
    impact_level: "high",
    sentiment: "bearish",
    sentiment_score: -0.3,
    key_points: ["Fed holds rates"],
    affected_tickers: ["SPY"],
    affected_sectors: ["financials"],
    market_implications: "Rates stay elevated",
    batch_id: "batch-001",
    primary_ticker: null,
    ...overrides,
  };
}

// ── chunkArray ───────────────────────────────────────────────────────

describe("chunkArray", () => {
  it("splits array into chunks of specified size", () => {
    const result = chunkArray([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns single chunk when array is smaller than size", () => {
    const result = chunkArray([1, 2, 3], 10);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it("returns single chunk when array length equals size", () => {
    const result = chunkArray([1, 2, 3], 3);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it("handles empty array", () => {
    const result = chunkArray([], 5);
    expect(result).toEqual([]);
  });

  it("handles size of 1", () => {
    const result = chunkArray(["a", "b", "c"], 1);
    expect(result).toEqual([["a"], ["b"], ["c"]]);
  });

  it("handles size < 1 by returning the whole array as one chunk", () => {
    const result = chunkArray([1, 2, 3], 0);
    expect(result).toEqual([[1, 2, 3]]);
  });

  it("preserves object references in chunks", () => {
    const obj = { x: 1 };
    const result = chunkArray([obj], 5);
    expect(result[0]![0]).toBe(obj);
  });
});

// ── buildCompactThemeList ────────────────────────────────────────────

describe("buildCompactThemeList", () => {
  it("includes only compact fields", () => {
    const themes = [makeTheme()];
    const result = buildCompactThemeList(themes);

    expect(result).toHaveLength(1);
    const compact = result[0]!;
    expect(compact).toHaveProperty("theme_id");
    expect(compact).toHaveProperty("theme");
    expect(compact).toHaveProperty("category");
    expect(compact).toHaveProperty("impact_level");
    expect(compact).toHaveProperty("summary");
    expect(compact).toHaveProperty("affected_tickers");
    expect(compact).toHaveProperty("relevance_score");
    expect(compact).toHaveProperty("update_count");
  });

  it("excludes verbose fields", () => {
    const themes = [makeTheme()];
    const result = buildCompactThemeList(themes);
    const compact = result[0]!;

    expect(compact).not.toHaveProperty("key_facts");
    expect(compact).not.toHaveProperty("market_implications");
    expect(compact).not.toHaveProperty("affected_sectors");
    expect(compact).not.toHaveProperty("first_observed");
    expect(compact).not.toHaveProperty("last_updated");
    expect(compact).not.toHaveProperty("status");
  });

  it("handles empty themes array", () => {
    expect(buildCompactThemeList([])).toEqual([]);
  });

  it("preserves values correctly", () => {
    const theme = makeTheme({ relevance_score: 0.75, update_count: 12 });
    const result = buildCompactThemeList([theme]);
    expect(result[0]!["relevance_score"]).toBe(0.75);
    expect(result[0]!["update_count"]).toBe(12);
  });
});

// ── buildBatchCuratorPrompt ──────────────────────────────────────────

describe("buildBatchCuratorPrompt", () => {
  it("contains batch awareness instructions", () => {
    const prompt = buildBatchCuratorPrompt([makeTheme()], [makeStory()]);
    expect(prompt).toContain("BATCH of articles");
    expect(prompt).toContain("this batch");
  });

  it("does not ask for decay section", () => {
    const prompt = buildBatchCuratorPrompt([makeTheme()], [makeStory()]);
    expect(prompt).toContain("Do NOT include a \"decay\" section");
    expect(prompt).not.toMatch(/3\.\s*"decay"/);
  });

  it("uses compact theme format (no key_facts in theme data section)", () => {
    const theme = makeTheme({ key_facts: ["fact1", "fact2", "fact3"] });
    const prompt = buildBatchCuratorPrompt([theme], [makeStory()]);
    const themesSection = prompt.split("## New Processed Articles")[0]!;
    expect(themesSection).not.toContain("fact1");
    expect(themesSection).not.toContain("fact2");
    expect(themesSection).not.toContain("market_implications");
    expect(themesSection).toContain('"theme_id"');
    expect(themesSection).toContain('"summary"');
  });

  it("includes story details", () => {
    const story = makeStory({ headline: "Breaking: Oil surges 5%" });
    const prompt = buildBatchCuratorPrompt([makeTheme()], [story]);
    expect(prompt).toContain("Breaking: Oil surges 5%");
    expect(prompt).toContain('"headline"');
    expect(prompt).toContain('"key_points"');
  });

  it("handles empty themes", () => {
    const prompt = buildBatchCuratorPrompt([], [makeStory()]);
    expect(prompt).toContain("[]");
    expect(prompt).toContain("BATCH");
  });

  it("handles empty stories", () => {
    const prompt = buildBatchCuratorPrompt([makeTheme()], []);
    expect(prompt).toContain("[]");
  });

  // ── Slice 2 invariant: primary_ticker is a DETERMINISTIC upstream signal,
  // not LLM bookkeeping. It MUST NOT appear in the curator prompt, or we
  // would be teaching the LLM to emit / reason about it on the next slice.
  it("does NOT include primary_ticker in the storiesJson sent to the LLM", () => {
    const story = makeStory({
      affected_tickers: ["AAPL"],
      primary_ticker: "AAPL",
    });
    const prompt = buildBatchCuratorPrompt([makeTheme()], [story]);
    const storiesSection = prompt.split("## New Processed Articles")[1] ?? "";
    expect(storiesSection).not.toContain("primary_ticker");
  });
});

// ── mergeBatchResults ────────────────────────────────────────────────

describe("mergeBatchResults", () => {
  const themeA = makeTheme({
    theme_id: "aaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    theme: "Theme A",
  });
  const themeB = makeTheme({
    theme_id: "bbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    theme: "Theme B",
  });
  const themeC = makeTheme({
    theme_id: "cccc-cccc-cccc-cccc-cccccccccccc",
    theme: "Theme C",
  });

  it("merges new themes from multiple batches", () => {
    const batch1: CuratorOutput = {
      new_themes: [{
        theme: "New Theme 1", summary: "Summary 1", key_facts: ["f1"],
        category: "macro", impact_level: "high",
        affected_sectors: [], affected_tickers: [], market_implications: "",
        sentiment: "neutral", sentiment_score: 0, news_one_liner: "",
      }],
      updates: [], decay: [],
    };
    const batch2: CuratorOutput = {
      new_themes: [{
        theme: "New Theme 2", summary: "Summary 2", key_facts: ["f2"],
        category: "policy", impact_level: "medium",
        affected_sectors: [], affected_tickers: [], market_implications: "",
        sentiment: "bullish", sentiment_score: 0.5, news_one_liner: "",
      }],
      updates: [], decay: [],
    };

    const merged = mergeBatchResults([batch1, batch2], [themeA], noopLog);
    expect(merged.new_themes).toHaveLength(2);
    expect(merged.new_themes.map((t) => t.theme)).toEqual(["New Theme 1", "New Theme 2"]);
  });

  it("deduplicates new themes by case-insensitive name", () => {
    const entry: NewThemeEntry = {
      theme: "Oil Price Surge", summary: "Oil prices...", key_facts: ["fact"],
      category: "market", impact_level: "high",
      affected_sectors: ["energy"], affected_tickers: ["XOM"],
      market_implications: "Inflation risk", sentiment: "bearish", sentiment_score: -0.5,
      news_one_liner: "",
    };

    const batch1: CuratorOutput = { new_themes: [entry], updates: [], decay: [] };
    const batch2: CuratorOutput = {
      new_themes: [{ ...entry, theme: "oil price surge", summary: "Different summary" }],
      updates: [], decay: [],
    };

    const merged = mergeBatchResults([batch1, batch2], [], noopLog);
    expect(merged.new_themes).toHaveLength(1);
    expect(merged.new_themes[0]!.summary).toBe("Oil prices...");
  });

  it("merges updates for the same theme across batches", () => {
    const batch1: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["Fact from batch 1"],
        updated_summary: "Summary v1", updated_impact: "high",
        updated_relevance: 0.85,
      }],
      decay: [],
    };
    const batch2: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["Fact from batch 2"],
        updated_summary: "Summary v2", updated_impact: "critical",
        updated_relevance: 0.92,
      }],
      decay: [],
    };

    const merged = mergeBatchResults([batch1, batch2], [themeA, themeB], noopLog);

    expect(merged.updates).toHaveLength(1);
    const update = merged.updates[0]!;
    expect(update.theme_id).toBe(themeA.theme_id);
    expect(update.new_facts).toEqual(["Fact from batch 1", "Fact from batch 2"]);
    expect(update.updated_summary).toBe("Summary v2");
    expect(update.updated_relevance).toBe(0.92);
  });

  it("takes max relevance when merging updates", () => {
    const batch1: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: [],
        updated_summary: "s1", updated_impact: "high", updated_relevance: 0.95,
      }],
      decay: [],
    };
    const batch2: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: [],
        updated_summary: "s2", updated_impact: "medium", updated_relevance: 0.80,
      }],
      decay: [],
    };

    const merged = mergeBatchResults([batch1, batch2], [themeA], noopLog);
    expect(merged.updates[0]!.updated_relevance).toBe(0.95);
  });

  it("keeps updates for different themes separate", () => {
    const batch1: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["A fact"],
        updated_summary: "A summary", updated_impact: "high", updated_relevance: 0.9,
      }],
      decay: [],
    };
    const batch2: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeB.theme_id, new_facts: ["B fact"],
        updated_summary: "B summary", updated_impact: "medium", updated_relevance: 0.7,
      }],
      decay: [],
    };

    const merged = mergeBatchResults([batch1, batch2], [themeA, themeB, themeC], noopLog);
    expect(merged.updates).toHaveLength(2);
    const ids = merged.updates.map((u) => u.theme_id);
    expect(ids).toContain(themeA.theme_id);
    expect(ids).toContain(themeB.theme_id);
  });

  it("computes decay for themes not updated by any batch", () => {
    const batch1: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["fact"],
        updated_summary: "summary", updated_impact: "high", updated_relevance: 0.9,
      }],
      decay: [],
    };

    const merged = mergeBatchResults([batch1], [themeA, themeB, themeC], noopLog);

    const decayIds = merged.decay.map((d) => d.theme_id);
    expect(decayIds).not.toContain(themeA.theme_id);
    expect(decayIds).toContain(themeB.theme_id);
    expect(decayIds).toContain(themeC.theme_id);
    expect(merged.decay).toHaveLength(2);
  });

  it("excludes updated themes from decay even if only one batch updates them", () => {
    const batch1: CuratorOutput = { new_themes: [], updates: [], decay: [] };
    const batch2: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeB.theme_id, new_facts: ["late batch fact"],
        updated_summary: "new summary", updated_impact: "high", updated_relevance: 0.8,
      }],
      decay: [],
    };

    const merged = mergeBatchResults([batch1, batch2], [themeA, themeB], noopLog);
    const decayIds = merged.decay.map((d) => d.theme_id);
    expect(decayIds).toContain(themeA.theme_id);
    expect(decayIds).not.toContain(themeB.theme_id);
  });

  it("marks all themes for decay when no batches have updates", () => {
    const batch1: CuratorOutput = { new_themes: [], updates: [], decay: [] };

    const merged = mergeBatchResults([batch1], [themeA, themeB], noopLog);
    expect(merged.decay).toHaveLength(2);
  });

  it("produces empty decay when all themes are updated", () => {
    const batch1: CuratorOutput = {
      new_themes: [],
      updates: [
        { theme_id: themeA.theme_id, new_facts: ["f"], updated_summary: "s", updated_impact: "high", updated_relevance: 0.9 },
        { theme_id: themeB.theme_id, new_facts: ["f"], updated_summary: "s", updated_impact: "low", updated_relevance: 0.5 },
      ],
      decay: [],
    };

    const merged = mergeBatchResults([batch1], [themeA, themeB], noopLog);
    expect(merged.decay).toHaveLength(0);
  });

  it("handles single batch as pass-through with computed decay", () => {
    const entry: NewThemeEntry = {
      theme: "Single Batch Theme", summary: "summary", key_facts: ["f"],
      category: "macro", impact_level: "high",
      affected_sectors: [], affected_tickers: [],
      market_implications: "", sentiment: "neutral", sentiment_score: 0,
      news_one_liner: "",
    };
    const singleBatch: CuratorOutput = {
      new_themes: [entry],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["new"],
        updated_summary: "updated", updated_impact: "high", updated_relevance: 0.85,
      }],
      decay: [],
    };

    const merged = mergeBatchResults([singleBatch], [themeA, themeB], noopLog);
    expect(merged.new_themes).toHaveLength(1);
    expect(merged.updates).toHaveLength(1);
    expect(merged.decay).toHaveLength(1);
    expect(merged.decay[0]!.theme_id).toBe(themeB.theme_id);
  });

  it("handles empty results array gracefully", () => {
    const merged = mergeBatchResults([], [themeA], noopLog);
    expect(merged.new_themes).toEqual([]);
    expect(merged.updates).toEqual([]);
    expect(merged.decay).toHaveLength(1);
  });

  it("preserves sentiment fields when merging updates", () => {
    const batch1: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["f1"],
        updated_summary: "s1", updated_impact: "high", updated_relevance: 0.8,
        updated_sentiment: "bearish", updated_sentiment_score: -0.7,
      }],
      decay: [],
    };
    const batch2: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["f2"],
        updated_summary: "s2", updated_impact: "high", updated_relevance: 0.85,
        updated_sentiment: "neutral", updated_sentiment_score: 0.1,
      }],
      decay: [],
    };

    const merged = mergeBatchResults([batch1, batch2], [themeA], noopLog);
    expect(merged.updates[0]!.updated_sentiment).toBe("neutral");
    expect(merged.updates[0]!.updated_sentiment_score).toBe(0.1);
  });

  it("preserves updated_one_liner when merging updates", () => {
    const batch1: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["f1"],
        updated_summary: "s1", updated_impact: "high", updated_relevance: 0.8,
        updated_one_liner: "First liner.",
      }],
      decay: [],
    };
    const batch2: CuratorOutput = {
      new_themes: [],
      updates: [{
        theme_id: themeA.theme_id, new_facts: ["f2"],
        updated_summary: "s2", updated_impact: "high", updated_relevance: 0.85,
        updated_one_liner: "Updated liner from batch 2.",
      }],
      decay: [],
    };

    const merged = mergeBatchResults([batch1, batch2], [themeA], noopLog);
    expect(merged.updates[0]!.updated_one_liner).toBe("Updated liner from batch 2.");
  });

  it("does not mutate input batch results", () => {
    const update: ThemeUpdateEntry = {
      theme_id: themeA.theme_id, new_facts: ["original"],
      updated_summary: "orig", updated_impact: "high", updated_relevance: 0.8,
    };
    const batch: CuratorOutput = { new_themes: [], updates: [update], decay: [] };

    mergeBatchResults([batch], [themeA], noopLog);
    expect(update.new_facts).toEqual(["original"]);
  });
});

// ── applyChanges: Slice 2 primary_ticker integration ─────────────────
//
// applyChanges runs INSERT/UPDATE/decay against a real client. To test
// without a DB we mock a pg-like client and assert the params passed to
// each query. The mock distinguishes the INSERT vs UPDATE statements by
// SQL text so we can introspect each independently.

interface CapturedQuery {
  sql: string;
  params?: unknown[];
}

function makeMockPool(): {
  pool: never;
  queries: CapturedQuery[];
} {
  const queries: CapturedQuery[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queries.push({ sql, params });
      // Mimic real return shapes for the two SELECT-like paths used during
      // applyChanges (UPDATE ... RETURNING id, and decay SELECT).
      if (typeof sql === "string" && sql.includes("RETURNING id")) {
        return { rowCount: 1, rows: [{ id: 1 }] };
      }
      if (typeof sql === "string" && sql.includes("SELECT last_updated")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    }),
    release: vi.fn(() => {}),
  };
  const pool = {
    connect: vi.fn(async () => client),
  } as never;
  return { pool, queries };
}

function makeNewTheme(overrides: Partial<NewThemeEntry> = {}): NewThemeEntry {
  return {
    theme: "Test Theme",
    summary: "Test summary",
    key_facts: ["fact1"],
    category: "market",
    impact_level: "medium",
    affected_sectors: ["tech"],
    affected_tickers: ["AAPL"],
    market_implications: "",
    sentiment: "neutral",
    sentiment_score: 0,
    news_one_liner: "Apple ships.",
    ...overrides,
  };
}

function findInsertParams(queries: CapturedQuery[]): unknown[] | undefined {
  const q = queries.find(
    (q) => typeof q.sql === "string" && q.sql.includes("INSERT INTO analysis_market_memory"),
  );
  return q?.params;
}

function findUpdateSql(queries: CapturedQuery[]): string | undefined {
  return queries.find(
    (q) =>
      typeof q.sql === "string" &&
      q.sql.startsWith("UPDATE analysis_market_memory") &&
      q.sql.includes("model_name"),
  )?.sql;
}

describe("applyChanges Slice 2 primary_ticker", () => {
  const provenance = {
    modelName: "test-model",
    generatedAt: "2026-04-01T00:00:00Z",
    unknownTickerSet: new Set<string>(),
  };

  it("populates primary_ticker via batch_heuristic when overlapping stories carry a primary", async () => {
    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["AAPL"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    const batchStories = [
      makeStory({ affected_tickers: ["AAPL"], primary_ticker: "AAPL" }),
      makeStory({ affected_tickers: ["AAPL"], primary_ticker: "AAPL" }),
      makeStory({ affected_tickers: ["NVDA"], primary_ticker: "NVDA" }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    // INSERT order: ..., tickersUnknown ($20), primary_ticker ($21), primary_ticker_source ($22), tickers_inferred ($23)
    expect(params![20]).toBe("AAPL");
    expect(params![21]).toBe("batch_heuristic");
  });

  it("yields NULL primary_ticker when no overlapping story has a primary", async () => {
    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["AAPL"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    const batchStories = [
      makeStory({ affected_tickers: ["AAPL"], primary_ticker: null }),
      makeStory({ affected_tickers: ["NVDA"], primary_ticker: "NVDA" }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    expect(params![20]).toBeNull();
    expect(params![21]).toBeNull();
  });

  it("does NOT mutate primary_ticker on the UPDATE path (anchor invariance)", async () => {
    const { pool, queries } = makeMockPool();
    const update: ThemeUpdateEntry = {
      theme_id: "550e8400-e29b-41d4-a716-446655440000",
      new_facts: ["new fact"],
      updated_summary: "updated",
      updated_impact: "high",
      updated_relevance: 0.9,
    };
    const output: CuratorOutput = { new_themes: [], updates: [update], decay: [] };

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, []);

    const updateSql = findUpdateSql(queries);
    expect(updateSql).toBeDefined();
    expect(updateSql).not.toContain("primary_ticker");
  });
});

// ── buildBatchCuratorPrompt: Slice 8B prompt revision ─────────────────

describe("buildBatchCuratorPrompt Slice 8B prompt revision", () => {
  it("does NOT contain the old 'include at least one major index' instruction", () => {
    const prompt = buildBatchCuratorPrompt([makeTheme()], [makeStory()]);
    expect(prompt).not.toContain("include at least one major index");
  });

  it("contains the new SUBJECT-only scope instruction", () => {
    const prompt = buildBatchCuratorPrompt([makeTheme()], [makeStory()]);
    expect(prompt).toContain("only the tickers that are the SUBJECT");
  });

  it("lists broad index proxies to avoid in the prompt", () => {
    const prompt = buildBatchCuratorPrompt([makeTheme()], [makeStory()]);
    expect(prompt).toContain("SPX500, NSDQ100, DJ30, SPY, QQQ, DIA, IWM, VTI, VOO");
  });

  it("lists macro proxies to avoid in the prompt", () => {
    const prompt = buildBatchCuratorPrompt([makeTheme()], [makeStory()]);
    expect(prompt).toContain("GOLD, OIL, NATGAS, BTC, BTC/USD, ETH, ETH/USD");
  });
});

// ── applyChanges: Slice 8C primary-ticker coherence guard ─────────────

describe("applyChanges Slice 8C primary-ticker coherence guard", () => {
  const provenance = {
    modelName: "test-model",
    generatedAt: "2026-04-01T00:00:00Z",
    unknownTickerSet: new Set<string>(),
  };

  afterEach(() => {
    delete process.env["MEMORY_CURATOR_SANITIZE_BROAD_TICKERS"];
    delete process.env["MEMORY_CURATOR_BROAD_TICKER_TIER"];
  });

  it("nulls primary_ticker when sanitizer drops unevidenced broad primary from kept", async () => {
    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["SPX500", "NVDA"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    // Story overlaps via NVDA only — SPX500 is unevidenced broad → inferred.
    // computeMemoryPrimary runs on RAW [SPX500, NVDA] and majority-vote picks
    // SPX500 (2 stories say SPX500).
    const batchStories = [
      makeStory({ affected_tickers: ["NVDA"], primary_ticker: "SPX500" }),
      makeStory({ affected_tickers: ["NVDA", "AMD"], primary_ticker: "SPX500" }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    // $8 (index 7) = affected_tickers → ["NVDA"] (SPX500 moved to inferred)
    expect(params![7]).toEqual(["NVDA"]);
    // $23 (index 22) = tickers_inferred → ["SPX500"]
    expect(params![22]).toEqual(["SPX500"]);
    // Slice 8C: primary_ticker was SPX500, which is NOT in kept → nulled
    expect(params![20]).toBeNull();
    expect(params![21]).toBeNull();
  });

  it("preserves primary_ticker when it remains in sanitization.kept", async () => {
    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["NVDA", "AAPL"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    const batchStories = [
      makeStory({ affected_tickers: ["NVDA", "AAPL"], primary_ticker: "NVDA" }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    expect(params![7]).toEqual(["NVDA", "AAPL"]);
    expect(params![20]).toBe("NVDA");
    expect(params![21]).toBe("batch_heuristic");
  });

  it("does not change null primary_ticker (defensive)", async () => {
    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["NVDA"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    const batchStories = [
      makeStory({ affected_tickers: ["NVDA"], primary_ticker: null }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    expect(params![20]).toBeNull();
    expect(params![21]).toBeNull();
  });
});

// ── applyChanges: Slice 5 ticker sanitization ────────────────────────

describe("applyChanges Slice 5 ticker sanitization", () => {
  const provenance = {
    modelName: "test-model",
    generatedAt: "2026-04-01T00:00:00Z",
    unknownTickerSet: new Set<string>(),
  };

  afterEach(() => {
    delete process.env["MEMORY_CURATOR_SANITIZE_BROAD_TICKERS"];
  });

  it("drops unevidenced SPX500 from affected_tickers and populates tickers_inferred", async () => {
    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["JEPI", "SPX500"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    const batchStories = [
      makeStory({ affected_tickers: ["JEPI"], primary_ticker: null }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    // $8 = affected_tickers (index 7) — sanitized
    expect(params![7]).toEqual(["JEPI"]);
    // $23 = tickers_inferred (index 22)
    expect(params![22]).toEqual(["SPX500"]);
  });

  it("keeps evidenced boilerplate tickers in affected_tickers", async () => {
    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["OIL", "SPX500"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    const batchStories = [
      makeStory({ affected_tickers: ["OIL", "SPX500"], primary_ticker: null }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    expect(params![7]).toEqual(["OIL", "SPX500"]);
    expect(params![22]).toEqual([]);
  });

  it("derives primary_ticker from RAW tickers before sanitization (anchor invariance)", async () => {
    const { pool, queries } = makeMockPool();
    // Theme has AAPL + SPX500; stories carry AAPL primary. SPX500 is unevidenced boilerplate.
    const nt = makeNewTheme({ affected_tickers: ["AAPL", "SPX500"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    const batchStories = [
      makeStory({ affected_tickers: ["AAPL"], primary_ticker: "AAPL" }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    // affected_tickers sanitized to ["AAPL"]
    expect(params![7]).toEqual(["AAPL"]);
    // tickers_inferred = ["SPX500"]
    expect(params![22]).toEqual(["SPX500"]);
    // primary_ticker still derived from raw ["AAPL", "SPX500"]
    expect(params![20]).toBe("AAPL");
    expect(params![21]).toBe("batch_heuristic");
  });

  it("writes raw tickers and empty tickers_inferred when env flag disables sanitization", async () => {
    process.env["MEMORY_CURATOR_SANITIZE_BROAD_TICKERS"] = "false";

    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["JEPI", "SPX500"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    const batchStories = [
      makeStory({ affected_tickers: ["JEPI"], primary_ticker: null }),
    ];

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, batchStories);

    const params = findInsertParams(queries);
    expect(params).toBeDefined();
    // No sanitization — raw tickers preserved
    expect(params![7]).toEqual(["JEPI", "SPX500"]);
    // Empty inferred
    expect(params![22]).toEqual([]);
  });

  it("does NOT touch affected_tickers or tickers_inferred on the UPDATE path", async () => {
    const { pool, queries } = makeMockPool();
    const update: ThemeUpdateEntry = {
      theme_id: "550e8400-e29b-41d4-a716-446655440000",
      new_facts: ["new fact"],
      updated_summary: "updated",
      updated_impact: "high",
      updated_relevance: 0.9,
    };
    const output: CuratorOutput = { new_themes: [], updates: [update], decay: [] };

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, []);

    const updateSql = findUpdateSql(queries);
    expect(updateSql).toBeDefined();
    expect(updateSql).not.toContain("affected_tickers");
    expect(updateSql).not.toContain("tickers_inferred");
  });

  it("INSERT SQL includes tickers_inferred column", async () => {
    const { pool, queries } = makeMockPool();
    const nt = makeNewTheme({ affected_tickers: ["AAPL"] });
    const output: CuratorOutput = { new_themes: [nt], updates: [], decay: [] };

    await applyChanges(pool, output, ["batch-001"], {}, noopLog, provenance, [
      makeStory({ affected_tickers: ["AAPL"], primary_ticker: null }),
    ]);

    const insertQuery = queries.find(
      (q) => typeof q.sql === "string" && q.sql.includes("INSERT INTO analysis_market_memory"),
    );
    expect(insertQuery).toBeDefined();
    expect(insertQuery!.sql).toContain("tickers_inferred");
  });
});
