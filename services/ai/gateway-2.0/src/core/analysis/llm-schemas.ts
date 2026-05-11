import { z } from "zod";

// ── News processor: FilteredNewsEntry schema ──────────────────────────
// Mirrors: news-processor.ts validateEntry()
//
// Known quirks preserved for contract stability:
//   - headline 120-char cap from prompt is NOT enforced (TODO: follow-up)
//   - news_one_liner is not relevant to this schema (news-processor output)
//   - source_article_indices are validated downstream, not in this schema

const NEWS_CATEGORIES = [
  "macro", "geopolitical", "policy", "market", "crypto", "diplomatic",
] as const;

const NEWS_IMPACTS = ["high", "medium", "low"] as const;
const NEWS_SENTIMENTS = ["bullish", "bearish", "neutral"] as const;

export const filteredNewsEntrySchema = z
  .object({
    headline: z.unknown().optional(),
    summary: z.unknown().optional(),
    category: z.unknown().optional(),
    impact_level: z.unknown().optional(),
    affected_sectors: z.array(z.unknown()).optional().default([]),
    affected_tickers: z.array(z.unknown()).optional().default([]),
    sentiment: z.unknown().optional(),
    sentiment_score: z.unknown().optional(),
    key_points: z.array(z.unknown()).optional().default([]),
    market_implications: z.unknown().optional(),
    source_article_indices: z.array(z.unknown()).optional().default([]),
  })
  .passthrough()
  .transform((obj) => {
    const headline = typeof obj.headline === "string" ? obj.headline : null;
    const summary = typeof obj.summary === "string" ? obj.summary : null;
    if (!headline || !summary) return null;

    const keyPoints = obj.key_points.filter(
      (s): s is string => typeof s === "string",
    );
    if (keyPoints.length === 0) return null;

    const category = NEWS_CATEGORIES.includes(
      String(obj.category) as (typeof NEWS_CATEGORIES)[number],
    )
      ? String(obj.category)
      : "market";

    const impactLevel = NEWS_IMPACTS.includes(
      String(obj.impact_level) as (typeof NEWS_IMPACTS)[number],
    )
      ? (String(obj.impact_level) as "high" | "medium" | "low")
      : ("medium" as const);

    const sentiment = NEWS_SENTIMENTS.includes(
      String(obj.sentiment) as (typeof NEWS_SENTIMENTS)[number],
    )
      ? (String(obj.sentiment) as "bullish" | "bearish" | "neutral")
      : ("neutral" as const);

    const sentimentScore =
      typeof obj.sentiment_score === "number"
        ? Math.max(-1, Math.min(1, obj.sentiment_score))
        : 0;

    const affectedSectors = obj.affected_sectors.filter(
      (s): s is string => typeof s === "string",
    );
    const affectedTickers = obj.affected_tickers
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toUpperCase());

    const marketImplications =
      typeof obj.market_implications === "string"
        ? obj.market_implications
        : "";

    const sourceArticleIndices = obj.source_article_indices.filter(
      (n): n is number => typeof n === "number",
    );

    return {
      headline,
      summary,
      category,
      impact_level: impactLevel,
      affected_sectors: affectedSectors,
      affected_tickers: affectedTickers,
      sentiment,
      sentiment_score: sentimentScore,
      key_points: keyPoints,
      market_implications: marketImplications,
      source_article_indices: sourceArticleIndices,
    };
  });

export type ValidatedNewsEntry = NonNullable<
  z.output<typeof filteredNewsEntrySchema>
>;

// ── Memory curator: NewThemeEntry schema ──────────────────────────────
// Mirrors: memory-curator.ts validateNewThemes()

const MEMORY_CATEGORIES = [
  "macro", "geopolitical", "policy", "market", "crypto",
  "diplomatic", "sector", "earnings",
] as const;

const MEMORY_IMPACTS = ["critical", "high", "medium", "low"] as const;
const MEMORY_SENTIMENTS = ["bullish", "bearish", "neutral"] as const;

