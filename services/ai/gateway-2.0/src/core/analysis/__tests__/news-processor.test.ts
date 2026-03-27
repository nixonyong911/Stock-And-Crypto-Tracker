import { describe, it, expect } from "vitest";
import {
  parseLLMOutput,
  formatAdminNotification,
  type ProcessingResult,
} from "../news-processor.js";

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

// ── Mock articles ────────────────────────────────────────────────────

const mockArticles = [
  {
    source_api: "marketaux",
    external_id: "abc-123",
    title: "Fed raises rates by 25 basis points",
    description: "The Federal Reserve raised interest rates...",
    published_at: "2026-03-27T10:00:00Z",
    search_category: "macro",
    sentiment_label: "bearish",
  },
  {
    source_api: "gnews",
    external_id: "def-456",
    title: "Oil prices surge amid Middle East tensions",
    description: "Crude oil prices jumped 3% as geopolitical...",
    published_at: "2026-03-27T09:00:00Z",
    search_category: "geopolitical",
    sentiment_label: "bearish",
  },
  {
    source_api: "marketaux",
    external_id: "ghi-789",
    title: "Apple announces record quarterly earnings",
    description: "Apple Inc reported Q1 earnings...",
    published_at: "2026-03-27T08:00:00Z",
    search_category: "market",
    sentiment_label: "positive",
  },
];

// ── parseLLMOutput ───────────────────────────────────────────────────

describe("parseLLMOutput", () => {
  it("parses valid JSON array from LLM output", () => {
    const llmOutput = JSON.stringify([
      {
        headline: "Fed Raises Rates, Markets React",
        summary: "The Federal Reserve raised rates by 25bps. Bond yields spiked.",
        category: "macro",
        impact_level: "high",
        affected_sectors: ["finance", "tech"],
        affected_tickers: ["SPY", "QQQ"],
        sentiment: "bearish",
        sentiment_score: -0.6,
        key_points: ["Rate hike of 25bps", "Bond yields rose", "Tech stocks declined"],
        market_implications: "Higher borrowing costs may pressure growth stocks",
        source_article_indices: [1],
      },
    ]);

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result).toHaveLength(1);
    expect(result[0]!.headline).toBe("Fed Raises Rates, Markets React");
    expect(result[0]!.category).toBe("macro");
    expect(result[0]!.impact_level).toBe("high");
    expect(result[0]!.sentiment).toBe("bearish");
    expect(result[0]!.sentiment_score).toBe(-0.6);
    expect(result[0]!.key_points).toHaveLength(3);
    expect(result[0]!.source_articles).toHaveLength(1);
    expect(result[0]!.source_articles[0]!.external_id).toBe("abc-123");
  });

  it("extracts JSON from markdown-wrapped output", () => {
    const llmOutput = `Here are the results:\n\`\`\`json\n${JSON.stringify([
      {
        headline: "Test Story",
        summary: "Test summary of the story.",
        category: "market",
        impact_level: "medium",
        affected_sectors: [],
        affected_tickers: [],
        sentiment: "neutral",
        sentiment_score: 0,
        key_points: ["Point 1"],
        market_implications: "None",
        source_article_indices: [1],
      },
    ])}\n\`\`\``;

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result).toHaveLength(1);
    expect(result[0]!.headline).toBe("Test Story");
  });

  it("returns empty array when no JSON found", () => {
    const result = parseLLMOutput("Sorry, I cannot process this.", mockArticles, noopLog);
    expect(result).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    const result = parseLLMOutput("[{invalid json}]", mockArticles, noopLog);
    expect(result).toEqual([]);
  });

  it("skips entries missing required fields", () => {
    const llmOutput = JSON.stringify([
      { headline: "No summary" },
      {
        headline: "Valid",
        summary: "Has all fields",
        category: "market",
        impact_level: "low",
        sentiment: "neutral",
        sentiment_score: 0,
        key_points: ["Point"],
        source_article_indices: [],
      },
      { summary: "No headline" },
    ]);

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result).toHaveLength(1);
    expect(result[0]!.headline).toBe("Valid");
  });

  it("skips entries with empty key_points", () => {
    const llmOutput = JSON.stringify([
      {
        headline: "No Points",
        summary: "Story with no key points",
        category: "market",
        impact_level: "low",
        sentiment: "neutral",
        sentiment_score: 0,
        key_points: [],
        source_article_indices: [],
      },
    ]);

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result).toEqual([]);
  });

  it("clamps sentiment_score to [-1, 1]", () => {
    const llmOutput = JSON.stringify([
      {
        headline: "Extreme",
        summary: "Extreme sentiment test",
        category: "market",
        impact_level: "high",
        sentiment: "bullish",
        sentiment_score: 5.0,
        key_points: ["Point"],
        source_article_indices: [],
      },
    ]);

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result[0]!.sentiment_score).toBe(1);
  });

  it("defaults invalid category to 'market'", () => {
    const llmOutput = JSON.stringify([
      {
        headline: "Unknown Cat",
        summary: "Unknown category",
        category: "entertainment",
        impact_level: "low",
        sentiment: "neutral",
        sentiment_score: 0,
        key_points: ["Point"],
        source_article_indices: [],
      },
    ]);

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result[0]!.category).toBe("market");
  });

  it("uppercases affected_tickers", () => {
    const llmOutput = JSON.stringify([
      {
        headline: "Ticker Test",
        summary: "Testing ticker normalization",
        category: "market",
        impact_level: "low",
        affected_tickers: ["aapl", "Msft", "GOOG"],
        sentiment: "bullish",
        sentiment_score: 0.3,
        key_points: ["Point"],
        source_article_indices: [],
      },
    ]);

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result[0]!.affected_tickers).toEqual(["AAPL", "MSFT", "GOOG"]);
  });

  it("maps source_article_indices to source_articles correctly", () => {
    const llmOutput = JSON.stringify([
      {
        headline: "Multi Source",
        summary: "Story from multiple sources",
        category: "geopolitical",
        impact_level: "high",
        sentiment: "bearish",
        sentiment_score: -0.5,
        key_points: ["Point"],
        source_article_indices: [1, 2, 3],
      },
    ]);

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result[0]!.source_articles).toHaveLength(3);
    expect(result[0]!.source_articles[0]!.source_api).toBe("marketaux");
    expect(result[0]!.source_articles[1]!.source_api).toBe("gnews");
    expect(result[0]!.source_articles[2]!.source_api).toBe("marketaux");
  });

  it("ignores out-of-range source_article_indices", () => {
    const llmOutput = JSON.stringify([
      {
        headline: "Out of Range",
        summary: "Invalid indices",
        category: "market",
        impact_level: "low",
        sentiment: "neutral",
        sentiment_score: 0,
        key_points: ["Point"],
        source_article_indices: [0, 1, 99],
      },
    ]);

    const result = parseLLMOutput(llmOutput, mockArticles, noopLog);
    expect(result[0]!.source_articles).toHaveLength(1);
    expect(result[0]!.source_articles[0]!.external_id).toBe("abc-123");
  });
});

