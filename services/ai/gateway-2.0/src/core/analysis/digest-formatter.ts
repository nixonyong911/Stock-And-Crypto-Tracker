import type { Explanation } from "./explanation-generator.js";

function displaySymbol(symbol: string): string {
  const slash = symbol.indexOf("/");
  return slash !== -1 ? symbol.slice(0, slash) : symbol;
}

export function formatRecommendation(
  symbol: string,
  headline: string,
  explanation: Explanation
): string {
  const display = displaySymbol(symbol);

  return [
    `**${display}** | ${explanation.outlook} | ${explanation.horizon}`,
    `Confidence: ${explanation.confidence} | Risk: ${explanation.risk}`,
    "",
    `**${headline}**`,
    "",
    `**What's happening:** ${explanation.whatsHappening}`,
    "",
    `**What to watch:** ${explanation.whatToWatch}`,
    "",
    `_Educational market analysis, not financial advice._`,
    "",
    `View watchlist: /watchlist · Pause alerts: /alert off`,
  ].join("\n");
}