export const newThemeEntrySchema = z
  .object({
    theme: z.unknown().optional(),
    summary: z.unknown().optional(),
    key_facts: z.array(z.unknown()).optional().default([]),
    category: z.unknown().optional(),
    impact_level: z.unknown().optional(),
    affected_sectors: z.array(z.unknown()).optional().default([]),
    affected_tickers: z.array(z.unknown()).optional().default([]),
    market_implications: z.unknown().optional(),
    sentiment: z.unknown().optional(),
    sentiment_score: z.unknown().optional(),
    news_one_liner: z.unknown().optional(),
  })
  .passthrough()
  .transform((obj) => {
    const theme = typeof obj.theme === "string" ? obj.theme.trim() : null;
    const summary = typeof obj.summary === "string" ? obj.summary.trim() : null;
    if (!theme || !summary) return null;

    const keyFacts = obj.key_facts.filter(
      (s): s is string => typeof s === "string",
    );
    if (keyFacts.length === 0) return null;

    const category = MEMORY_CATEGORIES.includes(
      String(obj.category) as (typeof MEMORY_CATEGORIES)[number],
    )
      ? String(obj.category)
      : "market";

    const impactLevel = MEMORY_IMPACTS.includes(
      String(obj.impact_level) as (typeof MEMORY_IMPACTS)[number],
    )
      ? String(obj.impact_level)
      : "medium";

    const affectedSectors = obj.affected_sectors.filter(
      (s): s is string => typeof s === "string",
    );
    const affectedTickers = obj.affected_tickers
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.toUpperCase());

    const marketImplications =
      typeof obj.market_implications === "string"
        ? obj.market_implications
        : "";

    const sentiment = MEMORY_SENTIMENTS.includes(
      String(obj.sentiment) as (typeof MEMORY_SENTIMENTS)[number],
    )
      ? String(obj.sentiment)
      : "neutral";

    const sentimentScore =
      typeof obj.sentiment_score === "number"
        ? Math.max(-1, Math.min(1, obj.sentiment_score))
        : 0;

    // Prompt says max 140 chars, code clamps at 200. Preserving current behavior.
    // TODO: align prompt and code on a single cap.
    const newsOneLiner =
      typeof obj.news_one_liner === "string"
        ? obj.news_one_liner.slice(0, 200)
        : "";

    return {
      theme,
      summary,
      key_facts: keyFacts,
      category,
      impact_level: impactLevel,
      affected_sectors: affectedSectors,
      affected_tickers: affectedTickers,
      market_implications: marketImplications,
      sentiment,
      sentiment_score: sentimentScore,
      news_one_liner: newsOneLiner,
    };
  });

export type ValidatedNewTheme = NonNullable<
  z.output<typeof newThemeEntrySchema>
>;

// ── Memory curator: ThemeUpdateEntry schema ───────────────────────────
// Mirrors: memory-curator.ts validateUpdates()

export const themeUpdateEntrySchema = z
  .object({
    theme_id: z.unknown().optional(),
    updated_summary: z.unknown().optional(),
    new_facts: z.array(z.unknown()).optional().default([]),
    updated_impact: z.unknown().optional(),
    updated_relevance: z.unknown().optional(),
    updated_sentiment: z.unknown().optional(),
    updated_sentiment_score: z.unknown().optional(),
    updated_one_liner: z.unknown().optional(),
  })
  .passthrough()
  .transform((obj) => {
    const themeId =
      typeof obj.theme_id === "string" ? obj.theme_id : null;
    const updatedSummary =
      typeof obj.updated_summary === "string" ? obj.updated_summary : null;
    if (!themeId || !updatedSummary) return null;

    const newFacts = obj.new_facts.filter(
      (s): s is string => typeof s === "string",
    );

    const updatedImpact = MEMORY_IMPACTS.includes(
      String(obj.updated_impact) as (typeof MEMORY_IMPACTS)[number],
    )
      ? String(obj.updated_impact)
      : "medium";

    const updatedRelevance =
      typeof obj.updated_relevance === "number"
        ? Math.max(0, Math.min(1, obj.updated_relevance))
        : 0.8;

    const updatedSentiment = MEMORY_SENTIMENTS.includes(
      String(obj.updated_sentiment) as (typeof MEMORY_SENTIMENTS)[number],
    )
      ? String(obj.updated_sentiment)
      : undefined;

    const updatedSentimentScore =
      typeof obj.updated_sentiment_score === "number"
        ? Math.max(-1, Math.min(1, obj.updated_sentiment_score))
        : undefined;

    // Same 200-char cap as new themes.
    const updatedOneLiner =
      typeof obj.updated_one_liner === "string"
        ? obj.updated_one_liner.slice(0, 200)
        : undefined;

    return {
      theme_id: themeId,
      new_facts: newFacts,
      updated_summary: updatedSummary,
      updated_impact: updatedImpact,
      updated_relevance: updatedRelevance,
      updated_sentiment: updatedSentiment,
      updated_sentiment_score: updatedSentimentScore,
      updated_one_liner: updatedOneLiner,
    };
  });

export type ValidatedThemeUpdate = NonNullable<
  z.output<typeof themeUpdateEntrySchema>
>;

// ── Batch parse helpers ───────────────────────────────────────────────

export function validateNewsEntries(
  rawItems: unknown[],
): ValidatedNewsEntry[] {
  const results: ValidatedNewsEntry[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    try {
      const parsed = filteredNewsEntrySchema.parse(item);
      if (parsed !== null) results.push(parsed);
    } catch {
      // Malformed entry — skip silently (caller logs via FastifyBaseLogger)
    }
  }
  return results;
}

export function validateNewThemes(
  raw: unknown,
): ValidatedNewTheme[] {
  if (!Array.isArray(raw)) return [];
  const results: ValidatedNewTheme[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    try {
      const parsed = newThemeEntrySchema.parse(item);
      if (parsed !== null) results.push(parsed);
    } catch {
      // skip
    }
  }
  return results;
}

export function validateThemeUpdates(
  raw: unknown,
): ValidatedThemeUpdate[] {
  if (!Array.isArray(raw)) return [];
  const results: ValidatedThemeUpdate[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    try {
      const parsed = themeUpdateEntrySchema.parse(item);
      if (parsed !== null) results.push(parsed);
    } catch {
      // skip
    }
  }
  return results;
}
