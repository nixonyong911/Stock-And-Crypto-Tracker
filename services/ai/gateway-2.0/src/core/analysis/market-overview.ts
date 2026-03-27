import { spawn } from "node:child_process";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";

// ── Types ─────────────────────────────────────────────────────────────

export interface AssetChange {
  symbol: string;
  name: string;
  latestClose: number;
  previousClose: number;
  changePercent: number;
}

export interface BondYield {
  seriesId: string;
  displayName: string;
  value: number;
  previousValue: number;
  changeBps: number;
}

export interface NewsItem {
  title: string;
  source: string;
  sentiment: string;
  category: string;
  impact_level?: string;
}

interface PriorOverview {
  date: string;
  sessionType: string;
  narrative: string;
}

interface PricePoint {
  symbol: string;
  name: string;
  date: string;
  close: number;
}

export interface MarketSnapshot {
  timestamp: Date;
  sessionType: "pre_market" | "post_close";
  indices: AssetChange[];
  commodities: AssetChange[];
  crypto: AssetChange[];
  dxy: AssetChange | null;
  bondYields: BondYield[];
  topNews: NewsItem[];
}

// ── Constants ─────────────────────────────────────────────────────────

const INDEX_SYMBOLS = ["SPX500", "NSDQ100", "DJ30", "RTY"];
const INDEX_NAMES: Record<string, string> = {
  SPX500: "S&P 500",
  NSDQ100: "Nasdaq",
  DJ30: "Dow",
  RTY: "Russell 2000",
};

const COMMODITY_SYMBOLS = ["OIL"];
const COMMODITY_NAMES: Record<string, string> = {
  OIL: "Oil (WTI)",
};

const CRYPTO_SYMBOLS = ["BTC/USD", "ETH/USD"];
const CRYPTO_NAMES: Record<string, string> = {
  "BTC/USD": "BTC",
  "ETH/USD": "ETH",
};

const DXY_SYMBOL = "USDOLLAR";

const YIELD_SERIES = [
  { seriesId: "DGS10", displayName: "10Y" },
  { seriesId: "DGS2", displayName: "2Y" },
];

const TRAJECTORY_SYMBOLS = ["SPX500", "OIL"];
const TRAJECTORY_CRYPTO = ["BTC/USD", "ETH/USD"];
const TRAJECTORY_NAMES: Record<string, string> = {
  SPX500: "S&P 500",
  OIL: "Oil (WTI)",
  "BTC/USD": "BTC",
  "ETH/USD": "ETH",
};

const LLM_TIMEOUT_MS = 60_000;
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
const MAX_PRIOR_NARRATIVE_CHARS = 300;
const MAX_HISTORY_TOTAL_CHARS = 2000;
const HISTORY_DAYS = 7;

// ── Data fetching ─────────────────────────────────────────────────────

async function fetchStockAssetChanges(
  db: Pool,
  symbols: string[],
  nameMap: Record<string, string>,
): Promise<AssetChange[]> {
  if (symbols.length === 0) return [];

  const placeholders = symbols.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await db.query<{
    symbol: string;
    latest_close: string;
    previous_close: string;
  }>(
    `WITH ranked AS (
       SELECT t.symbol,
              sp.close_price,
              sp.price_time::date AS price_date,
              ROW_NUMBER() OVER (PARTITION BY t.symbol, sp.price_time::date ORDER BY sp.price_time DESC) AS rn
       FROM stock_tickers t
       JOIN stock_prices sp ON sp.stock_ticker_id = t.id
       WHERE UPPER(t.symbol) IN (${placeholders})
         AND sp.price_time >= NOW() - INTERVAL '5 days'
     ),
     daily AS (
       SELECT symbol, close_price, price_date,
              ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY price_date DESC) AS day_rank
       FROM ranked WHERE rn = 1
     )
     SELECT
       a.symbol,
       a.close_price::text AS latest_close,
       b.close_price::text AS previous_close
     FROM daily a
     JOIN daily b ON a.symbol = b.symbol AND b.day_rank = a.day_rank + 1
     WHERE a.day_rank = 1`,
    symbols.map((s) => s.toUpperCase()),
  );

  return rows.map((r) => {
    const latest = Number(r.latest_close);
    const previous = Number(r.previous_close);
    return {
      symbol: r.symbol,
      name: nameMap[r.symbol] ?? r.symbol,
      latestClose: latest,
      previousClose: previous,
      changePercent: previous !== 0 ? ((latest - previous) / previous) * 100 : 0,
    };
  });
}

