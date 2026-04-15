import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import { curateMarketMemory } from "./memory-curator.js";

// ── Types ─────────────────────────────────────────────────────────────

interface RawArticle {
  source_api: string;
  external_id: string;
  title: string;
  description: string | null;
  published_at: string;
  search_category: string | null;
  sentiment_label: string | null;
}

export interface FilteredNewsEntry {
  headline: string;
  summary: string;
  category: string;
  impact_level: "high" | "medium" | "low";
  affected_sectors: string[];
  affected_tickers: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  sentiment_score: number;
  key_points: string[];
  market_implications: string;
  source_articles: Array<{
    source_api: string;
    external_id: string;
    title: string;
    published_at: string;
  }>;
}

export interface ProcessingResult {
  batchId: string;
  inputArticles: number;
  outputStories: number;
  highImpact: number;
  processingTimeMs: number;
  sourceBreakdown?: Record<string, number>;
  error?: string;
}

export interface NewsProcessorDeps {
  db: Pool;
  redis: Redis;
  log: FastifyBaseLogger;
  curatorModel?: string;
  telegramNotify?: (message: string) => Promise<void>;
  curatorSequentialBatches?: boolean;
  curatorVerboseLogs?: boolean;
  curatorTelegramErrorMaxChars?: number;
  curatorLlmTimeoutMs?: number;
  curatorMaxStories?: number;
  curatorMaxStoriesPerBatch?: number;
}

// ── Constants ─────────────────────────────────────────────────────────

const DEDUP_KEY = "news:processing:lock";
const DEDUP_TTL_SECONDS = 1800; // 30 minutes
const MAX_ARTICLES = 75;
const LLM_TIMEOUT_MS = 180_000;
const RETENTION_DAYS = 7;
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const LOOKBACK_HOURS = 12;

// ── Main entry point ──────────────────────────────────────────────────

export async function processUnfilteredNews(
  deps: NewsProcessorDeps,
): Promise<ProcessingResult> {
  const { db, redis, log, telegramNotify } = deps;
  const startTime = Date.now();
  const batchId = randomUUID();

  let articleCount = 0;
  let sourceBreakdown: Record<string, number> = {};

  try {
    const locked = await acquireProcessingLock(redis);
    if (!locked) {
      log.info("News processing skipped — another run is in progress or recently completed");
      return {
        batchId,
        inputArticles: 0,
        outputStories: 0,
        highImpact: 0,
        processingTimeMs: Date.now() - startTime,
      };
    }

    const articles = await fetchRecentArticles(db, log);
    if (articles.length === 0) {
      log.info("No recent unfiltered articles to process");
      const result: ProcessingResult = {
        batchId,
        inputArticles: 0,
        outputStories: 0,
        highImpact: 0,
        processingTimeMs: Date.now() - startTime,
      };
      await notifyAdmin(telegramNotify, result);
      return result;
    }

    for (const a of articles) {
      const src = a.source_api || "unknown";
      sourceBreakdown[src] = (sourceBreakdown[src] ?? 0) + 1;
    }

    const deduped = deduplicateByTitle(articles);
    const capped = deduped.slice(0, MAX_ARTICLES);
    articleCount = capped.length;

    log.info(
      { total: articles.length, afterDedup: deduped.length, capped: capped.length },
      "Prepared articles for LLM processing",
    );

    const stories = await analyzeWithLLM(capped, log);
    if (stories.length === 0) {
      log.warn("LLM returned no stories");
      const result: ProcessingResult = {
        batchId,
        inputArticles: capped.length,
        outputStories: 0,
        highImpact: 0,
        processingTimeMs: Date.now() - startTime,
        sourceBreakdown,
        error: "LLM returned no stories",
      };
      await notifyAdmin(telegramNotify, result);
      return result;
    }

    const timeRange = computeTimeRange(capped);
    await insertFilteredNews(db, batchId, stories, timeRange);
    await cleanupOldEntries(db, log);

    const highImpact = stories.filter((s) => s.impact_level === "high").length;
    const result: ProcessingResult = {
      batchId,
      inputArticles: capped.length,
      outputStories: stories.length,
      highImpact,
      processingTimeMs: Date.now() - startTime,
      sourceBreakdown,
    };

    log.info(result, "News processing complete");
    await notifyAdmin(telegramNotify, result);

    if (deps.curatorModel) {
      try {
        log.info("Triggering memory curator after news processing");
        await curateMarketMemory({
          db,
          redis,
          log,
          curatorModel: deps.curatorModel,
          telegramNotify,
          sequentialBatches: deps.curatorSequentialBatches,
          verboseCuratorLogs: deps.curatorVerboseLogs,
          curatorTelegramErrorMaxChars: deps.curatorTelegramErrorMaxChars,
          llmTimeoutMs: deps.curatorLlmTimeoutMs,
          maxStoriesForCurator: deps.curatorMaxStories,
          maxStoriesPerBatch: deps.curatorMaxStoriesPerBatch,
        });
      } catch (curatorErr) {
        const cmsg = curatorErr instanceof Error ? curatorErr.message : String(curatorErr);
        const cstack = curatorErr instanceof Error ? curatorErr.stack : undefined;
        log.error(
          { err: curatorErr, memoryCurationErrorMessage: cmsg, stack: cstack },
          "Memory curator failed — news processing result unaffected",
        );
      }
    }

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error({ err }, "News processing failed");
    const result: ProcessingResult = {
      batchId,
      inputArticles: articleCount,
      outputStories: 0,
      highImpact: 0,
      processingTimeMs: Date.now() - startTime,
      sourceBreakdown,
      error: errorMsg,
    };
    await notifyAdmin(telegramNotify, result);
    throw err;
  }
}

