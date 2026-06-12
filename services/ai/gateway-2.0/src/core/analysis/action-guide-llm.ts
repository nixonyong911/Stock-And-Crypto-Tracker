/**
 * LLM-composed Action Guide for the Smart Digest card.
 *
 * The deterministic scoring layer (`smart-digest-score.ts`) stays the source
 * of every FACT (stance, zones, regime numbers); this module only asks an
 * LLM to phrase 1-2 sentences of guidance from those facts, then validates
 * the prose hard:
 *
 *   - JSON-only response, Zod-validated shape and length
 *   - numeric whitelist: every number in the output must trace to a fact
 *     (no invented prices/percentages — the "never invent" contract holds)
 *   - plain text only (no markdown / newlines / emoji)
 *
 * Any failure returns null and the caller keeps the rule-based sentence, so
 * a slow or broken LLM can never block card delivery. The result is stored
 * in the artifact payload, so the LLM runs once per (symbol, fact-change),
 * not per delivery.
 *
 * Knobs (env, read per call so tests can override):
 *   - SMART_DIGEST_LLM_ACTION_GUIDE  kill switch (default true)
 *   - GATEWAY_ACTION_GUIDE_MODEL     model (default claude-4.6-sonnet-medium)
 *   - ACTION_GUIDE_TIMEOUT_MS        timeout, clamped 10s-5m (default 60s)
 */

import type { FastifyBaseLogger } from "fastify";
import type { DigestBrief } from "./digest-brief-generator.js";
import type { StockCardExtras } from "./recommendation-engine.js";
import { pricePosition } from "./smart-digest-score.js";
import { runCursorAgent } from "./run-cursor-agent.js";
import { validateActionGuideResponse } from "./llm-schemas.js";

// ── Config (env readers, mirroring ticker-sanitizer's pattern) ────────

export function getActionGuideLlmEnabled(): boolean {
  const raw = process.env["SMART_DIGEST_LLM_ACTION_GUIDE"];
  if (raw === undefined || raw === "") return true;
  return raw.toLowerCase() !== "false";
}

export function getActionGuideModel(): string {
  return process.env["GATEWAY_ACTION_GUIDE_MODEL"] || "claude-4.6-sonnet-medium";
}

export function getActionGuideTimeoutMs(): number {
  const raw = Number.parseInt(process.env["ACTION_GUIDE_TIMEOUT_MS"] ?? "", 10);
  if (!Number.isFinite(raw)) return 60_000;
  return Math.min(300_000, Math.max(10_000, raw));
}

/** Hard output cap after validation (card aesthetics, not satori limits). */
const MAX_GUIDE_CHARS = 240;

// ── Facts ─────────────────────────────────────────────────────────────

