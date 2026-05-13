import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type { MarketSnapshot } from "./market-overview.js";

export { CURRENT_CODE_VERSION } from "./smart-digest-fingerprint.js";

// ── Reuse-eligibility constants ───────────────────────────────────────

export const CURRENT_OVERVIEW_SCHEMA_VERSION = 1;

export const CURRENT_OVERVIEW_GENERATOR_VERSION = "1";

export const CURRENT_OVERVIEW_PROMPT_VERSION = "overview.v1";

export const CURRENT_OVERVIEW_MODEL = "claude-4.6-sonnet-medium";

// ── Pure hash helpers ─────────────────────────────────────────────────

function deepSortKeys(val: unknown): unknown {
  if (val === null || val === undefined || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(val as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((val as Record<string, unknown>)[key]);
  }
  return sorted;
}

function stableHash(obj: unknown): string {
  const json = JSON.stringify(deepSortKeys(obj));
  return createHash("sha256").update(json).digest("hex");
}

function stableSortedHash(items: Record<string, unknown>[]): string {
  const sorted = items
    .map((item) => JSON.stringify(item, Object.keys(item).sort()))
    .sort();
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

// ── Snapshot fingerprint ──────────────────────────────────────────────

export interface SnapshotHashInput {
  indices: Array<{ symbol: string; latestClose: number; changePercent: number }>;
  commodities: Array<{ symbol: string; latestClose: number; changePercent: number }>;
  crypto: Array<{ symbol: string; latestClose: number; changePercent: number }>;
  dxy: { latestClose: number; changePercent: number } | null;
  bondYields: Array<{ seriesId: string; value: number; changeBps: number }>;
  topNewsThemeIds: string[];
}

export function projectSnapshotRefs(snapshot: MarketSnapshot): SnapshotHashInput {
  return {
    indices: snapshot.indices.map((a) => ({
      symbol: a.symbol,
      latestClose: a.latestClose,
      changePercent: a.changePercent,
    })),
    commodities: snapshot.commodities.map((a) => ({
      symbol: a.symbol,
      latestClose: a.latestClose,
      changePercent: a.changePercent,
    })),
    crypto: snapshot.crypto.map((a) => ({
      symbol: a.symbol,
      latestClose: a.latestClose,
      changePercent: a.changePercent,
    })),
    dxy: snapshot.dxy
      ? { latestClose: snapshot.dxy.latestClose, changePercent: snapshot.dxy.changePercent }
      : null,
    bondYields: snapshot.bondYields.map((b) => ({
      seriesId: b.seriesId,
      value: b.value,
      changeBps: b.changeBps,
    })),
    topNewsThemeIds: snapshot.topNews.map((n) => n.title),
  };
}

export function computeOverviewSnapshotHash(snapshot: MarketSnapshot): string {
  const projection = projectSnapshotRefs(snapshot);
  return stableHash(projection);
}

// ── Context fingerprint ───────────────────────────────────────────────

export interface OverviewContextRefs {
  priorOverviews: Array<{
    date: string;
    sessionType: string;
    narrative: string;
  }>;
  stockTrajectory: Array<{
    symbol: string;
    date: string;
    close: number;
  }>;
  cryptoTrajectory: Array<{
    symbol: string;
    date: string;
    close: number;
  }>;
  memoryThemes: Array<{
    theme_id: string;
    last_updated: string;
  }>;
}

export function computeOverviewContextHash(refs: OverviewContextRefs): string {
  const items: Record<string, unknown>[] = [
    ...refs.priorOverviews.map((po) => ({
      _type: "prior",
      date: po.date,
      sessionType: po.sessionType,
    })),
    ...refs.stockTrajectory.map((p) => ({
      _type: "stock_traj",
      close: p.close,
      date: p.date,
      symbol: p.symbol,
    })),
    ...refs.cryptoTrajectory.map((p) => ({
      _type: "crypto_traj",
      close: p.close,
      date: p.date,
      symbol: p.symbol,
    })),
    ...refs.memoryThemes.map((m) => ({
      _type: "memory",
      last_updated: m.last_updated,
      theme_id: m.theme_id,
    })),
  ];
  if (items.length === 0) {
    return createHash("sha256").update("[]").digest("hex");
  }
  return stableSortedHash(items);
}

// ── DB-backed context ref gathering ───────────────────────────────────

const HISTORY_DAYS = 7;
const TRAJECTORY_SYMBOLS = ["SPX500", "OIL"];
const TRAJECTORY_CRYPTO = ["BTC/USD", "ETH/USD"];

export async function gatherContextRefs(
  db: Pool,
  _sessionType: string,
): Promise<OverviewContextRefs> {
  const [priorRes, stockTrajRes, cryptoTrajRes, memoryRes] =
    await Promise.all([
      db
        .query<{
          sent_date: string;
          headline: string;
        }>(
          `SELECT DISTINCT ON (sent_at::date, headline)
             sent_at::date::text AS sent_date,
             headline
           FROM user_recommendation_log
           WHERE recommendation_type = 'daily_overview'
             AND sent_at >= NOW() - make_interval(days => $1)
           ORDER BY sent_at::date DESC, headline, sent_at DESC`,
          [HISTORY_DAYS],
        )
        .catch(() => ({ rows: [] as Array<{ sent_date: string; headline: string }> })),

      db
        .query<{
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
             WHERE UPPER(t.symbol) IN (${TRAJECTORY_SYMBOLS.map((_, i) => `$${i + 1}`).join(", ")})
               AND sp.price_time >= NOW() - make_interval(days => $${TRAJECTORY_SYMBOLS.length + 1})
           )
           SELECT symbol, price_date::text, close_price::text
           FROM ranked WHERE rn = 1
           ORDER BY symbol, price_date`,
          [...TRAJECTORY_SYMBOLS.map((s) => s.toUpperCase()), HISTORY_DAYS],
        )
        .catch(() => ({ rows: [] as Array<{ symbol: string; price_date: string; close_price: string }> })),

      db
        .query<{
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
             WHERE UPPER(t.symbol) IN (${TRAJECTORY_CRYPTO.map((_, i) => `$${i + 1}`).join(", ")})
               AND cp.price_time >= NOW() - make_interval(days => $${TRAJECTORY_CRYPTO.length + 1})
           )
           SELECT symbol, price_date::text, close_price::text
           FROM ranked WHERE rn = 1
           ORDER BY symbol, price_date`,
          [...TRAJECTORY_CRYPTO.map((s) => s.toUpperCase()), HISTORY_DAYS],
        )
        .catch(() => ({ rows: [] as Array<{ symbol: string; price_date: string; close_price: string }> })),

      db
        .query<{
          theme_id: string;
          last_updated: string;
        }>(
          `SELECT theme_id::text, last_updated::text
           FROM analysis_market_memory
           WHERE status IN ('active', 'fading')
           ORDER BY
             CASE impact_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
             relevance_score DESC
           LIMIT 15`,
        )
        .catch(() => ({ rows: [] as Array<{ theme_id: string; last_updated: string }> })),
    ]);

  return {
    priorOverviews: priorRes.rows.map((r) => ({
      date: r.sent_date,
      sessionType: r.headline.includes("Morning")
        ? "pre_market"
        : "post_close",
      narrative: "",
    })),
    stockTrajectory: stockTrajRes.rows.map((r) => ({
      symbol: r.symbol,
      date: r.price_date,
      close: Number(r.close_price),
    })),
    cryptoTrajectory: cryptoTrajRes.rows.map((r) => ({
      symbol: r.symbol,
      date: r.price_date,
      close: Number(r.close_price),
    })),
    memoryThemes: memoryRes.rows,
  };
}
