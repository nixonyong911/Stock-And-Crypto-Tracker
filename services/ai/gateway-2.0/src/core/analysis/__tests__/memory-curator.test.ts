import { describe, it, expect } from "vitest";
import {
  parseCuratorOutput,
  formatCuratorNotification,
  type CuratorResult,
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
