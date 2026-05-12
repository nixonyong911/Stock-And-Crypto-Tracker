import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import {
  validateNewThemes as zodValidateNewThemes,
  validateThemeUpdates as zodValidateThemeUpdates,
} from "./llm-schemas.js";
import {
  MEMORY_CURATOR_PROMPT_VERSION,
  MEMORY_CURATOR_VALIDATOR_VERSION,
  validateTickersAgainstUniverse,
} from "./provenance.js";
import { computeMemoryPrimary } from "./primary-ticker.js";
import {
  sanitizeAffectedTickers,
  getSanitizeBroadTickersEnabled,
  getResanitizeOnUpdateEnabled,
  getActiveBroadSet,
} from "./ticker-sanitizer.js";

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

export interface FilteredStory {
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
  // Slice 2: deterministic primary-subject ticker from the upstream story
  // (filled by news-processor from MarketAux entities). NULL when no signal
  // was available at story-write time. Used here to derive the theme's
  // batch_heuristic primary; never re-derived or mutated downstream.
  primary_ticker: string | null;
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
  news_one_liner: string;
}

export interface ThemeUpdateEntry {
  theme_id: string;
  new_facts: string[];
  updated_summary: string;
  updated_impact: string;
  updated_relevance: number;
  updated_sentiment?: string;
  updated_sentiment_score?: number;
  updated_one_liner?: string;
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
  /** When true (default), run one LLM batch at a time to reduce rate limits and load. */
  sequentialBatches?: boolean;
  /** When true, log larger stderr previews from cursor-agent failures. */
  verboseCuratorLogs?: boolean;
  /** Max characters of error text in Telegram FAILED alerts (default 2000, capped at 3500). */
  curatorTelegramErrorMaxChars?: number;
  /** Per-batch `cursor-agent` timeout in ms (default 360_000). */
  llmTimeoutMs?: number;
  /** Max stories loaded from `analysis_filtered_news` for one curation run (default 25). */
  maxStoriesForCurator?: number;
  /** Max stories per LLM batch (default 10). */
  maxStoriesPerBatch?: number;
}

// ── Constants ─────────────────────────────────────────────────────────

const CURATOR_LOCK_KEY = "memory:curator:lock";
const CURATOR_LOCK_TTL_MIN = 900; // baseline — dynamic TTL extends for sequential batches
/** Default per-batch `cursor-agent` ceiling (override with `CURATOR_LLM_TIMEOUT_MS` / deps). */
export const DEFAULT_CURATOR_LLM_TIMEOUT_MS = 360_000;
const CURATOR_LOCK_TTL_MAX = 3600; // 1 h ceiling
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const ACTIVE_THEME_CAP = 50;
const ACTIVE_THEME_TARGET = 45;
const DECAY_GRACE_DAYS = 7;
const DECAY_RATE = 0.92;
const FADING_THRESHOLD = 0.3;
const ARCHIVE_THRESHOLD = 0.1;
const FILTERED_LOOKBACK_HOURS = 3;
const MAX_STORIES_FOR_CURATOR = 25;
const MAX_STORIES_PER_BATCH = 10;

/** Redis lock TTL: long enough for all batches (sequential = sum of per-batch ceilings). */
export function computeCuratorLockTtlSeconds(
  batchCount: number,
  sequentialBatches: boolean,
  perBatchTimeoutMs: number = DEFAULT_CURATOR_LLM_TIMEOUT_MS,
): number {
  const perBatchSec = Math.ceil(perBatchTimeoutMs / 1000);
  const waveSec = sequentialBatches
    ? Math.max(1, batchCount) * perBatchSec
    : perBatchSec;
  const padded = 120 + waveSec;
  return Math.min(CURATOR_LOCK_TTL_MAX, Math.max(CURATOR_LOCK_TTL_MIN, padded));
}

// ── Main entry point ──────────────────────────────────────────────────