async function fetchCryptoAssetChanges(
  db: Pool,
  symbols: string[],
  nameMap: Record<string, string>,
): Promise<AssetChange[]> {
  if (symbols.length === 0) return [];

  const placeholders = symbols.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await db.query<{
    symbol: string;
    latest_close: string;
    previous_close: string;
  }>(
    `WITH ranked AS (
       SELECT t.symbol,
              cp.close_price,
              cp.price_time::date AS price_date,
              ROW_NUMBER() OVER (PARTITION BY t.symbol, cp.price_time::date ORDER BY cp.price_time DESC) AS rn
       FROM crypto_tickers t
       JOIN crypto_prices cp ON cp.crypto_ticker_id = t.id
       WHERE UPPER(t.symbol) IN (${placeholders})
         AND cp.price_time >= NOW() - INTERVAL '5 days'
     ),
     daily AS (
       SELECT symbol, close_price, price_date,
              ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY price_date DESC) AS day_rank
       FROM ranked WHERE rn = 1
     )
     SELECT
       a.symbol,
       a.close_price::text AS latest_close,
       b.close_price::text AS previous_close
     FROM daily a
     JOIN daily b ON a.symbol = b.symbol AND b.day_rank = a.day_rank + 1
     WHERE a.day_rank = 1`,
    symbols.map((s) => s.toUpperCase()),
  );

  return rows.map((r) => {
    const latest = Number(r.latest_close);
    const previous = Number(r.previous_close);
    return {
      symbol: r.symbol,
      name: nameMap[r.symbol] ?? r.symbol,
      latestClose: latest,
      previousClose: previous,
      changePercent: previous !== 0 ? ((latest - previous) / previous) * 100 : 0,
    };
  });
}

async function fetchBondYields(db: Pool): Promise<BondYield[]> {
  const ids = YIELD_SERIES.map((y) => y.seriesId);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");

  const { rows } = await db.query<{
    series_id: string;
    display_name: string;
    current_value: string | null;
    previous_value: string | null;
  }>(
    `SELECT series_id, display_name,
            current_value::text, previous_value::text
     FROM analysis_economic_indicators
     WHERE series_id IN (${placeholders}) AND is_active = true`,
    ids,
  );

  return rows.map((r) => {
    const current = Number(r.current_value ?? 0);
    const previous = Number(r.previous_value ?? 0);
    const displayName = YIELD_SERIES.find((y) => y.seriesId === r.series_id)?.displayName ?? r.display_name;
    return {
      seriesId: r.series_id,
      displayName,
      value: current,
      previousValue: previous,
      changeBps: Math.round((current - previous) * 100),
    };
  });
}

