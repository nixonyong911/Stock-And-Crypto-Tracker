import { describe, it, expect } from "vitest";
import { formatRecommendation } from "../digest-formatter.js";
import type { Explanation } from "../explanation-generator.js";

function makeExplanation(overrides: Partial<Explanation> = {}): Explanation {
  return {
    whatsHappening: "Price is near support.",
    whatToWatch: "Hold above $170.",
    outlook: "Bullish",
    horizon: "Swing (1-3 weeks)",
    confidence: "High",
    risk: "Low-Medium",
    ...overrides,
  };
}

describe("formatRecommendation", () => {
  it("formats stock symbol without modification", () => {
    const output = formatRecommendation("AAPL", "Near support level", makeExplanation());
    expect(output).toContain("**AAPL**");
  });

  it("strips /USD from crypto symbols", () => {
    const output = formatRecommendation("BTC/USD", "Near support level", makeExplanation());
    expect(output).toContain("**BTC**");
    expect(output).not.toContain("BTC/USD");
  });

  it("contains What's happening section", () => {
    const explanation = makeExplanation({ whatsHappening: "Testing whats happening." });
    const output = formatRecommendation("AAPL", "Headline", explanation);
    expect(output).toContain("**What's happening:** Testing whats happening.");
  });

  it("contains What to watch section", () => {
    const explanation = makeExplanation({ whatToWatch: "Watch the support level." });
    const output = formatRecommendation("AAPL", "Headline", explanation);
    expect(output).toContain("**What to watch:** Watch the support level.");
  });

  it("contains Outlook, Horizon, Confidence, Risk metadata", () => {
    const explanation = makeExplanation({
      outlook: "Bearish",
      horizon: "Short-term (days)",
      confidence: "Low",
      risk: "Higher",
    });
    const output = formatRecommendation("AAPL", "Headline", explanation);

    expect(output).toContain("**AAPL** | Bearish | Short-term (days)");
    expect(output).toContain("Confidence: Low | Risk: Higher");
  });

  it("includes all explanation fields in the output", () => {
    const explanation = makeExplanation();
    const output = formatRecommendation("AAPL", "Headline", explanation);

    expect(output).toContain(explanation.whatsHappening);
    expect(output).toContain(explanation.whatToWatch);
    expect(output).toContain(explanation.outlook);
    expect(output).toContain(explanation.horizon);
    expect(output).toContain(explanation.confidence);
    expect(output).toContain(explanation.risk);
  });

  it("includes News factor line when newsOneLiner is provided", () => {
    const explanation = makeExplanation({
      newsOneLiner: "Tech under pressure from ETF rebalancing.",
    });
    const output = formatRecommendation("AAPL", "Headline", explanation);
    expect(output).toContain("**News factor:** Tech under pressure from ETF rebalancing.");
  });

  it("omits News factor line when newsOneLiner is undefined", () => {
    const output = formatRecommendation("AAPL", "Headline", makeExplanation());
    expect(output).not.toContain("News factor");
  });

  it("omits News factor line when newsOneLiner is empty string", () => {
    const explanation = makeExplanation({ newsOneLiner: "" });
    const output = formatRecommendation("AAPL", "Headline", explanation);
    expect(output).not.toContain("News factor");
  });
});
