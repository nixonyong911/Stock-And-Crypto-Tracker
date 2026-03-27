import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";

// ── Types ─────────────────────────────────────────────────────────────

export interface MemoryTheme {
  theme_id: string;
  theme: string;
  status: string;
  summary: string;
  key_facts: string[];
  category: string;
  impact_level: string;
  relevance_score: number;
  affected_sectors: string[];
  affected_tickers: string[];
  market_implications: string;
  first_observed: string;
  last_updated: string;
  update_count: number;
}

interface FilteredStory {
  headline: string;
  summary: string;
  category: string;
  impact_level: string;
  sentiment: string;
  sentiment_score: number;
  key_points: string[];
  affected_tickers: string[];
  affected_sectors: string[];
  market_implications: string;
  batch_id: string;
}

export interface CuratorOutput {
  new_themes: NewThemeEntry[];
  updates: ThemeUpdateEntry[];
  decay: ThemeDecayEntry[];
  reasoning?: string;
}

export interface NewThemeEntry {
  theme: string;
  summary: string;
  key_facts: string[];
  category: string;
  impact_level: string;
  affected_sectors: string[];
  affected_tickers: string[];
  market_implications: string;
  sentiment: string;
  sentiment_score: number;
}

export interface ThemeUpdateEntry {
  theme_id: string;
  new_facts: string[];
  updated_summary: string;
  updated_impact: string;
  updated_relevance: number;
  updated_sentiment?: string;
  updated_sentiment_score?: number;
}

export interface ThemeDecayEntry {
  theme_id: string;
  reason: string;
}

export interface CuratorResult {
  newThemes: number;
  updatedThemes: number;
  decayedThemes: number;
  archivedThemes: number;
  activeThemes: number;
  processingTimeMs: number;
  error?: string;
}

export interface CuratorDeps {
  db: Pool;
  redis: Redis;
  log: FastifyBaseLogger;
  curatorModel: string;
  telegramNotify?: (message: string) => Promise<void>;
}

// ── Constants ─────────────────────────────────────────────────────────

const CURATOR_LOCK_KEY = "memory:curator:lock";
const CURATOR_LOCK_TTL = 600; // 10 minutes
const LLM_TIMEOUT_MS = 300_000; // 5 minutes — thinking model with large theme+story context
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const ACTIVE_THEME_CAP = 50;
const ACTIVE_THEME_TARGET = 45;
const DECAY_GRACE_DAYS = 7;
const DECAY_RATE = 0.92;
const FADING_THRESHOLD = 0.3;
const ARCHIVE_THRESHOLD = 0.1;
const FILTERED_LOOKBACK_HOURS = 6;

// ── Main entry point ──────────────────────────────────────────────────

