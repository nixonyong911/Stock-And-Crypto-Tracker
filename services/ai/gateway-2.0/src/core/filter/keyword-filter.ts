/**
 * Sensitive keyword input filter.
 *
 * Blocks messages containing infrastructure-probing terms or
 * markdown/formatting injection attempts before they reach the CLI.
 * DEV tier is exempt (checked by the caller).
 */

import type { FastifyBaseLogger } from "fastify";
import type { PgPool } from "../../db/postgres.js";

export interface KeywordCheckResult {
  readonly blocked: boolean;
  readonly matchedKeyword: string;
}

export interface KeywordViolationParams {
  userId?: string;
  channelType?: string;
  platformUsername?: string;
  messageText: string;
  matchedKeyword: string;
}

/**
 * Pattern entry: human-readable label + compiled regex.
 * The label is stored in the violation log so admins can see
 * which category triggered.
 */
interface KeywordPattern {
  label: string;
  regex: RegExp;
}

const RAW_PATTERNS: ReadonlyArray<{ label: string; source: string; flags: string }> = [
  // --- Category A: Infrastructure probing ---
  { label: "mcp", source: "\\bmcp\\b", flags: "i" },
  { label: "cursor-agent", source: "\\bcursor-agent\\b", flags: "i" },
  { label: "cursor_ide", source: "\\bCursor\\s*IDE\\b", flags: "i" },
  { label: "analysis_mcp", source: "\\banalysis_mcp\\b", flags: "i" },
  { label: "analysis_tool", source: "\\banalysis_(?:ticker_overview|technical_signals|market_scan|price_targets)\\b", flags: "i" },
  { label: "analysis_internal", source: "\\banalysis_(?:screen|compare|macro|market_earnings|earnings_history)\\b", flags: "i" },
  { label: "infra_tool", source: "\\b(?:Read\\s+tool|Write\\s+tool|Grep\\s+tool|SemanticSearch|WebFetch|WebSearch)\\b", flags: "i" },
  { label: "tool_listing", source: "\\b(?:Available\\s+tools|My\\s+tools\\s+include)\\b", flags: "i" },
  { label: "tool_access", source: "\\bI\\s+have\\s+access\\s+to\\b", flags: "i" },
  { label: "cursor_path", source: "\\.cursor/", flags: "" },
  { label: "mcp_json", source: "\\bmcp\\.json\\b", flags: "i" },

  // --- Category B: Markdown/formatting injection ---
  { label: "markdown_heading", source: "(?:^|\\n)#{1,3}\\s+", flags: "" },
  { label: "role_tag_system", source: "\\[SYSTEM\\]", flags: "i" },
  { label: "role_tag_admin", source: "\\[ADMIN\\]", flags: "i" },
  { label: "role_tag_instruction", source: "\\[INSTRUCTION\\]", flags: "i" },
  { label: "role_tag_debug", source: "\\[DEBUG\\]", flags: "i" },
  { label: "dbg_flag", source: "\\bDBG\\b", flags: "i" },
  { label: "debug_mode", source: "\\bDEBUG\\s*MODE\\b", flags: "i" },
  { label: "additional_instruct", source: "\\badditional\\s+instr", flags: "i" },
  { label: "override", source: "\\b(?:OVERRIDE|OVERWRITE)\\b", flags: "i" },
];

export class KeywordFilter {
  private readonly logger: FastifyBaseLogger;
  private readonly db: PgPool;
  private readonly patterns: KeywordPattern[];

  constructor(db: PgPool, logger: FastifyBaseLogger) {
    this.db = db;
    this.logger = logger;
    this.patterns = [];

    for (const { label, source, flags } of RAW_PATTERNS) {
      try {
        this.patterns.push({ label, regex: new RegExp(source, flags) });
      } catch (err: unknown) {
        this.logger.warn({ pattern: source, err }, "Failed to compile keyword pattern");
      }
    }
  }

  check(message: string): KeywordCheckResult {
    for (const { label, regex } of this.patterns) {
      if (regex.test(message)) {
        return { blocked: true, matchedKeyword: label };
      }
    }
    return { blocked: false, matchedKeyword: "" };
  }

  async logViolation(params: KeywordViolationParams): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO logging_keyword_violations
           (user_id, channel_type, platform_username, message_text, matched_keyword)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          params.userId ?? null,
          params.channelType ?? null,
          params.platformUsername ?? null,
          params.messageText.slice(0, 2000),
          params.matchedKeyword,
        ]
      );
    } catch (err: unknown) {
      this.logger.error({ err, params }, "Failed to write keyword violation log");
    }
  }
}