export async function curateMarketMemory(
  deps: CuratorDeps,
): Promise<CuratorResult> {
  const { db, redis, log, curatorModel, telegramNotify } = deps;
  const startTime = Date.now();
  const sequentialBatches = deps.sequentialBatches !== false;
  const verboseCuratorLogs = deps.verboseCuratorLogs === true;
  const stderrCap = verboseCuratorLogs ? 12_000 : 500;
  const telegramErrorMaxChars = Math.min(
    3500,
    Math.max(200, deps.curatorTelegramErrorMaxChars ?? 2000),
  );
  const notifyOpts = { telegramErrorMaxChars };
  const llmTimeoutMs = Math.min(
    900_000,
    Math.max(60_000, deps.llmTimeoutMs ?? DEFAULT_CURATOR_LLM_TIMEOUT_MS),
  );
  const maxStoriesCap = Math.min(
    50,
    Math.max(5, deps.maxStoriesForCurator ?? MAX_STORIES_FOR_CURATOR),
  );
  let maxPerBatch = Math.min(
    20,
    Math.max(3, deps.maxStoriesPerBatch ?? MAX_STORIES_PER_BATCH),
  );
  maxPerBatch = Math.min(maxPerBatch, Math.max(1, maxStoriesCap));

  try {
    const existingThemes = await fetchActiveThemes(db);
    const recentStories = await fetchRecentFilteredNews(db, maxStoriesCap);

    if (recentStories.length === 0) {
      log.info("No recent filtered stories for memory curation");
      const activeCount = existingThemes.filter((t) => t.status === "active").length;
      const result: CuratorResult = {
        newThemes: 0, updatedThemes: 0, decayedThemes: 0,
        archivedThemes: 0, activeThemes: activeCount,
        processingTimeMs: Date.now() - startTime,
      };
      await notifyCurator(telegramNotify, result, notifyOpts);
      return result;
    }

    const batches = chunkArray(recentStories, maxPerBatch);
    const lockTtlSec = computeCuratorLockTtlSeconds(
      batches.length, sequentialBatches, llmTimeoutMs,
    );
    const locked = await redis.set(
      CURATOR_LOCK_KEY, "1", "EX", lockTtlSec, "NX",
    );
    if (locked !== "OK") {
      log.info("Memory curator skipped — another run is in progress");
      return {
        newThemes: 0, updatedThemes: 0, decayedThemes: 0,
        archivedThemes: 0, activeThemes: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    const runId = randomUUID();
    log.info(
      {
        curatorRunId: runId,
        themes: existingThemes.length,
        stories: recentStories.length,
        batches: batches.length,
        storiesPerBatch: batches.map((b) => b.length),
        sequentialBatches,
        lockTtlSec,
        llmTimeoutMs,
        maxStoriesForCurator: maxStoriesCap,
        maxStoriesPerBatch: maxPerBatch,
      },
      "Running memory curator in batches",
    );

    try {
      const successfulOutputs: CuratorOutput[] = [];
      const batchFailureMessages: string[] = [];

      if (sequentialBatches) {
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i]!;
          try {
            const out = await runCuratorLLM(
              existingThemes, batch, curatorModel, log, stderrCap, llmTimeoutMs,
            );
            successfulOutputs.push(out);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            batchFailureMessages.push(`batch[${i}]: ${msg}`);
            log.error({ err, batchIndex: i, curatorRunId: runId }, "Curator batch failed");
          }
        }
      } else {
        const batchResults = await Promise.allSettled(
          batches.map((batch) =>
            runCuratorLLM(
              existingThemes, batch, curatorModel, log, stderrCap, llmTimeoutMs,
            ),
          ),
        );

        for (let i = 0; i < batchResults.length; i++) {
          const r = batchResults[i]!;
          if (r.status === "fulfilled") {
            successfulOutputs.push(r.value);
          } else {
            const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
            batchFailureMessages.push(`batch[${i}]: ${msg}`);
            log.error(
              { err: r.reason, batchIndex: i, curatorRunId: runId },
              "Curator batch failed",
            );
          }
        }
      }

      if (successfulOutputs.length === 0) {
        const detail = batchFailureMessages.length > 0
          ? ` Details: ${batchFailureMessages.join(" | ")}`
          : "";
        throw new Error(
          `All ${batches.length} curator batches failed.${detail}`,
        );
      }

      const curatorOutput = mergeBatchResults(
        successfulOutputs, existingThemes, log,
      );
      const generatedAt = new Date().toISOString();

      resolveThemeIds(curatorOutput, existingThemes, log);

      const allNewTickers = [
        ...new Set(curatorOutput.new_themes.flatMap((t) => t.affected_tickers)),
      ];
      const tickerValidation = await validateTickersAgainstUniverse(db, allNewTickers);
      const unknownTickerSet = new Set(tickerValidation.unknown);

      const batchIds = [...new Set(recentStories.map((s) => s.batch_id))];
      const priceSnapshot = await snapshotTickerPrices(db, curatorOutput, log);

      const applied = await applyChanges(
        db, curatorOutput, batchIds, priceSnapshot, log,
        { modelName: curatorModel, generatedAt, unknownTickerSet },
        recentStories,
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

      log.info({ ...result, curatorRunId: runId }, "Memory curation complete");
      await notifyCurator(telegramNotify, result, notifyOpts);
      return result;
    } finally {
      await redis.del(CURATOR_LOCK_KEY).catch(() => {});
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    log.error(
      { err, memoryCurationErrorMessage: errorMsg, stack },
      "Memory curation failed",
    );
    const result: CuratorResult = {
      newThemes: 0, updatedThemes: 0, decayedThemes: 0,
      archivedThemes: 0, activeThemes: 0,
      processingTimeMs: Date.now() - startTime,
      error: errorMsg,
    };
    await notifyCurator(telegramNotify, result, notifyOpts);
    throw err;
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

async function fetchRecentFilteredNews(
  db: Pool,
  limit: number,
): Promise<FilteredStory[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const { rows } = await db.query<FilteredStory>(
    `SELECT headline, summary, category, impact_level, sentiment,
            sentiment_score, key_points, affected_tickers, affected_sectors,
            market_implications, batch_id::text,
            primary_ticker
     FROM analysis_filtered_news
     WHERE processed_at >= NOW() - INTERVAL '${FILTERED_LOOKBACK_HOURS} hours'
     ORDER BY processed_at DESC
     LIMIT ${safeLimit}`,
  );
  return rows;
}

// ── Batching utilities ────────────────────────────────────────────────

export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size < 1) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function buildCompactThemeList(
  themes: MemoryTheme[],
): Record<string, unknown>[] {
  return themes.map((t) => ({
    theme_id: t.theme_id,
    theme: t.theme,
    category: t.category,
    impact_level: t.impact_level,
    summary: t.summary,
    affected_tickers: t.affected_tickers,
    relevance_score: t.relevance_score,
    update_count: t.update_count,
  }));
}

// ── LLM curator call ──────────────────────────────────────────────────

export function buildBatchCuratorPrompt(
  themes: MemoryTheme[],
  stories: FilteredStory[],
): string {
  const themesJson = buildCompactThemeList(themes);

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

You are processing a BATCH of articles (not the full set). Only create new themes or updates based on evidence in THIS batch.

## Current Active Themes (existing memory — compact view)
${JSON.stringify(themesJson, null, 2)}

## New Processed Articles (this batch)
${JSON.stringify(storiesJson, null, 2)}

## Instructions

Analyze the articles against existing themes. Output a JSON object with:

1. "new_themes": Genuinely new themes not covered by existing ones. Each entry:
   { "theme", "summary", "key_facts" (array), "category", "impact_level", "affected_sectors" (array), "affected_tickers" (array), "market_implications", "sentiment" (bullish/bearish/neutral), "sentiment_score" (-1.0 to 1.0), "news_one_liner" }

2. "updates": Updates to existing themes reinforced by new evidence in this batch. Each entry:
   { "theme_id", "new_facts" (array of new bullet points), "updated_summary" (rewritten summary incorporating new evidence), "updated_impact" (reassessed level), "updated_relevance" (0-1, increase if reinforced), "updated_sentiment" (bullish/bearish/neutral), "updated_sentiment_score" (-1.0 to 1.0), "updated_one_liner" }

Do NOT include a "decay" section — decay is handled separately after all batches are merged.

RULES:
- Deduplicate: merge similar articles into a single theme, never create two themes for the same event
- Categories: macro, geopolitical, policy, market, crypto, diplomatic, sector, earnings
- Impact levels: critical, high, medium, low
- affected_tickers: uppercase symbols only. Include only the tickers that are the SUBJECT of the article — i.e. the company, asset, or platform instrument the article is materially about. Do not include broad index proxies (SPX500, NSDQ100, DJ30, SPY, QQQ, DIA, IWM, VTI, VOO) or macro proxies (GOLD, OIL, NATGAS, BTC, BTC/USD, ETH, ETH/USD) just because the article references the broader market. Include them only if the article is itself ABOUT that index or commodity. Format: equities as AAPL/NVDA, platform crypto as BTC or BTC/USD (match the tradable symbol), platform indices as SPX500/NSDQ100/DJ30/RTY, platform commodities as OIL/GOLD/NATGAS.
- relevance_score: 0.0 to 1.0 — increase for themes with strong new evidence, keep stable otherwise
- For updates: only include themes that have genuinely new information, not just restatements
- Think carefully about second-order effects (e.g., oil shock → inflation → Fed policy implications)
- news_one_liner / updated_one_liner: A single plain-language sentence (max 140 chars) explaining what is happening and why it matters to investors in the affected tickers (stocks, crypto, indices, or commodities). Use cause-and-effect language. Example: "Tech stocks face selling pressure as large ETFs shift more weight into the sector."

Output ONLY valid JSON, no markdown fences.`;
}

async function runCuratorLLM(
  themes: MemoryTheme[],
  stories: FilteredStory[],
  model: string,
  log: FastifyBaseLogger,
  stderrMaxChars: number,
  llmTimeoutMs: number,
): Promise<CuratorOutput> {
  const prompt = buildBatchCuratorPrompt(themes, stories);

  const args = ["cursor-agent", "-p", prompt, "--model", model, "--trust"];
  const apiKey = process.env["CURSOR_API_KEY"];
  if (apiKey) args.push("--api-key", apiKey);

  const stderrCap = Math.max(200, Math.min(20_000, stderrMaxChars));

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const getStderr = () =>
      Buffer.concat(stderrChunks).toString("utf-8").replace(ANSI_RE, "").trim().slice(0, stderrCap);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch { /* already dead */ }
      const stderr = getStderr();
      reject(new Error(`Curator LLM call timed out${stderr ? ` | stderr: ${stderr}` : ""}`));
    }, llmTimeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

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
        const stderr = getStderr();
        reject(new Error(`cursor-agent exited with code ${code}${stderr ? ` | stderr: ${stderr}` : ""}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString("utf-8").replace(ANSI_RE, "").trim());
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

  const newThemes = zodValidateNewThemes(parsed["new_themes"]);
  const updates = zodValidateThemeUpdates(parsed["updates"]);
  const decay = validateDecay(parsed["decay"], log);
  const reasoning = typeof parsed["reasoning"] === "string" ? parsed["reasoning"] : undefined;

  return { new_themes: newThemes, updates, decay, reasoning };
}

// validateNewThemes and validateUpdates replaced by Zod-based validation
// in llm-schemas.ts (imported as zodValidateNewThemes / zodValidateThemeUpdates).

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

// ── Merge batch results ──────────────────────────────────────────────

export function mergeBatchResults(
  results: CuratorOutput[],
  themes: MemoryTheme[],
  log: FastifyBaseLogger,
): CuratorOutput {
  const seenThemeNames = new Set<string>();
  const newThemes: NewThemeEntry[] = [];
  for (const result of results) {
    for (const nt of result.new_themes) {
      const key = nt.theme.toLowerCase().trim();
      if (!seenThemeNames.has(key)) {
        seenThemeNames.add(key);
        newThemes.push(nt);
      } else {
        log.debug({ theme: nt.theme }, "Deduplicated new theme across batches");
      }
    }
  }

  const updateMap = new Map<string, ThemeUpdateEntry>();
  for (const result of results) {
    for (const upd of result.updates) {
      const existing = updateMap.get(upd.theme_id);
      if (existing) {
        existing.new_facts = [...existing.new_facts, ...upd.new_facts];
        existing.updated_summary = upd.updated_summary;
        existing.updated_relevance = Math.max(existing.updated_relevance, upd.updated_relevance);
        if (upd.updated_sentiment) existing.updated_sentiment = upd.updated_sentiment;
        if (upd.updated_sentiment_score !== undefined) {
          existing.updated_sentiment_score = upd.updated_sentiment_score;
        }
        if (upd.updated_one_liner) existing.updated_one_liner = upd.updated_one_liner;
      } else {
        updateMap.set(upd.theme_id, { ...upd, new_facts: [...upd.new_facts] });
      }
    }
  }

  const updatedIds = new Set(updateMap.keys());
  const decay: ThemeDecayEntry[] = themes
    .filter((t) => !updatedIds.has(t.theme_id))
    .map((t) => ({ theme_id: t.theme_id, reason: "No new evidence in batch" }));

  log.info(
    { newThemes: newThemes.length, updates: updateMap.size, decay: decay.length },
    "Merged batch results",
  );

  return { new_themes: newThemes, updates: [...updateMap.values()], decay };
}

// ── Resolve truncated theme IDs ───────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveThemeIds(
  output: CuratorOutput,
  themes: MemoryTheme[],
  log: FastifyBaseLogger,
): void {
  const themeMap = new Map(themes.map((t) => [t.theme_id, t.theme_id]));
  for (const t of themes) themeMap.set(t.theme_id.split("-")[0]!, t.theme_id);

  const resolve = (id: string): string | null => {
    if (UUID_RE.test(id)) return id;
    const match = themeMap.get(id) ?? themes.find((t) => t.theme_id.startsWith(id))?.theme_id;
    if (match) {
      log.debug({ truncated: id, resolved: match }, "Resolved truncated theme_id");
      return match;
    }
    log.warn({ themeId: id }, "Could not resolve truncated theme_id");
    return null;
  };

  output.updates = output.updates.filter((u) => {
    const full = resolve(u.theme_id);
    if (!full) return false;
    u.theme_id = full;
    return true;
  });

  output.decay = output.decay.filter((d) => {
    const full = resolve(d.theme_id);
    if (!full) return false;
    d.theme_id = full;
    return true;
  });
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

export interface ProvenanceContext {
  modelName: string;
  generatedAt: string;
  unknownTickerSet: Set<string>;
}

// Exported for testability. Production callers go through curateMarketMemory.
export async function applyChanges(
  db: Pool,
  output: CuratorOutput,
  batchIds: string[],
  priceSnapshot: Record<string, number>,
  log: FastifyBaseLogger,
  provenance: ProvenanceContext,
  // Slice 2: full batch's filtered-news stories (carrying their own
  // primary_ticker) — used to derive each new theme's batch_heuristic
  // primary_ticker at INSERT time. Not consumed on the UPDATE / decay paths.
  batchStories: ReadonlyArray<FilteredStory>,
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

      // Slice 2: derive primary_ticker from RAW affected_tickers (before sanitization).
      const memoryPrimary = computeMemoryPrimary(
        nt.affected_tickers,
        batchStories.map((s) => ({
          affected_tickers: s.affected_tickers,
          primary_ticker: s.primary_ticker,
        })),
      );

      // Slice 5: remove unevidenced broad-index boilerplate from affected_tickers.
      const storyTickerProjection = batchStories.map((s) => ({
        affected_tickers: s.affected_tickers,
      }));
      const sanitization = getSanitizeBroadTickersEnabled()
        ? sanitizeAffectedTickers(nt.affected_tickers, storyTickerProjection)
        : { kept: [...nt.affected_tickers], inferred: [] as string[] };

      // Slice 8C: null primary if the sanitizer dropped it from kept.
      const coherentPrimary =
        memoryPrimary.primary_ticker &&
        !sanitization.kept.includes(memoryPrimary.primary_ticker)
          ? { primary_ticker: null, primary_ticker_source: null }
          : memoryPrimary;

      const tickerPrices: Record<string, number> = {};
      for (const tk of sanitization.kept) {
        if (priceSnapshot[tk] !== undefined) tickerPrices[tk] = priceSnapshot[tk];
      }
      const tickersUnknown = sanitization.kept.filter((t) =>
        provenance.unknownTickerSet.has(t),
      );

      await client.query(
        `INSERT INTO analysis_market_memory
         (theme_id, theme, status, summary, key_facts, category, impact_level,
          relevance_score, affected_sectors, affected_tickers, market_implications,
          sentiment, sentiment_score,
          first_observed, last_updated, update_count, source_batch_ids,
          price_snapshot_at, ticker_prices_at_creation, news_one_liner,
          model_name, prompt_version, validator_version, generated_at, tickers_unknown,
          primary_ticker, primary_ticker_source, tickers_inferred)
         VALUES ($1,$2,'active',$3,$4,$5,$6,1.000,$7,$8,$9,$10,$11,$12,$12,1,$13,$12,$14,$15,
                 $16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          themeId, nt.theme, nt.summary, nt.key_facts, nt.category,
          nt.impact_level, nt.affected_sectors, sanitization.kept,
          nt.market_implications, nt.sentiment, nt.sentiment_score,
          now, batchIds, JSON.stringify(tickerPrices), nt.news_one_liner || null,
          provenance.modelName,
          MEMORY_CURATOR_PROMPT_VERSION,
          MEMORY_CURATOR_VALIDATOR_VERSION,
          provenance.generatedAt,
          tickersUnknown,
          coherentPrimary.primary_ticker,
          coherentPrimary.primary_ticker_source,
          sanitization.inferred,
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
        "model_name = $8", "prompt_version = $9",
        "validator_version = $10", "generated_at = $11",
      ];
      const params: unknown[] = [
        upd.theme_id, upd.updated_summary, upd.updated_impact,
        upd.updated_relevance, upd.new_facts, now, batchIds,
        provenance.modelName,
        MEMORY_CURATOR_PROMPT_VERSION,
        MEMORY_CURATOR_VALIDATOR_VERSION,
        provenance.generatedAt,
      ];
      if (upd.updated_sentiment) {
        params.push(upd.updated_sentiment);
        setClauses.push(`sentiment = $${params.length}`);
      }
      if (upd.updated_sentiment_score !== undefined) {
        params.push(upd.updated_sentiment_score);
        setClauses.push(`sentiment_score = $${params.length}`);
      }
      if (upd.updated_one_liner) {
        params.push(upd.updated_one_liner);
        setClauses.push(`news_one_liner = $${params.length}`);
      }

      // Slice 9: re-sanitize the existing row's affected_tickers on UPDATE.
      if (
        getResanitizeOnUpdateEnabled() &&
        getSanitizeBroadTickersEnabled() &&
        batchStories.length > 0
      ) {
        try {
          const { rows: existingRows } = await client.query<{
            affected_tickers: string[];
            primary_ticker: string | null;
            primary_ticker_source: string | null;
          }>(
            `SELECT affected_tickers, primary_ticker, primary_ticker_source
             FROM analysis_market_memory WHERE theme_id = $1 FOR UPDATE`,
            [upd.theme_id],
          );
          const existingRow = existingRows[0];

          if (existingRow && existingRow.affected_tickers.length > 0) {
            const storyProj = batchStories.map((s) => ({
              affected_tickers: s.affected_tickers,
            }));
            const san = sanitizeAffectedTickers(existingRow.affected_tickers, storyProj);

            const broadSet = getActiveBroadSet();
            const hadNonBroad = existingRow.affected_tickers.some(
              (t) => !broadSet.has(t.toUpperCase()),
            );
            const erasureTriggered = san.kept.length === 0 && hadNonBroad;

            const sortedKept = [...san.kept].sort();
            const sortedExisting = [...existingRow.affected_tickers]
              .map((t) => t.toUpperCase())
              .sort();
            const isIdentity =
              san.inferred.length === 0 &&
              sortedKept.length === sortedExisting.length &&
              sortedKept.every((t, i) => t === sortedExisting[i]);

            if (erasureTriggered) {
              log.warn(
                { themeId: upd.theme_id },
                "Slice 9: erasure guard — sanitizer emptied kept for row with non-broad tickers; skipping",
              );
            } else if (!isIdentity) {
              params.push(san.kept);
              setClauses.push(`affected_tickers = $${params.length}`);
              params.push(san.inferred);
              setClauses.push(`tickers_inferred = $${params.length}`);

              if (
                existingRow.primary_ticker &&
                !san.kept.includes(existingRow.primary_ticker)
              ) {
                params.push(null);
                setClauses.push(`primary_ticker = $${params.length}`);
                params.push(null);
                setClauses.push(`primary_ticker_source = $${params.length}`);
              }
            }
          }
        } catch (resanErr) {
          log.warn(
            { themeId: upd.theme_id, err: resanErr },
            "Slice 9: UPDATE-path sanitization failed; falling through to legacy update",
          );
        }
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

export function formatCuratorNotification(
  result: CuratorResult,
  opts?: { telegramErrorMaxChars?: number },
): string {
  const maxErr = Math.min(
    3500,
    Math.max(200, opts?.telegramErrorMaxChars ?? 2000),
  );
  if (result.error) {
    return `<b>Memory Curator: FAILED</b>\n${escapeHtml(result.error.slice(0, maxErr))}\nTime: ${new Date().toISOString()}`;
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
  opts?: { telegramErrorMaxChars?: number },
): Promise<void> {
  if (!telegramNotify) return;
  try {
    await telegramNotify(formatCuratorNotification(result, opts));
  } catch {
    // Best-effort
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