export async function curateMarketMemory(
  deps: CuratorDeps,
): Promise<CuratorResult> {
  const { db, redis, log, curatorModel, telegramNotify } = deps;
  const startTime = Date.now();

  try {
    const locked = await redis.set(
      CURATOR_LOCK_KEY, "1", "EX", CURATOR_LOCK_TTL, "NX",
    );
    if (locked !== "OK") {
      log.info("Memory curator skipped — another run is in progress");
      return {
        newThemes: 0, updatedThemes: 0, decayedThemes: 0,
        archivedThemes: 0, activeThemes: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    const existingThemes = await fetchActiveThemes(db);
    const recentStories = await fetchRecentFilteredNews(db);

    if (recentStories.length === 0) {
      log.info("No recent filtered stories for memory curation");
      const activeCount = existingThemes.filter((t) => t.status === "active").length;
      const result: CuratorResult = {
        newThemes: 0, updatedThemes: 0, decayedThemes: 0,
        archivedThemes: 0, activeThemes: activeCount,
        processingTimeMs: Date.now() - startTime,
      };
      await notifyCurator(telegramNotify, result);
      return result;
    }

    log.info(
      { themes: existingThemes.length, stories: recentStories.length },
      "Running memory curator",
    );

    const curatorOutput = await runCuratorLLM(
      existingThemes, recentStories, curatorModel, log,
    );

    const batchIds = [...new Set(recentStories.map((s) => s.batch_id))];
    const priceSnapshot = await snapshotTickerPrices(db, curatorOutput, log);

    const applied = await applyChanges(
      db, curatorOutput, batchIds, priceSnapshot, log,
    );

    const archivedFromCap = await enforceThemeCap(db, log);

    const result: CuratorResult = {
      newThemes: applied.newThemes,
      updatedThemes: applied.updatedThemes,
      decayedThemes: applied.decayedThemes,
      archivedThemes: applied.archivedThemes + archivedFromCap,
      activeThemes: await countActiveThemes(db),
      processingTimeMs: Date.now() - startTime,
    };

    log.info(result, "Memory curation complete");
    await notifyCurator(telegramNotify, result);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "Memory curation failed");
    const result: CuratorResult = {
      newThemes: 0, updatedThemes: 0, decayedThemes: 0,
      archivedThemes: 0, activeThemes: 0,
      processingTimeMs: Date.now() - startTime,
      error: errorMsg,
    };
    await notifyCurator(telegramNotify, result);
    throw err;
  } finally {
    await redis.del(CURATOR_LOCK_KEY).catch(() => {});
  }
}

// ── Fetch existing themes ─────────────────────────────────────────────

async function fetchActiveThemes(db: Pool): Promise<MemoryTheme[]> {
  const { rows } = await db.query<MemoryTheme>(
    `SELECT theme_id, theme, status, summary, key_facts, category,
            impact_level, relevance_score, affected_sectors, affected_tickers,
            market_implications, first_observed::text, last_updated::text, update_count
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')
     ORDER BY relevance_score DESC`,
  );
  return rows;
}

// ── Fetch recent filtered news ────────────────────────────────────────

async function fetchRecentFilteredNews(db: Pool): Promise<FilteredStory[]> {
  const { rows } = await db.query<FilteredStory>(
    `SELECT headline, summary, category, impact_level, sentiment,
            sentiment_score, key_points, affected_tickers, affected_sectors,
            market_implications, batch_id::text
     FROM analysis_filtered_news
     WHERE processed_at >= NOW() - INTERVAL '${FILTERED_LOOKBACK_HOURS} hours'
     ORDER BY processed_at DESC`,
  );
  return rows;
}

// ── LLM curator call ──────────────────────────────────────────────────

function buildCuratorPrompt(
  themes: MemoryTheme[],
  stories: FilteredStory[],
): string {
  const themesJson = themes.map((t) => ({
    theme_id: t.theme_id,
    theme: t.theme,
    status: t.status,
    summary: t.summary,
    key_facts: t.key_facts,
    category: t.category,
    impact_level: t.impact_level,
    relevance_score: t.relevance_score,
    affected_tickers: t.affected_tickers,
    affected_sectors: t.affected_sectors,
    first_observed: t.first_observed,
    last_updated: t.last_updated,
    update_count: t.update_count,
  }));

  const storiesJson = stories.map((s) => ({
    headline: s.headline,
    summary: s.summary,
    category: s.category,
    impact_level: s.impact_level,
    sentiment: s.sentiment,
    key_points: s.key_points,
    affected_tickers: s.affected_tickers,
    affected_sectors: s.affected_sectors,
    market_implications: s.market_implications,
  }));

  return `You are a Market Memory Curator. Your job is to maintain a set of market themes that represent the current state of global markets, acting like a human analyst's long-term memory.

## Current Active Themes (existing memory)
${JSON.stringify(themesJson, null, 2)}

## New Processed Articles (latest batch)
${JSON.stringify(storiesJson, null, 2)}

## Instructions

Analyze the new articles against existing themes. Output a JSON object with:

1. "new_themes": Genuinely new themes not covered by existing ones. Each entry:
   { "theme", "summary", "key_facts" (array), "category", "impact_level", "affected_sectors" (array), "affected_tickers" (array), "market_implications", "sentiment" (bullish/bearish/neutral), "sentiment_score" (-1.0 to 1.0) }

2. "updates": Updates to existing themes reinforced by new evidence. Each entry:
   { "theme_id", "new_facts" (array of new bullet points), "updated_summary" (rewritten summary), "updated_impact" (reassessed level), "updated_relevance" (0-1, increase if reinforced), "updated_sentiment" (bullish/bearish/neutral), "updated_sentiment_score" (-1.0 to 1.0) }

3. "decay": Existing themes with NO new supporting evidence in this batch. Each entry:
   { "theme_id", "reason" }

RULES:
- Deduplicate: merge similar articles into a single theme, never create two themes for the same event
- Categories: macro, geopolitical, policy, market, crypto, diplomatic, sector, earnings
- Impact levels: critical, high, medium, low
- Tickers must be uppercase stock symbols
- relevance_score: 0.0 to 1.0 — increase for themes with strong new evidence, keep stable otherwise
- For updates: only include themes that have genuinely new information, not just restatements
- For decay: only flag themes that received zero supporting evidence in this batch
- Think carefully about second-order effects (e.g., oil shock → inflation → Fed policy implications)

Output ONLY valid JSON, no markdown fences.`;
}

async function runCuratorLLM(
  themes: MemoryTheme[],
  stories: FilteredStory[],
  model: string,
  log: FastifyBaseLogger,
): Promise<CuratorOutput> {
  const prompt = buildCuratorPrompt(themes, stories);

  const args = ["cursor-agent", "-p", prompt, "--model", model, "--trust"];
  const apiKey = process.env["CURSOR_API_KEY"];
  if (apiKey) args.push("--api-key", apiKey);

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const chunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch { /* already dead */ }
      reject(new Error("Curator LLM call timed out"));
    }, LLM_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`cursor-agent exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf-8").replace(ANSI_RE, "").trim());
    });
  });

  return parseCuratorOutput(output, log);
}

// ── Parse LLM output ──────────────────────────────────────────────────

export function parseCuratorOutput(
  raw: string,
  log: FastifyBaseLogger,
): CuratorOutput {
  const empty: CuratorOutput = { new_themes: [], updates: [], decay: [] };

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    log.error(
      { rawLength: raw.length, preview: raw.slice(0, 300) },
      "No JSON object found in curator output",
    );
    return empty;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    log.error({ err, preview: jsonMatch[0].slice(0, 300) }, "Failed to parse curator JSON");
    return empty;
  }

  const newThemes = validateNewThemes(parsed["new_themes"], log);
  const updates = validateUpdates(parsed["updates"], log);
  const decay = validateDecay(parsed["decay"], log);
  const reasoning = typeof parsed["reasoning"] === "string" ? parsed["reasoning"] : undefined;

  return { new_themes: newThemes, updates, decay, reasoning };
}

function validateNewThemes(
  raw: unknown,
  log: FastifyBaseLogger,
): NewThemeEntry[] {
  if (!Array.isArray(raw)) return [];

  const validCategories = new Set([
    "macro", "geopolitical", "policy", "market", "crypto", "diplomatic", "sector", "earnings",
  ]);
  const validImpacts = new Set(["critical", "high", "medium", "low"]);

  const results: NewThemeEntry[] = [];
  for (const item of raw) {
    try {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;

      const theme = typeof obj["theme"] === "string" ? obj["theme"].trim() : null;
      const summary = typeof obj["summary"] === "string" ? obj["summary"].trim() : null;
      if (!theme || !summary) continue;

      const keyFacts = Array.isArray(obj["key_facts"])
        ? (obj["key_facts"] as unknown[]).filter((s): s is string => typeof s === "string")
        : [];
      if (keyFacts.length === 0) continue;

      const category = validCategories.has(String(obj["category"]))
        ? String(obj["category"])
        : "market";
      const impactLevel = validImpacts.has(String(obj["impact_level"]))
        ? String(obj["impact_level"])
        : "medium";

      const affectedSectors = Array.isArray(obj["affected_sectors"])
        ? (obj["affected_sectors"] as unknown[]).filter((s): s is string => typeof s === "string")
        : [];
      const affectedTickers = Array.isArray(obj["affected_tickers"])
        ? (obj["affected_tickers"] as unknown[]).filter((s): s is string => typeof s === "string")
            .map((s) => s.toUpperCase())
        : [];
      const marketImplications = typeof obj["market_implications"] === "string"
        ? obj["market_implications"]
        : "";

      const validSentiments = new Set(["bullish", "bearish", "neutral"]);
      const sentiment = validSentiments.has(String(obj["sentiment"]))
        ? String(obj["sentiment"])
        : "neutral";
      const sentimentScore = typeof obj["sentiment_score"] === "number"
        ? Math.max(-1, Math.min(1, obj["sentiment_score"]))
        : 0;

      results.push({
        theme, summary, key_facts: keyFacts, category,
        impact_level: impactLevel, affected_sectors: affectedSectors,
        affected_tickers: affectedTickers, market_implications: marketImplications,
        sentiment, sentiment_score: sentimentScore,
      });
    } catch (err) {
      log.warn({ err, item }, "Skipping invalid new theme entry");
    }
  }
  return results;
}

function validateUpdates(
  raw: unknown,
  log: FastifyBaseLogger,
): ThemeUpdateEntry[] {
  if (!Array.isArray(raw)) return [];
  const validImpacts = new Set(["critical", "high", "medium", "low"]);

  const results: ThemeUpdateEntry[] = [];
  for (const item of raw) {
    try {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;

      const themeId = typeof obj["theme_id"] === "string" ? obj["theme_id"] : null;
      const updatedSummary = typeof obj["updated_summary"] === "string" ? obj["updated_summary"] : null;
      if (!themeId || !updatedSummary) continue;

      const newFacts = Array.isArray(obj["new_facts"])
        ? (obj["new_facts"] as unknown[]).filter((s): s is string => typeof s === "string")
        : [];

      const updatedImpact = validImpacts.has(String(obj["updated_impact"]))
        ? String(obj["updated_impact"])
        : "medium";

      const updatedRelevance = typeof obj["updated_relevance"] === "number"
        ? Math.max(0, Math.min(1, obj["updated_relevance"]))
        : 0.8;

      const validSentiments = new Set(["bullish", "bearish", "neutral"]);
      const updatedSentiment = validSentiments.has(String(obj["updated_sentiment"]))
        ? String(obj["updated_sentiment"])
        : undefined;
      const updatedSentimentScore = typeof obj["updated_sentiment_score"] === "number"
        ? Math.max(-1, Math.min(1, obj["updated_sentiment_score"]))
        : undefined;

      results.push({
        theme_id: themeId, new_facts: newFacts, updated_summary: updatedSummary,
        updated_impact: updatedImpact, updated_relevance: updatedRelevance,
        updated_sentiment: updatedSentiment, updated_sentiment_score: updatedSentimentScore,
      });
    } catch (err) {
      log.warn({ err, item }, "Skipping invalid theme update entry");
    }
  }
  return results;
}

function validateDecay(
  raw: unknown,
  log: FastifyBaseLogger,
): ThemeDecayEntry[] {
  if (!Array.isArray(raw)) return [];

  const results: ThemeDecayEntry[] = [];
  for (const item of raw) {
    try {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;

      const themeId = typeof obj["theme_id"] === "string" ? obj["theme_id"] : null;
      if (!themeId) continue;

      const reason = typeof obj["reason"] === "string" ? obj["reason"] : "No new evidence";
      results.push({ theme_id: themeId, reason });
    } catch (err) {
      log.warn({ err, item }, "Skipping invalid decay entry");
    }
  }
  return results;
}

// ── Price snapshot ────────────────────────────────────────────────────

async function snapshotTickerPrices(
  db: Pool,
  output: CuratorOutput,
  log: FastifyBaseLogger,
): Promise<Record<string, number>> {
  const tickers = new Set<string>();
  for (const t of output.new_themes) {
    for (const tk of t.affected_tickers) tickers.add(tk);
  }
  if (tickers.size === 0) return {};

  try {
    const tickerArr = [...tickers];
    const prices: Record<string, number> = {};

    const { rows: targetRows } = await db.query<{ ticker_symbol: string; latest_close: number }>(
      `SELECT DISTINCT ON (ticker_symbol) ticker_symbol, latest_close
       FROM analysis_ticker_price_targets
       WHERE ticker_symbol = ANY($1) AND latest_close IS NOT NULL
       ORDER BY ticker_symbol, analysis_date DESC`,
      [tickerArr],
    );
    for (const r of targetRows) prices[r.ticker_symbol] = Number(r.latest_close);

    const remaining = tickerArr.filter((t) => !(t in prices));
    if (remaining.length > 0) {
      const { rows: cryptoRows } = await db.query<{ symbol: string; close_price: number }>(
        `SELECT DISTINCT ON (ct.symbol) ct.symbol, cp.close_price
         FROM crypto_prices cp
         JOIN crypto_tickers ct ON ct.id = cp.crypto_ticker_id
         WHERE ct.symbol = ANY($1)
         ORDER BY ct.symbol, cp.price_time DESC`,
        [remaining],
      );
      for (const r of cryptoRows) prices[r.symbol] = Number(r.close_price);
    }

    return prices;
  } catch (err) {
    log.warn({ err }, "Failed to snapshot ticker prices — non-fatal");
    return {};
  }
}

// ── Apply changes to DB ───────────────────────────────────────────────

async function applyChanges(
  db: Pool,
  output: CuratorOutput,
  batchIds: string[],
  priceSnapshot: Record<string, number>,
  log: FastifyBaseLogger,
): Promise<{ newThemes: number; updatedThemes: number; decayedThemes: number; archivedThemes: number }> {
  const client = await db.connect();
  let newThemes = 0;
  let updatedThemes = 0;
  let decayedThemes = 0;
  let archivedThemes = 0;

  try {
    await client.query("BEGIN");
    const now = new Date().toISOString();

    for (const nt of output.new_themes) {
      const themeId = randomUUID();
      const tickerPrices: Record<string, number> = {};
      for (const tk of nt.affected_tickers) {
        if (priceSnapshot[tk] !== undefined) tickerPrices[tk] = priceSnapshot[tk];
      }

      await client.query(
        `INSERT INTO analysis_market_memory
         (theme_id, theme, status, summary, key_facts, category, impact_level,
          relevance_score, affected_sectors, affected_tickers, market_implications,
          sentiment, sentiment_score,
          first_observed, last_updated, update_count, source_batch_ids,
          price_snapshot_at, ticker_prices_at_creation)
         VALUES ($1,$2,'active',$3,$4,$5,$6,1.000,$7,$8,$9,$10,$11,$12,$12,1,$13,$12,$14)`,
        [
          themeId, nt.theme, nt.summary, nt.key_facts, nt.category,
          nt.impact_level, nt.affected_sectors, nt.affected_tickers,
          nt.market_implications, nt.sentiment, nt.sentiment_score,
          now, batchIds, JSON.stringify(tickerPrices),
        ],
      );
      newThemes++;
    }

    for (const upd of output.updates) {
      const setClauses = [
        "summary = $2", "impact_level = $3", "relevance_score = $4",
        "key_facts = key_facts || $5", "last_updated = $6",
        "update_count = update_count + 1",
        "source_batch_ids = COALESCE(source_batch_ids, '{}') || $7::uuid[]",
        "status = 'active'",
      ];
      const params: unknown[] = [
        upd.theme_id, upd.updated_summary, upd.updated_impact,
        upd.updated_relevance, upd.new_facts, now, batchIds,
      ];
      if (upd.updated_sentiment) {
        params.push(upd.updated_sentiment);
        setClauses.push(`sentiment = $${params.length}`);
      }
      if (upd.updated_sentiment_score !== undefined) {
        params.push(upd.updated_sentiment_score);
        setClauses.push(`sentiment_score = $${params.length}`);
      }

      const result = await client.query(
        `UPDATE analysis_market_memory SET ${setClauses.join(", ")} WHERE theme_id = $1 RETURNING id`,
        params,
      );
      if (result.rowCount && result.rowCount > 0) updatedThemes++;
      else log.warn({ themeId: upd.theme_id }, "Update target theme not found");
    }

    for (const dec of output.decay) {
      const { rows } = await client.query<{ last_updated: Date; relevance_score: number }>(
        `SELECT last_updated, relevance_score FROM analysis_market_memory
         WHERE theme_id = $1 AND status IN ('active', 'fading')`,
        [dec.theme_id],
      );
      if (rows.length === 0) continue;

      const theme = rows[0]!;
      const daysSinceUpdate = (Date.now() - new Date(theme.last_updated).getTime()) / 86_400_000;

      if (daysSinceUpdate <= DECAY_GRACE_DAYS) {
        continue;
      }

      const newScore = Math.round(theme.relevance_score * DECAY_RATE * 1000) / 1000;
      let newStatus = "active";
      if (newScore < ARCHIVE_THRESHOLD) {
        newStatus = "archived";
        archivedThemes++;
      } else if (newScore < FADING_THRESHOLD) {
        newStatus = "fading";
      }

      await client.query(
        `UPDATE analysis_market_memory
         SET relevance_score = $2, status = $3
         WHERE theme_id = $1`,
        [dec.theme_id, newScore, newStatus],
      );
      decayedThemes++;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { newThemes, updatedThemes, decayedThemes, archivedThemes };
}

// ── Theme cap enforcement ─────────────────────────────────────────────

async function enforceThemeCap(db: Pool, log: FastifyBaseLogger): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM analysis_market_memory WHERE status = 'active'`,
  );

  const active = parseInt(rows[0]?.count ?? "0", 10);
  if (active <= ACTIVE_THEME_CAP) return 0;

  const excess = active - ACTIVE_THEME_TARGET;
  const { rowCount } = await db.query(
    `UPDATE analysis_market_memory
     SET status = 'archived'
     WHERE id IN (
       SELECT id FROM analysis_market_memory
       WHERE status = 'active'
       ORDER BY relevance_score ASC, last_updated ASC
       LIMIT $1
     )`,
    [excess],
  );

  const archived = rowCount ?? 0;
  if (archived > 0) {
    log.info({ archived, previousActive: active }, "Archived excess themes to enforce cap");
  }
  return archived;
}