// ── Redis dedup lock ──────────────────────────────────────────────────

async function acquireProcessingLock(redis: Redis): Promise<boolean> {
  const result = await redis.set(DEDUP_KEY, "1", "EX", DEDUP_TTL_SECONDS, "NX");
  return result === "OK";
}

// ── Fetch unfiltered articles ─────────────────────────────────────────

async function fetchRecentArticles(
  db: Pool,
  log: FastifyBaseLogger,
): Promise<RawArticle[]> {
  const { rows } = await db.query<RawArticle>(
    `SELECT source_api, external_id, title, description,
            published_at::text, search_category, sentiment_label
     FROM unfiltered_news_combined
     WHERE created_at >= NOW() - INTERVAL '${LOOKBACK_HOURS} hours'
     ORDER BY published_at DESC`,
  );

  log.debug({ count: rows.length }, "Fetched unfiltered articles");
  return rows;
}

// ── Deduplication ─────────────────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deduplicateByTitle(articles: RawArticle[]): RawArticle[] {
  const seen = new Set<string>();
  const result: RawArticle[] = [];

  for (const article of articles) {
    const normalized = normalizeTitle(article.title);
    const key = normalized.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(article);
  }

  return result;
}

// ── Time range ────────────────────────────────────────────────────────

function computeTimeRange(articles: RawArticle[]): { start: string; end: string } {
  const times = articles
    .map((a) => new Date(a.published_at).getTime())
    .filter((t) => !Number.isNaN(t));
  return {
    start: new Date(Math.min(...times)).toISOString(),
    end: new Date(Math.max(...times)).toISOString(),
  };
}

// ── LLM analysis ─────────────────────────────────────────────────────

