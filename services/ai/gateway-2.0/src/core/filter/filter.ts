/**
 * Output filter for AI-generated responses.
 *
 * Strips internal tool-call artefacts, file-system paths, and stack traces
 * from model output before it reaches end-users.  Dev-tier responses bypass
 * the strip logic but still receive the AI disclaimer.
 */

import type { FastifyBaseLogger } from "fastify";
import type { GatewayConfig } from "../../config.js";
import { Tier, getTierConfig } from "../tier/config.js";

const AI_DISCLAIMER =
  "\n\n_Educational market analysis, not financial advice._";

const DISCLAIMER_TRIGGERS =
  /\$\d|bullish|bearish|support zone|resistance|invalidation|outlook|confidence|scenario/i;

/**
 * Pre-compiled patterns that match lines which should be removed from
 * non-dev output.  Each entry is a [source, flags] tuple so we can
 * log the original pattern string on compilation failure.
 */
const RAW_PATTERNS: ReadonlyArray<{ source: string; flags: string }> = [
  // --- Tool-call artefacts ---
  { source: "^Tool:\\s.*$", flags: "i" },
  { source: "^MCP:\\s.*$", flags: "i" },
  { source: "^Function:\\s.*$", flags: "i" },
  { source: "^Calling tool:\\s.*$", flags: "i" },
  { source: "^tool_call\\s.*$", flags: "i" },

  // --- File-system paths ---
  { source: "/home/azureuser/[^\\s]+", flags: "" },
  { source: "/root/[^\\s]+", flags: "" },
  { source: "/app/[^\\s]+", flags: "" },
  { source: "/opt/cursor-agent/[^\\s]+", flags: "" },

  // --- Stack traces / errors ---
  { source: "^Error:\\s.*$", flags: "i" },
  { source: "^at Object\\..*$", flags: "i" },
  { source: "^\\s+at\\s+.*\\(.*:\\d+:\\d+\\)$", flags: "i" },
  { source: "^Stack trace:.*$", flags: "i" },

  // --- Internal tool / infrastructure leakage (capability-probing defense) ---
  { source: "\\bcursor-agent\\b", flags: "i" },
  { source: "\\bCursor IDE\\b", flags: "i" },
  { source: "\\banalysis_mcp\\b", flags: "i" },
  { source: "\\banalysis_ticker_overview\\b", flags: "" },
  { source: "\\banalysis_technical_signals\\b", flags: "" },
  { source: "\\banalysis_market_scan\\b", flags: "" },
  { source: "\\banalysis_price_targets\\b", flags: "" },
  { source: "\\banalysis_screen\\b", flags: "" },
  {
    source:
      "^.*\\b(Shell|Read tool|Write tool|Grep tool|SemanticSearch|WebFetch|WebSearch)\\b.*$",
    flags: "i",
  },
  { source: "^Available tools:.*$", flags: "i" },
  { source: "^I have access to (the following|these).*$", flags: "i" },
  { source: "^My tools include.*$", flags: "i" },
  { source: "\\bmcp\\.json\\b", flags: "i" },
  { source: "\\.cursor/", flags: "" },
];

export class OutputFilter {
  private readonly logger: FastifyBaseLogger;
  private readonly stripPatterns: RegExp[];

  constructor(_config: GatewayConfig, logger: FastifyBaseLogger) {
    this.logger = logger;
    this.stripPatterns = [];

    for (const { source, flags } of RAW_PATTERNS) {
      try {
        this.stripPatterns.push(new RegExp(source, flags));
      } catch (err: unknown) {
        this.logger.warn(
          { pattern: source, err },
          "Failed to compile filter pattern"
        );
      }
    }
  }

  /**
   * Filter the model output according to the caller's subscription tier.
   *
   * - **Dev** tier receives the raw output plus the AI disclaimer.
   * - All other tiers have internal artefacts stripped, the result trimmed,
   *   optionally truncated to `maxMessageLength`, and the disclaimer appended.
   */
  apply(output: string, tier: Tier): string {
    if (tier === Tier.Dev) {
      return output + AI_DISCLAIMER;
    }

    const tierCfg = getTierConfig(tier);

    const lines = output.split("\n");
    const filtered: string[] = [];

    for (const line of lines) {
      let stripped = false;
      for (const pattern of this.stripPatterns) {
        if (pattern.test(line)) {
          stripped = true;
          break;
        }
      }
      if (!stripped) {
        filtered.push(line);
      }
    }

    let result = filtered.join("\n").trim();

    // Convert Markdown headings to bold (## / ### don't render in Telegram)
    result = result.replace(/^#{1,3}\s+(.+)$/gm, "**$1**");

    if (
      tierCfg.maxMessageLength > 0 &&
      result.length > tierCfg.maxMessageLength
    ) {
      result =
        result.slice(0, tierCfg.maxMessageLength) +
        "\n\n... (response truncated, upgrade for longer responses)";
    }

    if (DISCLAIMER_TRIGGERS.test(result)) {
      result += AI_DISCLAIMER;
    }

    return result;
  }
}