export interface ActionGuideFacts {
  symbol: string;
  companyName?: string;
  price: number;
  stance: string;
  conviction_stars?: number;
  zone_position: string;
  buy_zone?: { low: number; high: number };
  sell_zone?: { low: number; high: number };
  yearly_range?: { low: number; high: number };
  sma_50?: number;
  sma_200?: number;
  /** Percent distance of price from the 200-day MA, 1 decimal. */
  pct_vs_sma200?: number;
  news_one_liner?: string;
  macro_theme?: string;
  /** The rule-based sentence, as a reference for tone/length. */
  deterministic_guide?: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function buildActionGuideFacts(args: {
  brief: DigestBrief;
  extras?: StockCardExtras;
  newsOneLiner?: string;
  macroTheme?: string;
}): ActionGuideFacts {
  const { brief, extras } = args;
  const bar = brief.levelsBar;

  const facts: ActionGuideFacts = {
    symbol: brief.ticker,
    price: round2(brief.price),
    stance: brief.stance5?.label ?? brief.status.label,
    zone_position: pricePosition(bar),
  };
  if (brief.companyName) facts.companyName = brief.companyName;
  if (typeof brief.stars === "number") facts.conviction_stars = brief.stars;
  if (bar?.buyZone) {
    facts.buy_zone = { low: round2(bar.buyZone.low), high: round2(bar.buyZone.high) };
  }
  if (bar?.sellZone) {
    facts.sell_zone = { low: round2(bar.sellZone.low), high: round2(bar.sellZone.high) };
  }
  if (bar) facts.yearly_range = { low: round2(bar.min), high: round2(bar.max) };
  if (extras?.sma50 != null) facts.sma_50 = round2(extras.sma50);
  if (extras?.sma200 != null) {
    facts.sma_200 = round2(extras.sma200);
    if (brief.price > 0 && extras.sma200 > 0) {
      facts.pct_vs_sma200 = Math.round(((brief.price / extras.sma200) - 1) * 1000) / 10;
    }
  }
  if (args.newsOneLiner) facts.news_one_liner = args.newsOneLiner;
  if (args.macroTheme) facts.macro_theme = args.macroTheme;
  if (brief.actionGuide) facts.deterministic_guide = brief.actionGuide;
  return facts;
}

// ── Prompt ────────────────────────────────────────────────────────────

export function buildActionGuidePrompt(facts: ActionGuideFacts): string {
  return `You write the short "Action Guide" line on a market digest card for a retail investor.

Using ONLY the facts below, write 1-2 sentences (max 220 characters total) of practical, hedged guidance.

Rules:
- Use ONLY numbers that appear in FACTS. Never introduce a new number, price, or percentage.
- Hedged language only: "consider", "watch", "favor", "wait for". Never "will", never guarantees, no financial-advice claims.
- Plain text: no markdown, no emoji, no line breaks.
- If the long-term regime (price vs the 200-day average) conflicts with the short-term stance, name that tension plainly — it is the most useful thing on the card.
- Mention a concrete level or zone from FACTS when it sharpens the guidance.
- Do not repeat the stance label verbatim; add reasoning, not a restatement.

FACTS: ${JSON.stringify(facts)}

Return ONLY this JSON, nothing else: {"actionGuide": "..."}`;
}

// ── Validation guardrails ─────────────────────────────────────────────

const NUM_TOKEN_RE = /\$?\d[\d,]*(?:\.\d+)?%?/g;
const MARKDOWN_OR_EMOJI_RE = /[*_#`>\[\]\n\r]|\p{Extended_Pictographic}/u;

/** All numbers a fact set legitimizes, as floats. */
export function allowedNumbers(facts: ActionGuideFacts): number[] {
  const out: number[] = [];
  const push = (n: number | undefined): void => {
    if (typeof n === "number" && Number.isFinite(n)) out.push(Math.abs(n));
  };
  push(facts.price);
  push(facts.conviction_stars);
  push(facts.buy_zone?.low);
  push(facts.buy_zone?.high);
  push(facts.sell_zone?.low);
  push(facts.sell_zone?.high);
  push(facts.yearly_range?.low);
  push(facts.yearly_range?.high);
  push(facts.sma_50);
  push(facts.sma_200);
  push(facts.pct_vs_sma200);
  out.push(50, 200); // the MA period names ("200-day average") are always fair game
  // Numbers quoted inside the news one-liner are part of the fact set too.
  for (const src of [facts.news_one_liner, facts.deterministic_guide]) {
    if (!src) continue;
    for (const m of src.match(NUM_TOKEN_RE) ?? []) {
      const n = parseFloat(m.replace(/[$,%]/g, "").replace(/,/g, ""));
      if (Number.isFinite(n)) out.push(Math.abs(n));
    }
  }
  return out;
}

/**
 * A numeric token in the output is legitimate when it equals some allowed
 * fact value rounded to the token's own displayed precision (so "7,333.23",
 * "7333.2" and "7333" all trace to the fact 7333.23, but "7100" does not).
 */
function tokenTracesToFacts(token: string, allowed: number[]): boolean {
  const cleaned = token.replace(/[$,%]/g, "").replace(/,/g, "");
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value)) return true; // not a number after all
  const decimals = cleaned.includes(".") ? cleaned.split(".")[1]!.length : 0;
  const scale = 10 ** decimals;
  return allowed.some(
    (a) => Math.abs(Math.round(a * scale) / scale - value) < 1 / (2 * scale),
  );
}

/**
 * Validate the parsed guide text against the guardrails. Exported for
 * tests. Returns the cleaned text or null.
 */
export function sanitizeActionGuide(
  text: string,
  facts: ActionGuideFacts,
  log: FastifyBaseLogger,
): string | null {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length < 20 || collapsed.length > MAX_GUIDE_CHARS) {
    log.warn({ length: collapsed.length }, "action-guide LLM output length out of bounds");
    return null;
  }
  if (MARKDOWN_OR_EMOJI_RE.test(collapsed)) {
    log.warn("action-guide LLM output contains markdown/emoji/newline");
    return null;
  }
  const allowed = allowedNumbers(facts);
  for (const token of collapsed.match(NUM_TOKEN_RE) ?? []) {
    if (!tokenTracesToFacts(token, allowed)) {
      log.warn({ token }, "action-guide LLM output contains an unsupported number");
      return null;
    }
  }
  return collapsed;
}

// ── Entry point ───────────────────────────────────────────────────────

/**
 * Compose the guide via cursor-agent. Returns the validated text, or null
 * on ANY failure (disabled, timeout, parse, guardrail) — callers keep the
 * deterministic sentence.
 */
export async function generateLlmActionGuide(
  facts: ActionGuideFacts,
  log: FastifyBaseLogger,
): Promise<string | null> {
  if (!getActionGuideLlmEnabled()) return null;

  try {
    const raw = await runCursorAgent({
      prompt: buildActionGuidePrompt(facts),
      model: getActionGuideModel(),
      timeoutMs: getActionGuideTimeoutMs(),
      log,
      label: `action-guide:${facts.symbol}`,
    });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn({ preview: raw.slice(0, 200) }, "action-guide LLM output has no JSON object");
      return null;
    }
    const parsed: unknown = JSON.parse(jsonMatch[0]);
    const validated = validateActionGuideResponse(parsed);
    if (!validated) {
      log.warn("action-guide LLM output failed schema validation");
      return null;
    }
    return sanitizeActionGuide(validated.actionGuide, facts, log);
  } catch (err) {
    log.warn({ err, symbol: facts.symbol }, "action-guide LLM call failed — using deterministic guide");
    return null;
  }
}