async function fetchTopNews(db: Pool, limit = 15): Promise<NewsItem[]> {
  const { rows } = await db.query<{
    title: string;
    source: string;
    sentiment_label: string;
    search_category: string;
    impact_level: string | null;
  }>(
    `SELECT theme AS title,
            'memory' AS source,
            COALESCE(sentiment, 'neutral') AS sentiment_label,
            category AS search_category,
            impact_level
     FROM analysis_market_memory
     WHERE status IN ('active', 'fading')
     ORDER BY
       CASE impact_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       relevance_score DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    title: r.title,
    source: r.source,
    sentiment: r.sentiment_label,
    category: r.search_category,
    impact_level: r.impact_level ?? undefined,
  }));
}

// ── Memory: prior overviews ──────────────────────────────────────────

async function fetchPriorOverviews(db: Pool, days: number = HISTORY_DAYS): Promise<PriorOverview[]> {
  const { rows } = await db.query<{
    sent_date: string;
    headline: string;
    message_body: string;
  }>(
    `SELECT DISTINCT ON (sent_at::date, headline)
       sent_at::date::text AS sent_date,
       headline,
       message_body
     FROM user_recommendation_log
     WHERE recommendation_type = 'daily_overview'
       AND sent_at >= NOW() - make_interval(days => $1)
     ORDER BY sent_at::date DESC, headline, sent_at DESC`,
    [days],
  );

  return rows.map((r) => ({
    date: r.sent_date,
    sessionType: r.headline.includes("Morning") ? "pre_market" : "post_close",
    narrative: truncateToSentence(extractNarrative(r.message_body), MAX_PRIOR_NARRATIVE_CHARS),
  }));
}

function extractNarrative(messageBody: string): string {
  const lines = messageBody.split("\n");
  const narrativeLines: string[] = [];
  let collecting = false;

  for (const line of lines) {
    if (line.startsWith("*") && (line.includes("Brief") || line.includes("Recap"))) {
      collecting = true;
      continue;
    }
    if (collecting && line.startsWith("*") && line.endsWith("*")) break;
    if (collecting && line.trim()) narrativeLines.push(line.trim());
  }

  return narrativeLines.join(" ") || messageBody.slice(0, MAX_PRIOR_NARRATIVE_CHARS);
}

function truncateToSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf(".");
  if (lastPeriod > maxLen * 0.5) return truncated.slice(0, lastPeriod + 1);
  return truncated + "...";
}

// ── Memory: price trajectory ─────────────────────────────────────────

async function fetchStockPriceTrajectory(db: Pool, symbols: string[], days: number): Promise<PricePoint[]> {
  if (symbols.length === 0) return [];
  const placeholders = symbols.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await db.query<{
    symbol: string;
    price_date: string;
    close_price: string;
  }>(
    `WITH ranked AS (
       SELECT t.symbol,
              sp.close_price,
              sp.price_time::date AS price_date,
              ROW_NUMBER() OVER (PARTITION BY t.symbol, sp.price_time::date ORDER BY sp.price_time DESC) AS rn
       FROM stock_tickers t
       JOIN stock_prices sp ON sp.stock_ticker_id = t.id
       WHERE UPPER(t.symbol) IN (${placeholders})
         AND sp.price_time >= NOW() - make_interval(days => $${symbols.length + 1})
     )
     SELECT symbol, price_date::text, close_price::text
     FROM ranked WHERE rn = 1
     ORDER BY symbol, price_date`,
    [...symbols.map((s) => s.toUpperCase()), days],
  );

  return rows.map((r) => ({
    symbol: r.symbol,
    name: TRAJECTORY_NAMES[r.symbol] ?? r.symbol,
    date: r.price_date,
    close: Number(r.close_price),
  }));
}

async function fetchCryptoPriceTrajectory(db: Pool, symbols: string[], days: number): Promise<PricePoint[]> {
  if (symbols.length === 0) return [];
  const placeholders = symbols.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await db.query<{
    symbol: string;
    price_date: string;
    close_price: string;
  }>(
    `WITH ranked AS (
       SELECT t.symbol,
              cp.close_price,
              cp.price_time::date AS price_date,
              ROW_NUMBER() OVER (PARTITION BY t.symbol, cp.price_time::date ORDER BY cp.price_time DESC) AS rn
       FROM crypto_tickers t
       JOIN crypto_prices cp ON cp.crypto_ticker_id = t.id
       WHERE UPPER(t.symbol) IN (${placeholders})
         AND cp.price_time >= NOW() - make_interval(days => $${symbols.length + 1})
     )
     SELECT symbol, price_date::text, close_price::text
     FROM ranked WHERE rn = 1
     ORDER BY symbol, price_date`,
    [...symbols.map((s) => s.toUpperCase()), days],
  );

  return rows.map((r) => ({
    symbol: r.symbol,
    name: TRAJECTORY_NAMES[r.symbol] ?? r.symbol,
    date: r.price_date,
    close: Number(r.close_price),
  }));
}

function buildPriceTrajectoryText(stockPoints: PricePoint[], cryptoPoints: PricePoint[]): string {
  const allPoints = [...stockPoints, ...cryptoPoints];
  const bySymbol = new Map<string, PricePoint[]>();
  for (const p of allPoints) {
    const arr = bySymbol.get(p.symbol) ?? [];
    arr.push(p);
    bySymbol.set(p.symbol, arr);
  }

  const lines: string[] = [];
  for (const [, points] of bySymbol) {
    if (points.length === 0) continue;
    const name = points[0]!.name;
    const trajectory = points
      .map((p) => {
        const d = new Date(p.date);
        const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return `${label}: $${fmtPrice(p.close)}`;
      })
      .join(" -> ");
    lines.push(`${name}: ${trajectory}`);
  }

  return lines.join("\n");
}

function buildMemoryContext(priorOverviews: PriorOverview[]): string {
  if (priorOverviews.length === 0) return "";

  let totalChars = 0;
  const entries: string[] = [];

  for (const po of priorOverviews) {
    const d = new Date(po.date);
    const label = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const sessionLabel = po.sessionType === "pre_market" ? "morning" : "evening";
    const entry = `[${label} ${sessionLabel}]: ${po.narrative}`;

    if (totalChars + entry.length > MAX_HISTORY_TOTAL_CHARS) break;
    entries.push(entry);
    totalChars += entry.length;
  }

  return entries.join("\n");
}

// ── Snapshot builder ──────────────────────────────────────────────────

export async function buildMarketSnapshot(
  db: Pool,
  sessionType: "pre_market" | "post_close",
): Promise<MarketSnapshot> {
  const [indices, commodities, dxyArr, crypto, bondYields, topNews] = await Promise.all([
    fetchStockAssetChanges(db, INDEX_SYMBOLS, INDEX_NAMES).catch(() => []),
    fetchStockAssetChanges(db, COMMODITY_SYMBOLS, COMMODITY_NAMES).catch(() => []),
    fetchStockAssetChanges(db, [DXY_SYMBOL], { [DXY_SYMBOL]: "US Dollar Index" }).catch(() => []),
    fetchCryptoAssetChanges(db, CRYPTO_SYMBOLS, CRYPTO_NAMES).catch(() => []),
    fetchBondYields(db).catch(() => []),
    fetchTopNews(db).catch(() => []),
  ]);

  return {
    timestamp: new Date(),
    sessionType,
    indices,
    commodities,
    crypto,
    dxy: dxyArr[0] ?? null,
    bondYields,
    topNews,
  };
}

// ── LLM synthesis ─────────────────────────────────────────────────────

function buildSnapshotSummary(snapshot: MarketSnapshot): string {
  const parts: string[] = [];

  if (snapshot.indices.length > 0) {
    parts.push("US Indices: " + snapshot.indices
      .map((a) => `${a.name} ${a.changePercent >= 0 ? "+" : ""}${a.changePercent.toFixed(2)}% ($${fmtPrice(a.latestClose)})`)
      .join(", "));
  }

  if (snapshot.dxy) {
    parts.push(`DXY: ${fmtPrice(snapshot.dxy.latestClose)} (${snapshot.dxy.changePercent >= 0 ? "+" : ""}${snapshot.dxy.changePercent.toFixed(2)}%)`);
  }

  if (snapshot.commodities.length > 0) {
    parts.push("Commodities: " + snapshot.commodities
      .map((a) => `${a.name} ${a.changePercent >= 0 ? "+" : ""}${a.changePercent.toFixed(2)}% ($${fmtPrice(a.latestClose)})`)
      .join(", "));
  }

  if (snapshot.crypto.length > 0) {
    parts.push("Crypto: " + snapshot.crypto
      .map((a) => `${a.name} ${a.changePercent >= 0 ? "+" : ""}${a.changePercent.toFixed(2)}% ($${fmtPrice(a.latestClose)})`)
      .join(", "));
  }

  if (snapshot.bondYields.length > 0) {
    parts.push("Bonds: " + snapshot.bondYields
      .map((b) => `${b.displayName} ${b.value.toFixed(2)}% (${b.changeBps >= 0 ? "+" : ""}${b.changeBps}bp)`)
      .join(", "));
  }

  if (snapshot.topNews.length > 0) {
    const macroThemes = snapshot.topNews.filter((n) => n.category !== "market").slice(0, 5);
    const marketThemes = snapshot.topNews.filter((n) => n.category === "market").slice(0, 5);
    const themes = [...macroThemes, ...marketThemes].slice(0, 8);
    parts.push("Active market themes (from memory curator — weave into a natural narrative):\n" +
      themes.map((n) => `- [${n.category}${n.impact_level ? "/" + n.impact_level : ""}] ${n.title} (${n.sentiment})`).join("\n"));
  }

  return parts.join("\n\n");
}

export async function synthesizeOverview(
  snapshot: MarketSnapshot,
  db: Pool,
  redis: Redis,
  log: FastifyBaseLogger,
): Promise<{ narrative: string; topStories: string[] } | null> {
  const dateStr = snapshot.timestamp.toISOString().slice(0, 10);
  const dedupKey = `digest:overview:llm:${snapshot.sessionType}:${dateStr}`;
  const cached = await redis.get(dedupKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { /* regenerate */ }
  }

  const dataSummary = buildSnapshotSummary(snapshot);
  if (!dataSummary) return null;

  const [priorOverviews, stockTrajectory, cryptoTrajectory] = await Promise.all([
    fetchPriorOverviews(db).catch(() => [] as PriorOverview[]),
    fetchStockPriceTrajectory(db, TRAJECTORY_SYMBOLS, HISTORY_DAYS).catch(() => [] as PricePoint[]),
    fetchCryptoPriceTrajectory(db, TRAJECTORY_CRYPTO, HISTORY_DAYS).catch(() => [] as PricePoint[]),
  ]);

  const memoryContext = buildMemoryContext(priorOverviews);
  const trajectoryText = buildPriceTrajectoryText(stockTrajectory, cryptoTrajectory);

  const memorySection = memoryContext
    ? `
YOUR PRIOR OVERVIEWS (last 7 days):
${memoryContext}

ACTUAL PRICE TRAJECTORY THIS WEEK (ground truth — use to verify your prior claims):
${trajectoryText || "No trajectory data available."}

RULES FOR REFERENCING PRIOR OVERVIEWS:
- ONLY reference a prior claim if the ACTUAL PRICE TRAJECTORY above confirms it played out.
  Example: You said "oil expected to rise" and oil DID rise -> OK to say "As noted on Tuesday, oil has continued its climb..."
- NEVER reference a prior claim that the price data contradicts.
  Example: You said "BTC appears poised to recover" but BTC fell further -> Do NOT mention it.
- Use natural phrasing: "As noted earlier this week...", "Following up on Tuesday's observation..."
- Do NOT fabricate memory. If the prior overviews don't contain a relevant claim, don't invent one.
- Keep references brief (1 sentence max per reference). The focus should be on TODAY's data.
`
    : "";

  const prompt = `You are a professional market analyst writing a concise daily market overview for retail investors focused on US stocks. Write in the style of Bloomberg or Reuters — professional, data-driven, authoritative — but use plain language that retail investors can easily understand. Avoid jargon and overly theoretical terminology.

TODAY'S MARKET DATA:
${dataSummary}
${memorySection}
FORMAT YOUR RESPONSE EXACTLY AS:

NARRATIVE:
[2-3 paragraphs covering:
- What happened in the market today and why (reference specific numbers)
- Which sectors outperformed or underperformed and the likely drivers
- Bond/yield moves explained in plain terms (e.g. "10-year Treasury yield fell 5 basis points to 4.34%, suggesting investors moved toward safety")
- Brief mention of crypto only if move is significant (>3%), otherwise just note it in the data
- A sentence on overall market sentiment (risk-on/risk-off, fear/caution/optimism)]

OUTLOOK:
[1 paragraph: state likely scenarios for the next session with caveats. Moderate boldness — not hedged into meaninglessness, but not reckless. Use "likely", "appears set to", "the key risk is".]

TOP_STORIES:
- [story 1 — mix of macro/geo and stock-specific, whatever is most market-moving]
- [story 2]
- [story 3]
- [story 4]
- [story 5]

RULES:
- Never say BUY or SELL. Use "suggests", "indicates", "appears to".
- Reference specific numbers (prices, percentages, basis points).
- No emojis. Minimal formatting. Clean prose.
- Keep total response under 350 words.`;

  const args = ["cursor-agent", "-p", prompt, "--model", "claude-4.6-sonnet-medium", "--trust"];
  const apiKey = process.env["CURSOR_API_KEY"];
  if (apiKey) args.push("--api-key", apiKey);

  try {
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
        reject(new Error("LLM call timed out"));
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

    const narrativeMatch = output.match(/NARRATIVE:\s*([\s\S]*?)(?=OUTLOOK:|TOP_STORIES:|$)/i);
    const outlookMatch = output.match(/OUTLOOK:\s*([\s\S]*?)(?=TOP_STORIES:|$)/i);
    const storiesMatch = output.match(/TOP_STORIES:\s*([\s\S]*)/i);

    const narrative = [
      narrativeMatch?.[1]?.trim() ?? output,
      outlookMatch?.[1]?.trim(),
    ].filter(Boolean).join("\n\n");

    const topStories = storiesMatch?.[1]
      ?.split("\n")
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter((l) => l.length > 0)
      .slice(0, 5) ?? [];

    const result = { narrative, topStories };

    await redis.set(dedupKey, JSON.stringify(result), "EX", 43200).catch(() => {});

    return result;
  } catch (err) {
    log.warn({ err }, "LLM synthesis failed for market overview");
    return null;
  }
}

// ── Message formatters ────────────────────────────────────────────────

function fmtPrice(n: number): string {
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(4);
}

function fmtChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function buildSnapshotBlock(snapshot: MarketSnapshot): string {
  const lines: string[] = [];

  if (snapshot.indices.length > 0) {
    lines.push(snapshot.indices
      .map((a) => `${a.name}: ${fmtPrice(a.latestClose)} (${fmtChange(a.changePercent)})`)
      .join(" | "));
  }

  const extras: string[] = [];
  if (snapshot.dxy) {
    extras.push(`DXY ${fmtPrice(snapshot.dxy.latestClose)} (${fmtChange(snapshot.dxy.changePercent)})`);
  }
  for (const c of snapshot.commodities) {
    extras.push(`${c.name} $${fmtPrice(c.latestClose)} (${fmtChange(c.changePercent)})`);
  }
  if (extras.length > 0) lines.push(extras.join(" | "));

  if (snapshot.crypto.length > 0) {
    lines.push(snapshot.crypto
      .map((a) => `${a.name} $${fmtPrice(a.latestClose)} (${fmtChange(a.changePercent)})`)
      .join(" | "));
  }

  if (snapshot.bondYields.length > 0) {
    lines.push(snapshot.bondYields
      .map((b) => `${b.displayName}: ${b.value.toFixed(2)}% (${b.changeBps >= 0 ? "+" : ""}${b.changeBps}bp)`)
      .join(" | "));
  }

  return lines.join("\n");
}

export function formatMorningBrief(
  snapshot: MarketSnapshot,
  synthesis: { narrative: string; topStories: string[] } | null,
): string {
  const date = snapshot.timestamp.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const narrativeSection = synthesis?.narrative
    ?? buildTemplateFallbackNarrative(snapshot);

  const watchSection = synthesis?.topStories && synthesis.topStories.length > 0
    ? "*What to Watch Today*\n" + synthesis.topStories.map((s) => `- ${s}`).join("\n")
    : "";

  const snapshotBlock = buildSnapshotBlock(snapshot);

  return [
    `*Morning Brief — ${date}*`,
    "",
    narrativeSection,
    "",
    watchSection,
    watchSection ? "" : null,
    "*Market Snapshot*",
    snapshotBlock,
    "",
    "_Not financial advice. Manage: /digest overview off_",
  ].filter((l) => l !== null).join("\n");
}

export function formatEveningRecap(
  snapshot: MarketSnapshot,
  synthesis: { narrative: string; topStories: string[] } | null,
): string {
  const date = snapshot.timestamp.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const narrativeSection = synthesis?.narrative
    ?? buildTemplateFallbackNarrative(snapshot);

  const topStoriesSection = synthesis?.topStories && synthesis.topStories.length > 0
    ? "*Top Stories*\n" + synthesis.topStories.map((s) => `- ${s}`).join("\n")
    : "";

  const snapshotBlock = buildSnapshotBlock(snapshot);

  return [
    `*Market Recap — ${date}*`,
    "",
    narrativeSection,
    "",
    topStoriesSection,
    topStoriesSection ? "" : null,
    "*Closing Snapshot*",
    snapshotBlock,
    "",
    "_Not financial advice. Manage: /digest overview off_",
  ].filter((l) => l !== null).join("\n");
}

function buildTemplateFallbackNarrative(snapshot: MarketSnapshot): string {
  const parts: string[] = [];

  if (snapshot.indices.length > 0) {
    const ups = snapshot.indices.filter((i) => i.changePercent > 0);
    const downs = snapshot.indices.filter((i) => i.changePercent < 0);

    if (ups.length > downs.length) {
      parts.push(`US equities traded higher. ${snapshot.indices.map((i) => `${i.name} ${fmtChange(i.changePercent)}`).join(", ")}.`);
    } else if (downs.length > ups.length) {
      parts.push(`US equities traded lower. ${snapshot.indices.map((i) => `${i.name} ${fmtChange(i.changePercent)}`).join(", ")}.`);
    } else {
      parts.push(`US equities were mixed. ${snapshot.indices.map((i) => `${i.name} ${fmtChange(i.changePercent)}`).join(", ")}.`);
    }
  }

  if (snapshot.commodities.length > 0) {
    parts.push(snapshot.commodities.map((c) => `${c.name} ${fmtChange(c.changePercent)} at $${fmtPrice(c.latestClose)}`).join(". ") + ".");
  }

  if (snapshot.crypto.length > 0) {
    parts.push(snapshot.crypto.map((c) => `${c.name} ${fmtChange(c.changePercent)} at $${fmtPrice(c.latestClose)}`).join(". ") + ".");
  }

  if (snapshot.topNews.length > 0) {
    const macroNews = snapshot.topNews.filter((n) => n.category !== "market");
    if (macroNews.length > 0) {
      parts.push(`Key developments: ${macroNews.slice(0, 3).map((n) => n.title).join("; ")}.`);
    }
  }

  return parts.join(" ");
}