// ── formatAdminNotification ──────────────────────────────────────────

describe("formatAdminNotification", () => {
  it("formats successful processing result with source breakdown", () => {
    const result: ProcessingResult = {
      batchId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      inputArticles: 87,
      outputStories: 12,
      highImpact: 3,
      processingTimeMs: 8200,
      sourceBreakdown: { marketaux: 50, gnews: 37 },
    };

    const msg = formatAdminNotification(result);
    expect(msg).toContain("NEWS PROCESSING");
    expect(msg).toContain("Status:</b> OK");
    expect(msg).toContain("Source:</b> marketaux (50), gnews (37)");
    expect(msg).toContain("Input articles:</b> 87");
    expect(msg).toContain("Output stories:</b> 12");
    expect(msg).toContain("High impact:</b> 3");
    expect(msg).toContain("8.2s");
    expect(msg).toContain("a1b2c3d4");
  });

  it("shows N/A when no source breakdown", () => {
    const result: ProcessingResult = {
      batchId: "abc",
      inputArticles: 10,
      outputStories: 2,
      highImpact: 1,
      processingTimeMs: 5000,
    };

    const msg = formatAdminNotification(result);
    expect(msg).toContain("Source:</b> N/A");
  });

  it("formats failed processing result", () => {
    const result: ProcessingResult = {
      batchId: "x1y2z3",
      inputArticles: 50,
      outputStories: 0,
      highImpact: 0,
      processingTimeMs: 1500,
      error: "LLM call timed out",
    };

    const msg = formatAdminNotification(result);
    expect(msg).toContain("Status:</b> FAILED");
    expect(msg).toContain("Error:</b> LLM call timed out");
  });

  it("escapes HTML in error messages", () => {
    const result: ProcessingResult = {
      batchId: "test",
      inputArticles: 0,
      outputStories: 0,
      highImpact: 0,
      processingTimeMs: 100,
      error: "Error <script>alert('xss')</script>",
    };

    const msg = formatAdminNotification(result);
    expect(msg).not.toContain("<script>");
    expect(msg).toContain("&lt;script&gt;");
  });
});
