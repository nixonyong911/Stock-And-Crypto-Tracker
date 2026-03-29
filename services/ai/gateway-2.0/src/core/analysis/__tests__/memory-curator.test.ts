import { describe, it, expect } from "vitest";
import {
  parseCuratorOutput,
  formatCuratorNotification,
  chunkArray,
  buildCompactThemeList,
  buildBatchCuratorPrompt,
  mergeBatchResults,
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

function makeStory(overrides: Partial<{ headline: string; summary: string; category: string; impact_level: string; sentiment: string; sentiment_score: number; key_points: string[]; affected_tickers: string[]; affected_sectors: string[]; market_implications: string; batch_id: string }> = {}) {
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
        sentiment: "neutral", sentiment_score: 0,
      }],
      updates: [], decay: [],
    };
    const batch2: CuratorOutput = {
      new_themes: [{
        theme: "New Theme 2", summary: "Summary 2", key_facts: ["f2"],
        category: "policy", impact_level: "medium",
        affected_sectors: [], affected_tickers: [], market_implications: "",
        sentiment: "bullish", sentiment_score: 0.5,
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
