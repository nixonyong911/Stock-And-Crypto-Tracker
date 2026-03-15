/**
 * Pure utility functions for the /add command.
 * All functions are side-effect free and fully unit-testable.
 */

// ── Constants ──────────────────────────────────────────────────────────

const MAX_INPUT_LENGTH = 50;
const MAX_SYMBOL_LENGTH = 20;
const SYMBOL_REGEX = /^[A-Za-z0-9/\-.&]+$/;

const ASSET_TYPE_ALIASES: Record<string, string> = {
  stock: "stock",
  stocks: "stock",
  equity: "stock",
  equities: "stock",
  share: "stock",
  shares: "stock",
  crypto: "crypto",
  cryptocurrency: "crypto",
  coin: "crypto",
  token: "crypto",
  etf: "etf",
  commodity: "commodity",
  commodities: "commodity",
  commod: "commodity",
  index: "index",
  indices: "index",
  idx: "index",
};

const WELL_KNOWN_CRYPTO = new Set([
  "BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "DOT", "LINK", "AVAX",
  "MATIC", "POL", "UNI", "AAVE", "NEAR", "TAO", "ATOM", "FIL", "APT",
  "ARB", "OP", "SUI", "SEI", "TIA", "INJ", "PEPE", "SHIB", "LTC",
  "BCH", "ETC", "XLM", "ALGO", "HBAR", "VET", "FTM", "MANA", "SAND",
  "AXS", "CRV", "MKR", "COMP", "SNX", "USDT", "USDC", "DAI", "TON",
  "TRX", "LEO", "OKB", "RENDER", "FET", "GRT", "THETA", "RUNE",
  "STX", "IMX", "WLD", "JUP", "ONDO", "BONK", "WIF", "FLOKI",
  "PENDLE", "ENA", "JASMY", "CAKE", "1INCH", "SUSHI", "YFI", "BAL",
]);

const SQL_KEYWORDS = new Set([
  "SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "UNION",
  "EXEC", "TRUNCATE", "CREATE", "TABLE", "FROM", "WHERE", "OR",
  "AND", "LIKE", "GRANT", "REVOKE",
]);

export const VALID_ASSET_TYPES = new Set(["stock", "etf", "crypto", "commodity", "index"]);

// ── Types ──────────────────────────────────────────────────────────────

export type ParseSuccess = { ok: true; symbol: string; assetType: string };
export type ParseError = { ok: false; error: string };
export type ParseResult = ParseSuccess | ParseError;

export type ValidationOk = { valid: true };
export type ValidationFail = { valid: false; reason: string };
export type ValidationResult = ValidationOk | ValidationFail;

// ── Commodity/Index catalog (for auto-detection when no type given) ────

type CatalogEntry = { symbol: string; assetType: "commodity" | "index"; displayName: string };

const ASSET_CATALOG: Record<string, CatalogEntry> = (() => {
  const m: Record<string, CatalogEntry> = {};
  const add = (keys: string[], symbol: string, assetType: "commodity" | "index", displayName: string) => {
    const entry: CatalogEntry = { symbol, assetType, displayName };
    for (const k of keys) m[k.toUpperCase()] = entry;
  };

  add(["GOLD", "XAUUSD"], "GOLD", "commodity", "Gold");
  add(["SILVER", "XAGUSD"], "SILVER", "commodity", "Silver");
  add(["OIL", "CRUDE", "CRUDEOIL", "WTI", "BRENT"], "OIL", "commodity", "Crude Oil");
  add(["NATGAS", "NATURALGAS", "GAS"], "NATGAS", "commodity", "Natural Gas");
  add(["COPPER"], "COPPER", "commodity", "Copper");
  add(["PLATINUM"], "PLATINUM", "commodity", "Platinum");
  add(["PALLADIUM"], "PALLADIUM", "commodity", "Palladium");
  add(["ALUMINUM", "ALUMINIUM"], "ALUMINUM", "commodity", "Aluminum");
  add(["WHEAT"], "WHEAT", "commodity", "Wheat");
  add(["CORN"], "CORN", "commodity", "Corn");
  add(["SUGAR"], "SUGAR", "commodity", "Sugar");
  add(["COTTON"], "COTTON", "commodity", "Cotton");
  add(["COFFEE"], "COFFEE", "commodity", "Coffee");
  add(["COCOA"], "COCOA", "commodity", "Cocoa");

  add(["SPX500", "SP500", "S&P500", "S&P", "SNP500"], "SPX500", "index", "S&P 500");
  add(["NSDQ100", "NASDAQ", "NASDAQ100", "NDX", "QQQ"], "NSDQ100", "index", "NASDAQ 100");
  add(["DJ30", "DOW", "DOWJONES", "DJIA"], "DJ30", "index", "Dow Jones 30");
  add(["UK100", "FTSE", "FTSE100"], "UK100", "index", "FTSE 100");
  add(["GER40", "DAX", "DAX40"], "GER40", "index", "DAX 40");
  add(["FRA40", "CAC", "CAC40"], "FRA40", "index", "CAC 40");
  add(["JPN225", "NIKKEI", "NIKKEI225"], "JPN225", "index", "Nikkei 225");
  add(["AUS200", "ASX", "ASX200"], "AUS200", "index", "ASX 200");
  add(["HKG50", "HANGSENG", "HSI"], "HKG50", "index", "Hang Seng 50");
  add(["EUSTX50", "EUROSTOXX", "STOXX50"], "EUSTX50", "index", "Euro Stoxx 50");
  add(["NIFTY50", "NIFTY"], "NIFTY50", "index", "Nifty 50");

  return m;
})();