function buildPrompt(articles: RawArticle[]): string {
  const articleList = articles.map((a, i) => ({
    idx: i + 1,
    title: a.title,
    description: a.description?.slice(0, 200) ?? "",
    source: a.source_api,
    category: a.search_category ?? "unknown",
    published: a.published_at,
    sentiment: a.sentiment_label ?? "unknown",
  }));

  return `You are a senior financial news analyst. Analyze the following ${articles.length} raw news articles and produce a structured summary of the most significant market-moving stories.

RAW ARTICLES:
${JSON.stringify(articleList, null, 2)}

INSTRUCTIONS:
1. Identify 5-15 key market-moving stories by grouping related articles together
2. Focus on: global financial markets, macroeconomics, geopolitics, diplomacy, trade policy, central bank actions, major corporate events, crypto markets — anything with significant stock/crypto market impact
3. Filter OUT: celebrity gossip, sports, local news, weather, lifestyle, entertainment, and anything without market relevance
4. For each story, assess the market impact level and sentiment

OUTPUT FORMAT:
Return ONLY a valid JSON array (no markdown, no explanation). Each element:
{
  "headline": "concise headline (max 120 chars)",
  "summary": "2-3 sentence analysis of what happened and why it matters for markets",
  "category": "macro|geopolitical|policy|market|crypto|diplomatic",
  "impact_level": "high|medium|low",
  "affected_sectors": ["tech", "energy", "finance", ...],
  "affected_tickers": ["AAPL", "NVDA", "BTC", "BTC/USD", "SPX500", "OIL", ...],
  "sentiment": "bullish|bearish|neutral",
  "sentiment_score": 0.0,
  "key_points": ["point 1", "point 2", "point 3"],
  "market_implications": "brief note on what this means for investors",
  "source_article_indices": [1, 3, 7]
}

RULES:
- sentiment_score: -1.0 (extremely bearish) to 1.0 (extremely bullish)
- Only include stories with genuine market relevance
- Group related articles into a single story
- source_article_indices: which input articles (1-indexed) relate to this story
- affected_tickers: use **platform tradable symbols** — US equities (AAPL), crypto as BTC or BTC/USD consistently, **indices** (SPX500, NSDQ100, DJ30, RTY, …), **commodities** (OIL, GOLD, …) when the story applies. For macro/risk themes that hit broad markets, include a relevant index symbol (e.g. SPX500) not only SPY/QQQ unless the story is ETF-specific.
- Return between 5 and 15 stories, ordered by impact_level (high first)
- Return ONLY the JSON array, nothing else`;
}

export async function analyzeWithLLM(
  articles: RawArticle[],
  log: FastifyBaseLogger,
): Promise<FilteredNewsEntry[]> {
  const prompt = buildPrompt(articles);

  const args = ["cursor-agent", "-p", prompt, "--model", "claude-4.6-sonnet-medium", "--trust"];
  const apiKey = process.env["CURSOR_API_KEY"];
  if (apiKey) args.push("--api-key", apiKey);

  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(args[0]!, args.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const getStderr = () =>
      Buffer.concat(stderrChunks).toString("utf-8").replace(ANSI_RE, "").trim().slice(0, 500);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch { /* already dead */ }
      const stderr = getStderr();
      log.error({ stderr }, "cursor-agent timed out — stderr captured");
      reject(new Error(`LLM call timed out${stderr ? ` | stderr: ${stderr}` : ""}`));
    }, LLM_TIMEOUT_MS);

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
        log.error({ code, stderr }, "cursor-agent exited with non-zero code");
        reject(new Error(`cursor-agent exited with code ${code}${stderr ? ` | stderr: ${stderr}` : ""}`));
        return;
      }
      resolve(Buffer.concat(stdoutChunks).toString("utf-8").replace(ANSI_RE, "").trim());
    });
  });

  return parseLLMOutput(output, articles, log);
}

// ── Parse and validate LLM output ────────────────────────────────────

export function parseLLMOutput(
  raw: string,
  articles: RawArticle[],
  log: FastifyBaseLogger,
): FilteredNewsEntry[] {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    log.error({ rawLength: raw.length, preview: raw.slice(0, 300) }, "No JSON array found in LLM output");
    return [];
  }

  let parsed: unknown[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    log.error({ err, preview: jsonMatch[0].slice(0, 300) }, "Failed to parse LLM JSON");
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const results: FilteredNewsEntry[] = [];
  for (const item of parsed) {
    try {
      const entry = validateEntry(item, articles);
      if (entry) results.push(entry);
    } catch (err) {
      log.warn({ err, item }, "Skipping invalid LLM entry");
    }
  }

  return results;
}

