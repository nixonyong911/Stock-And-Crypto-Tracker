/**
 * Security service – detects prompt injection attempts, encoded payloads,
 * and oversized messages.  Ported from the Go gateway security package.
 */

import type { FastifyBaseLogger } from "fastify";
import type { GatewayConfig } from "../../config.js";
import { Tier } from "../tier/config.js";
import type { PgPool } from "../../db/postgres.js";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export interface SecurityCheckResult {
  readonly blocked: boolean;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Parameters for the security-event logger
// ---------------------------------------------------------------------------

export interface SecurityLogParams {
  userId?: string;
  channelType?: string;
  messagePreview: string;
  detectionType: string;
  ruleMatched?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SecurityService {
  private readonly config: GatewayConfig;
  private readonly db: PgPool;
  private readonly logger: FastifyBaseLogger;
  private readonly patterns: RegExp[];

  constructor(config: GatewayConfig, db: PgPool, logger: FastifyBaseLogger) {
    this.config = config;
    this.db = db;
    this.logger = logger;

    const rawPatterns: string[] = [
      `(?i)ignore\\s+(all\\s+)?previous\\s+instructions`,
      `(?i)ignore\\s+(all\\s+)?prior\\s+instructions`,
      `(?i)disregard\\s+(all\\s+)?previous`,
      `(?i)forget\\s+(all\\s+)?previous`,
      `(?i)you\\s+are\\s+now\\s+a`,
      `(?i)act\\s+as\\s+(a\\s+)?`,
      `(?i)pretend\\s+(you\\s+are|to\\s+be)`,
      `(?i)system\\s*prompt\\s*:`,
      `(?i)new\\s+instructions?\\s*:`,
      `(?i)\\bDAN\\b.*\\bmode\\b`,
      `(?i)jailbreak`,
      `(?i)bypass\\s+(your\\s+)?(restrictions|rules|filters|safety)`,
      `(?i)override\\s+(your\\s+)?(instructions|rules|programming)`,
      `(?i)reveal\\s+(your\\s+)?(system|instructions|prompt|rules)`,
      `(?i)what\\s+(are|is)\\s+your\\s+(system\\s+)?prompt`,
      `(?i)show\\s+me\\s+your\\s+(system\\s+)?prompt`,
      `(?i)repeat\\s+(your\\s+)?(system\\s+)?(prompt|instructions)`,
      `(?i)execute\\s+(this\\s+)?(command|code|script)`,
      `(?i)run\\s+(this\\s+)?(command|code|shell|bash)`,
      `(?i)(sudo|rm\\s+-rf|chmod|wget|curl\\s+-o)`,
    ];

    this.patterns = [];

    for (const raw of rawPatterns) {
      try {
        // Go's (?i) flag → JS case-insensitive flag.  Strip the Go-style
        // inline flag and pass "i" to the RegExp constructor instead.
        const jsPattern = raw.replace(/\(\?i\)/g, "");
        this.patterns.push(new RegExp(jsPattern, "i"));
      } catch (err: unknown) {
        this.logger.warn(
          { pattern: raw, err },
          "Failed to compile security pattern"
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Primary check
  // -------------------------------------------------------------------------

  /**
   * Run all security checks on the message.
   *
   * @param message  The raw user message.
   * @param tier     Optional resolved tier. When provided, tier-specific
   *                 rules are applied (e.g. slash-command blocking for
   *                 non-DEV users).
   */
  check(message: string, tier?: Tier): SecurityCheckResult {
    const sanitized = this.sanitize(message);

    if (sanitized.length > this.config.maxMessageLength) {
      return { blocked: true, reason: "Message exceeds maximum length" };
    }

    // Block slash commands for non-DEV tiers.  Cursor CLI interprets
    // messages starting with "/" as built-in commands (/compress,
    // /commands, /max-mode, etc.) which could break the bot's purpose.
    if (sanitized.startsWith("/") && tier !== undefined && tier !== Tier.Dev) {
      return { blocked: true, reason: "CLI command injection blocked" };
    }

    for (const pattern of this.patterns) {
      if (pattern.test(sanitized)) {
        return { blocked: true, reason: "Potential prompt injection detected" };
      }
    }

    if (this.hasBase64Block(sanitized)) {
      return { blocked: true, reason: "Encoded content detected" };
    }

    return { blocked: false, reason: "" };
  }

  // -------------------------------------------------------------------------
  // Security event logging
  // -------------------------------------------------------------------------

  async logBlock(params: SecurityLogParams): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO gateway_security_log
           (user_id, channel_type, message_preview, detection_type, rule_matched)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          params.userId ?? null,
          params.channelType ?? null,
          params.messagePreview,
          params.detectionType,
          params.ruleMatched ?? null,
        ]
      );
    } catch (err: unknown) {
      // Never let a logging failure propagate – the request should continue.
      this.logger.error({ err, params }, "Failed to write security log entry");
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Strip zero-width characters, Unicode formatting (Cf category) characters,
   * and collapse whitespace.
   */
  private sanitize(message: string): string {
    // Set of specific zero-width / bidi characters to remove (mirrors Go impl)
    const zeroWidth = new Set([
      0x200b, // ZERO WIDTH SPACE
      0x200c, // ZERO WIDTH NON-JOINER
      0x200d, // ZERO WIDTH JOINER
      0xfeff, // BYTE ORDER MARK
      0x202a, // LEFT-TO-RIGHT EMBEDDING
      0x202b, // RIGHT-TO-LEFT EMBEDDING
      0x202c, // POP DIRECTIONAL FORMATTING
      0x202d, // LEFT-TO-RIGHT OVERRIDE
      0x202e, // RIGHT-TO-LEFT OVERRIDE
    ]);

    let cleaned = "";
    for (const ch of message) {
      const code = ch.codePointAt(0)!;

      // Drop explicitly listed zero-width / bidi chars
      if (zeroWidth.has(code)) continue;

      // Drop Unicode "Format" (Cf) characters, but keep \n and \t
      if (ch !== "\n" && ch !== "\t" && isCfCharacter(code)) continue;

      cleaned += ch;
    }

    // Collapse runs of whitespace into a single space
    cleaned = cleaned.replace(/\s+/g, " ");

    return cleaned.trim();
  }

  /** Detect long Base64-encoded blocks (50+ chars). */
  private hasBase64Block(message: string): boolean {
    return /[A-Za-z0-9+/=]{50,}/.test(message);
  }
}

// ---------------------------------------------------------------------------
// Unicode Cf (Format) category helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the given code-point belongs to Unicode General
 * Category "Cf" (Format).  This covers the most common Cf ranges that
 * appear in real-world prompt-injection attempts.  A full lookup table
 * would be large; this pragmatic subset mirrors the Go `unicode.Is(unicode.Cf, r)` check
 * for the code-points that matter here.
 */
function isCfCharacter(code: number): boolean {
  // Soft hyphen
  if (code === 0x00ad) return true;
  // Arabic format characters
  if (code >= 0x0600 && code <= 0x0605) return true;
  if (code === 0x061c) return true;
  if (code === 0x06dd) return true;
  if (code === 0x070f) return true;
  if (code === 0x0890 || code === 0x0891) return true;
  if (code === 0x08e2) return true;
  // Zero-width & joiners (0x200B-0x200F handled above, but guard here too)
  if (code >= 0x200b && code <= 0x200f) return true;
  // Directional formatting (0x202A-0x202E handled above, guard)
  if (code >= 0x202a && code <= 0x202e) return true;
  // More bidi / format
  if (code >= 0x2060 && code <= 0x2064) return true;
  if (code >= 0x2066 && code <= 0x206f) return true;
  // Byte order mark
  if (code === 0xfeff) return true;
  // Interlinear annotations
  if (code >= 0xfff9 && code <= 0xfffb) return true;
  // Musical / shorthand format controls
  if (code === 0x110bd || code === 0x110cd) return true;
  // Tags block (U+E0001, U+E0020-E007F)
  if (code === 0xe0001) return true;
  if (code >= 0xe0020 && code <= 0xe007f) return true;
  return false;
}