// ── Public API ─────────────────────────────────────────────────────────

export function sanitizeInput(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_INPUT_LENGTH);
}

export function normalizeAssetType(raw: string): string | null {
  if (!raw) return null;
  return ASSET_TYPE_ALIASES[raw.toLowerCase()] ?? null;
}

export function inferAssetType(symbol: string): string {
  const upper = symbol.toUpperCase();
  const catalog = ASSET_CATALOG[upper];
  if (catalog) return catalog.assetType;
  if (WELL_KNOWN_CRYPTO.has(upper)) return "crypto";
  return "stock";
}

export function validateSymbol(symbol: string): ValidationResult {
  if (!symbol) return { valid: false, reason: "Symbol is required." };
  if (symbol.length > MAX_SYMBOL_LENGTH)
    return { valid: false, reason: `Symbol too long (max ${MAX_SYMBOL_LENGTH} characters).` };
  if (!SYMBOL_REGEX.test(symbol))
    return { valid: false, reason: "Invalid symbol format. Only letters, numbers, '/', '.', '-', '&' allowed." };
  if (SQL_KEYWORDS.has(symbol.toUpperCase()))
    return { valid: false, reason: "Invalid symbol." };
  return { valid: true };
}

export function normalizeSymbol(
  symbol: string,
  assetType: string,
): { symbol: string; displayName: string } {
  let sym = symbol.replace(/^\$/, "").toUpperCase().trim();

  const catalog = ASSET_CATALOG[sym];
  if (catalog && (assetType === catalog.assetType || assetType === "stock")) {
    return { symbol: catalog.symbol, displayName: catalog.displayName };
  }

  if (assetType === "crypto") {
    if (!sym.includes("/")) sym = `${sym}/USD`;
    return { symbol: sym, displayName: sym.split("/")[0]! };
  }

  return { symbol: sym, displayName: sym };
}

export function buildSuggestion(symbol: string, failedAssetType: string): string | null {
  const upper = symbol.toUpperCase();
  if (failedAssetType === "stock" && WELL_KNOWN_CRYPTO.has(upper)) {
    return `Did you mean \`/add ${upper} crypto\`?`;
  }
  if (failedAssetType === "crypto" && !WELL_KNOWN_CRYPTO.has(upper) && /^[A-Z]{2,5}$/.test(upper)) {
    return `Did you mean \`/add ${upper} stock\`?`;
  }
  const catalog = ASSET_CATALOG[upper];
  if (catalog && failedAssetType !== catalog.assetType) {
    return `Did you mean \`/add ${upper} ${catalog.assetType}\`?`;
  }
  return null;
}

export function parseAddArgs(rawArgs: string): ParseResult {
  const cleaned = sanitizeInput(rawArgs);
  if (!cleaned) return { ok: false, error: "empty" };

  const parts = cleaned.split(" ");
  const rawSymbol = parts[0]!;
  const rawType = parts[1];

  const validation = validateSymbol(rawSymbol);
  if (!validation.valid) return { ok: false, error: validation.reason };

  let assetType: string;

  if (rawType) {
    const normalized = normalizeAssetType(rawType);
    if (!normalized) {
      const validList = [...VALID_ASSET_TYPES].join("`, `");
      return { ok: false, error: `Invalid type '${rawType}'. Use: \`${validList}\`.` };
    }
    assetType = normalized;
  } else {
    assetType = inferAssetType(rawSymbol);
  }

  const { symbol } = normalizeSymbol(rawSymbol, assetType);

  return { ok: true, symbol, assetType };
}

export function getCatalogEntry(symbol: string): CatalogEntry | undefined {
  return ASSET_CATALOG[symbol.toUpperCase()];
}

export function getDisplayName(symbol: string, assetType: string): string {
  return normalizeSymbol(symbol, assetType).displayName;
}
