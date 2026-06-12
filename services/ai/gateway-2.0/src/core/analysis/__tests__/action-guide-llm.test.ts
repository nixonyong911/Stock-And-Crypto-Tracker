import { describe, it, expect } from "vitest";
import {
  buildActionGuideFacts,
  buildActionGuidePrompt,
  sanitizeActionGuide,
  allowedNumbers,
  type ActionGuideFacts,
} from "../action-guide-llm.js";
import { validateActionGuideResponse } from "../llm-schemas.js";
import type { DigestBrief } from "../digest-brief-generator.js";

const silentLog = {
  warn: () => {},
  error: () => {},
  info: () => {},
  debug: () => {},
} as never;

function spxFacts(): ActionGuideFacts {
  return {
    symbol: "SPX500",
    companyName: "S&P 500",
    price: 7414.8,
    stance: "Lean Bearish",
    conviction_stars: 2,
    zone_position: "between",
    buy_zone: { low: 7240.01, high: 7333.23 },
    sell_zone: { low: 7519.65, high: 7612.87 },
    yearly_range: { low: 7240.01, high: 7612.87 },
    sma_50: 7280,
    sma_200: 7000,
    pct_vs_sma200: 5.9,
    news_one_liner: "S&P 500 slips 2.3% on Iran conflict and CPI fears",
    deterministic_guide:
      "Momentum is soft — patience preferred until price reaches the buy zone.",
  };
}

// ── Schema ────────────────────────────────────────────────────────────

describe("validateActionGuideResponse", () => {
  it("accepts a well-formed response", () => {
    const r = validateActionGuideResponse({ actionGuide: "Long-term uptrend intact; wait for the buy zone." });
    expect(r?.actionGuide).toContain("uptrend");
  });

  it("rejects non-objects, missing keys, and out-of-bounds lengths", () => {
    expect(validateActionGuideResponse(null)).toBeNull();
    expect(validateActionGuideResponse("just text")).toBeNull();
    expect(validateActionGuideResponse({})).toBeNull();
    expect(validateActionGuideResponse({ actionGuide: "too short" })).toBeNull();
    expect(validateActionGuideResponse({ actionGuide: "x".repeat(300) })).toBeNull();
  });
});

// ── Numeric whitelist ─────────────────────────────────────────────────

describe("sanitizeActionGuide — numeric whitelist", () => {
  it("accepts prose whose numbers all trace to facts (with formatting freedom)", () => {
    const text =
      "Price holds 5.9% above the 200-day average; consider waiting for a dip toward $7,240-$7,333 before adding.";
    expect(sanitizeActionGuide(text, spxFacts(), silentLog)).toContain("200-day");
  });

  it("rejects an invented price", () => {
    const text =
      "Price holds above the 200-day average; consider adding once it reclaims $7,100 support.";
    expect(sanitizeActionGuide(text, spxFacts(), silentLog)).toBeNull();
  });

  it("accepts truncated zone boundaries (observed live: 6,340 for 6340.87)", () => {
    const facts = spxFacts();
    facts.buy_zone = { low: 5914.4, high: 6340.87 };
    const text =
      "Long-term trend holds; consider waiting for weakness toward the $6,340 area before adding to positions.";
    expect(sanitizeActionGuide(text, facts, silentLog)).not.toBeNull();
  });

  it("accepts numbers quoted from the news one-liner", () => {
    const text =
      "After the 2.3% pullback, the long-term uptrend is intact — wait for the 7240 area before adding.";
    expect(sanitizeActionGuide(text, spxFacts(), silentLog)).not.toBeNull();
  });

  it("rejects markdown and emoji; collapses newlines to spaces", () => {
    const facts = spxFacts();
    expect(sanitizeActionGuide("Trend **intact**, wait for the buy zone to be reached.", facts, silentLog)).toBeNull();
    expect(sanitizeActionGuide("Trend intact 🚀 — wait for the buy zone to be reached.", facts, silentLog)).toBeNull();
    // Line wrapping is harmless formatting, not a violation: normalized away.
    expect(
      sanitizeActionGuide("Trend intact.\nWait for the buy zone to be reached.", facts, silentLog),
    ).toBe("Trend intact. Wait for the buy zone to be reached.");
  });

  it("rejects out-of-bounds lengths and collapses whitespace", () => {
    const facts = spxFacts();
    expect(sanitizeActionGuide("Too short.", facts, silentLog)).toBeNull();
    expect(sanitizeActionGuide("Wait for it.  ".repeat(30), facts, silentLog)).toBeNull();
    const cleaned = sanitizeActionGuide(
      "Long-term   uptrend intact;   wait for the buy zone.",
      facts,
      silentLog,
    );
    expect(cleaned).toBe("Long-term uptrend intact; wait for the buy zone.");
  });

  it("allowedNumbers includes facts, MA period names, and news numbers", () => {
    const allowed = allowedNumbers(spxFacts());
    expect(allowed).toContain(7414.8);
    expect(allowed).toContain(200);
    expect(allowed).toContain(2.3); // from the news one-liner
  });
});

// ── Facts builder + prompt ────────────────────────────────────────────

describe("buildActionGuideFacts", () => {
  it("derives zone position and regime numbers from the brief + extras", () => {
    const brief = {
      ticker: "SPX500",
      companyName: "S&P 500",
      status: { label: "Bearish", tone: "bearish" },
      stance5: { label: "Lean Bearish", tone: "lean_bearish" },
      stars: 2,
      levelsBar: {
        min: 7240.01,
        max: 7612.87,
        current: 7414.8,
        buyZone: { low: 7240.01, high: 7333.23 },
        sellZone: { low: 7519.65, high: 7612.87 },
      },
      actionGuide: "Momentum is soft — patience preferred until price reaches the buy zone.",
      price: 7414.8,
      changePercent: 0.36,
      confidence: "High",
      updatedAt: null,
      whatHappening: "x",
      whatToWatch: { holdAbove: "—", breakBelowTarget: "—" },
      context: "",
      hasMaterialContext: false,
    } as unknown as DigestBrief;

    const facts = buildActionGuideFacts({
      brief,
      extras: { sma50: 7280.123, sma200: 7000.456 },
      newsOneLiner: "Iran conflict pressures markets",
      macroTheme: "geopolitical risk",
    });

    expect(facts.zone_position).toBe("between");
    expect(facts.stance).toBe("Lean Bearish");
    expect(facts.sma_200).toBe(7000.46);
    expect(facts.pct_vs_sma200).toBeCloseTo(5.9, 1);
    expect(facts.macro_theme).toBe("geopolitical risk");

    const prompt = buildActionGuidePrompt(facts);
    expect(prompt).toContain("ONLY numbers that appear in FACTS");
    expect(prompt).toContain('"SPX500"');
  });
});