// ── Count active themes ───────────────────────────────────────────────

async function countActiveThemes(db: Pool): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM analysis_market_memory WHERE status = 'active'`,
  );
  return parseInt(rows[0]?.count ?? "0", 10);
}

// ── Daily maintenance ─────────────────────────────────────────────────

export async function runDailyMemoryMaintenance(
  db: Pool,
  log: FastifyBaseLogger,
): Promise<{ decayed: number; archived: number; deleted: number }> {
  let decayed = 0;
  let archived = 0;
  let deleted = 0;

  try {
    const { rowCount: decayCount } = await db.query(
      `UPDATE analysis_market_memory
       SET relevance_score = ROUND((relevance_score * $1)::numeric, 3)
       WHERE status IN ('active', 'fading')
         AND last_updated < NOW() - INTERVAL '${DECAY_GRACE_DAYS} days'`,
      [DECAY_RATE],
    );
    decayed = decayCount ?? 0;

    const { rowCount: fadeCount } = await db.query(
      `UPDATE analysis_market_memory
       SET status = 'fading'
       WHERE status = 'active' AND relevance_score < $1`,
      [FADING_THRESHOLD],
    );

    const { rowCount: archiveCount } = await db.query(
      `UPDATE analysis_market_memory
       SET status = 'archived'
       WHERE status = 'fading' AND relevance_score < $1`,
      [ARCHIVE_THRESHOLD],
    );
    archived = (fadeCount ?? 0) + (archiveCount ?? 0);

    await enforceThemeCap(db, log);

    const { rowCount: deleteCount } = await db.query(
      `DELETE FROM analysis_market_memory
       WHERE status = 'archived'
         AND last_updated < NOW() - INTERVAL '90 days'`,
    );
    deleted = deleteCount ?? 0;

    log.info({ decayed, archived, deleted }, "Daily memory maintenance complete");
  } catch (err) {
    log.error({ err }, "Daily memory maintenance failed");
  }

  return { decayed, archived, deleted };
}

// ── Admin notification ────────────────────────────────────────────────

export function formatCuratorNotification(result: CuratorResult): string {
  if (result.error) {
    return `<b>Memory Curator: FAILED</b>\n${escapeHtml(result.error.slice(0, 200))}\nTime: ${new Date().toISOString()}`;
  }

  const parts: string[] = [];
  if (result.newThemes > 0) parts.push(`+${result.newThemes} new`);
  if (result.updatedThemes > 0) parts.push(`~${result.updatedThemes} updated`);
  if (result.decayedThemes > 0) parts.push(`↓${result.decayedThemes} decayed`);
  if (result.archivedThemes > 0) parts.push(`-${result.archivedThemes} archived`);
  parts.push(`${result.activeThemes} active`);

  return `<b>Memory Curator:</b> ${parts.join(", ")} (${(result.processingTimeMs / 1000).toFixed(1)}s)`;
}

async function notifyCurator(
  telegramNotify: ((msg: string) => Promise<void>) | undefined,
  result: CuratorResult,
): Promise<void> {
  if (!telegramNotify) return;
  try {
    await telegramNotify(formatCuratorNotification(result));
  } catch {
    // Best-effort
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
