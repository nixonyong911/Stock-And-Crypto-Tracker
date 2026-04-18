import { getSupabaseAdmin } from "./supabase";

export type TickerInfo = {
  symbol: string;
  name: string | null;
  assetType: "stock" | "crypto";
  exchange?: string | null;
};

export type PriceTarget = {
  symbol: string;
  assetType: string;
  analysisDate: string;
  latestClose: number;
  latestOpen: number | null;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  signalSummary: string | null;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
};

export async function getAllActiveSymbols(): Promise<TickerInfo[]> {
  const sb = getSupabaseAdmin();

  const [stockRes, cryptoRes] = await Promise.all([
    sb
      .from("stock_tickers")
      .select("symbol, name, exchange")
      .eq("is_active", true)
      .order("symbol"),
    sb
      .from("crypto_tickers")
      .select("symbol, name")
      .eq("is_active", true)
      .order("symbol"),
  ]);

  const stocks: TickerInfo[] = (stockRes.data ?? []).map((t) => ({
    symbol: t.symbol,
    name: t.name,
    assetType: "stock" as const,
    exchange: t.exchange,
  }));

  const cryptos: TickerInfo[] = (cryptoRes.data ?? []).map((t) => ({
    symbol: t.symbol,
    name: t.name,
    assetType: "crypto" as const,
  }));

  return [...stocks, ...cryptos];
}

export async function getTickerInfo(
  symbol: string
): Promise<TickerInfo | null> {
  const sb = getSupabaseAdmin();
  const upper = symbol.toUpperCase();

  const { data: stock } = await sb
    .from("stock_tickers")
    .select("symbol, name, exchange")
    .eq("symbol", upper)
    .eq("is_active", true)
    .maybeSingle();

  if (stock) {
    return {
      symbol: stock.symbol,
      name: stock.name,
      assetType: "stock",
      exchange: stock.exchange,
    };
  }

  const { data: crypto } = await sb
    .from("crypto_tickers")
    .select("symbol, name")
    .eq("symbol", upper)
    .eq("is_active", true)
    .maybeSingle();

  if (crypto) {
    return {
      symbol: crypto.symbol,
      name: crypto.name,
      assetType: "crypto",
    };
  }

  return null;
}

export async function getLatestPriceTarget(
  symbol: string
): Promise<PriceTarget | null> {
  const sb = getSupabaseAdmin();

  const { data } = await sb
    .from("analysis_ticker_price_targets")
    .select("*")
    .eq("ticker_symbol", symbol.toUpperCase())
    .order("analysis_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    symbol: data.ticker_symbol,
    assetType: data.asset_type,
    analysisDate: data.analysis_date,
    latestClose: parseFloat(data.latest_close),
    latestOpen: data.latest_open ? parseFloat(data.latest_open) : null,
    entryPrice: data.entry_price ? parseFloat(data.entry_price) : null,
    targetPrice: data.target_price ? parseFloat(data.target_price) : null,
    stopLoss: data.stop_loss ? parseFloat(data.stop_loss) : null,
    signalSummary: data.signal_summary,
    confidence: data.confidence ? parseFloat(data.confidence) : null,
    metadata: data.metadata,
  };
}

export async function getRecentPriceTargets(
  symbol: string,
  days = 7
): Promise<PriceTarget[]> {
  const sb = getSupabaseAdmin();

  const { data } = await sb
    .from("analysis_ticker_price_targets")
    .select("*")
    .eq("ticker_symbol", symbol.toUpperCase())
    .order("analysis_date", { ascending: false })
    .limit(days);

  return (data ?? []).map((d) => ({
    symbol: d.ticker_symbol,
    assetType: d.asset_type,
    analysisDate: d.analysis_date,
    latestClose: parseFloat(d.latest_close),
    latestOpen: d.latest_open ? parseFloat(d.latest_open) : null,
    entryPrice: d.entry_price ? parseFloat(d.entry_price) : null,
    targetPrice: d.target_price ? parseFloat(d.target_price) : null,
    stopLoss: d.stop_loss ? parseFloat(d.stop_loss) : null,
    signalSummary: d.signal_summary,
    confidence: d.confidence ? parseFloat(d.confidence) : null,
    metadata: d.metadata,
  }));
}