function validateEntry(item: unknown, articles: RawArticle[]): FilteredNewsEntry | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;

  const headline = typeof obj["headline"] === "string" ? obj["headline"] : null;
  const summary = typeof obj["summary"] === "string" ? obj["summary"] : null;
  if (!headline || !summary) return null;

  const validCategories = ["macro", "geopolitical", "policy", "market", "crypto", "diplomatic"];
  const category = validCategories.includes(String(obj["category"]))
    ? String(obj["category"])
    : "market";

  const validImpacts = ["high", "medium", "low"];
  const impactLevel = validImpacts.includes(String(obj["impact_level"]))
    ? (String(obj["impact_level"]) as "high" | "medium" | "low")
    : "medium";

  const validSentiments = ["bullish", "bearish", "neutral"];
  const sentiment = validSentiments.includes(String(obj["sentiment"]))
    ? (String(obj["sentiment"]) as "bullish" | "bearish" | "neutral")
    : "neutral";

  const sentimentScore = typeof obj["sentiment_score"] === "number"
    ? Math.max(-1, Math.min(1, obj["sentiment_score"]))
    : 0;

  const affectedSectors = Array.isArray(obj["affected_sectors"])
    ? (obj["affected_sectors"] as unknown[]).filter((s): s is string => typeof s === "string")
    : [];

  const affectedTickers = Array.isArray(obj["affected_tickers"])
    ? (obj["affected_tickers"] as unknown[]).filter((s): s is string => typeof s === "string").map((s) => s.toUpperCase())
    : [];

  const keyPoints = Array.isArray(obj["key_points"])
    ? (obj["key_points"] as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  if (keyPoints.length === 0) return null;

  const marketImplications = typeof obj["market_implications"] === "string"
    ? obj["market_implications"]
    : "";

  const sourceIndices = Array.isArray(obj["source_article_indices"])
    ? (obj["source_article_indices"] as unknown[]).filter((n): n is number => typeof n === "number")
    : [];

  const sourceArticles = sourceIndices
    .filter((i) => i >= 1 && i <= articles.length)
    .map((i) => {
      const a = articles[i - 1]!;
      return {
        source_api: a.source_api,
        external_id: a.external_id,
        title: a.title,
        published_at: a.published_at,
      };
    });

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
    source_articles: sourceArticles,
  };
}

// ── Database insertion ────────────────────────────────────────────────

async function insertFilteredNews(
  db: Pool,
  batchId: string,
  stories: FilteredNewsEntry[],
  timeRange: { start: string; end: string },
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const story of stories) {
      await client.query(
        `INSERT INTO analysis_filtered_news
         (batch_id, headline, summary, category, impact_level,
          affected_sectors, affected_tickers, sentiment, sentiment_score,
          key_points, market_implications, source_articles,
          time_range_start, time_range_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          batchId,
          story.headline,
          story.summary,
          story.category,
          story.impact_level,
          story.affected_sectors,
          story.affected_tickers,
          story.sentiment,
          story.sentiment_score,
          story.key_points,
          story.market_implications,
          JSON.stringify(story.source_articles),
          timeRange.start,
          timeRange.end,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────

async function cleanupOldEntries(db: Pool, log: FastifyBaseLogger): Promise<void> {
  try {
    const { rowCount } = await db.query(
      `DELETE FROM analysis_filtered_news WHERE processed_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`,
    );
    if (rowCount && rowCount > 0) {
      log.info({ deleted: rowCount }, "Cleaned up old filtered news entries");
    }
  } catch (err) {
    log.warn({ err }, "Failed to cleanup old filtered news — non-fatal");
  }
}

// ── Admin Telegram notification ───────────────────────────────────────

export function formatAdminNotification(result: ProcessingResult): string {
  const status = result.error ? "FAILED" : "OK";

  let sourceLabel = "N/A";
  if (result.sourceBreakdown && Object.keys(result.sourceBreakdown).length > 0) {
    sourceLabel = Object.entries(result.sourceBreakdown)
      .map(([src, count]) => `${src} (${count})`)
      .join(", ");
  }

  const lines = [
    "<b>--- NEWS PROCESSING ---</b>",
    `<b>Status:</b> ${status}`,
    `<b>Source:</b> ${sourceLabel}`,
    `<b>Input articles:</b> ${result.inputArticles}`,
    `<b>Output stories:</b> ${result.outputStories}`,
    `<b>High impact:</b> ${result.highImpact}`,
    `<b>Processing time:</b> ${(result.processingTimeMs / 1000).toFixed(1)}s`,
    `<b>Batch:</b> ${result.batchId.slice(0, 8)}`,
    `<b>Time:</b> ${new Date().toISOString()}`,
  ];
  if (result.error) {
    lines.push(`<b>Error:</b> ${escapeHtml(result.error.slice(0, 200))}`);
  }
  return lines.join("\n");
}

async function notifyAdmin(
  telegramNotify: ((msg: string) => Promise<void>) | undefined,
  result: ProcessingResult,
): Promise<void> {
  if (!telegramNotify) return;
  try {
    await telegramNotify(formatAdminNotification(result));
  } catch {
    // Admin notification is best-effort
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
