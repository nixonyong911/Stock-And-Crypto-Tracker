import type { Pool } from "pg";

export interface DemandEntry {
  symbol: string;
  assetType: string;
}

export async function resolveDemandSet(
  db: Pool,
  assetType?: "stock" | "crypto",
): Promise<DemandEntry[]> {
  const types = assetType ? [assetType] : ["stock", "crypto"];
  const { rows } = await db.query<{
    ticker_symbol: string;
    asset_type: string;
  }>(
    `SELECT DISTINCT ticker_symbol, asset_type
     FROM user_watchlist
     WHERE asset_type = ANY($1::text[])`,
    [types],
  );
  return rows.map((r) => ({
    symbol: r.ticker_symbol,
    assetType: r.asset_type,
  }));
}
