import { describe, it, expect } from "vitest";
import {
  sanitizeInput,
  normalizeAssetType,
  inferAssetType,
  validateSymbol,
  normalizeSymbol,
  buildSuggestion,
  parseAddArgs,
  getCatalogEntry,
  getDisplayName,
} from "../add-utils.js";

// ── sanitizeInput ──────────────────────────────────────────────────────

describe("sanitizeInput", () => {
  it("trims whitespace", () => {
    expect(sanitizeInput("  AAPL  ")).toBe("AAPL");
  });

  it("collapses multiple spaces", () => {
    expect(sanitizeInput("AAPL   stock")).toBe("AAPL stock");
  });

  it("truncates at 50 chars", () => {
    const long = "A".repeat(60);
    expect(sanitizeInput(long).length).toBe(50);
  });

  it("handles empty string", () => {
    expect(sanitizeInput("")).toBe("");
  });

  it("handles whitespace-only", () => {
    expect(sanitizeInput("   ")).toBe("");
  });
});

// ── normalizeAssetType ─────────────────────────────────────────────────

describe("normalizeAssetType", () => {
  it.each([
    ["stock", "stock"],
    ["stocks", "stock"],
    ["equity", "stock"],
    ["equities", "stock"],
    ["share", "stock"],
    ["shares", "stock"],
  ])("maps '%s' to 'stock'", (input, expected) => {
    expect(normalizeAssetType(input)).toBe(expected);
  });

  it.each([
    ["crypto", "crypto"],
    ["cryptocurrency", "crypto"],
    ["coin", "crypto"],
    ["token", "crypto"],
  ])("maps '%s' to 'crypto'", (input, expected) => {
    expect(normalizeAssetType(input)).toBe(expected);
  });

  it("maps 'etf' to 'etf'", () => {
    expect(normalizeAssetType("etf")).toBe("etf");
  });

  it.each([
    ["commodity", "commodity"],
    ["commodities", "commodity"],
    ["commod", "commodity"],
  ])("maps '%s' to 'commodity'", (input, expected) => {
    expect(normalizeAssetType(input)).toBe(expected);
  });

  it.each([
    ["index", "index"],
    ["indices", "index"],
    ["idx", "index"],
  ])("maps '%s' to 'index'", (input, expected) => {
    expect(normalizeAssetType(input)).toBe(expected);
  });

  it("is case insensitive", () => {
    expect(normalizeAssetType("STOCK")).toBe("stock");
    expect(normalizeAssetType("Crypto")).toBe("crypto");
    expect(normalizeAssetType("ETF")).toBe("etf");
  });

  it("returns null for unknown types", () => {
    expect(normalizeAssetType("bond")).toBeNull();
    expect(normalizeAssetType("forex")).toBeNull();
    expect(normalizeAssetType("option")).toBeNull();
    expect(normalizeAssetType("futures")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeAssetType("")).toBeNull();
  });
});

// ── inferAssetType ─────────────────────────────────────────────────────

describe("inferAssetType", () => {
  it.each(["BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "TAO", "NEAR", "SHIB", "PEPE"])(
    "detects %s as crypto",
    (sym) => {
      expect(inferAssetType(sym)).toBe("crypto");
    },
  );

  it("is case insensitive for crypto", () => {
    expect(inferAssetType("btc")).toBe("crypto");
    expect(inferAssetType("Eth")).toBe("crypto");
  });

  it.each([
    "GOLD", "SILVER", "OIL", "NATGAS", "COPPER", "WHEAT", "CORN",
    "PLATINUM", "PALLADIUM", "ALUMINUM", "NICKEL", "ZINC", "LEAD",
    "SUGAR", "COTTON", "COFFEE", "COCOA", "SOYBEANS", "IRONORE",
    "RUBBER", "LUMBER", "RICE", "OATS", "STEEL", "COAL",
    "CARBON", "EUROOIL", "EURNATGAS", "UKNATGAS", "GASOLINE",
    "HEATINGOIL", "GASOIL", "LEANHOGS", "LIVECATTLE", "MILK",
    "CANOLA", "OJ", "SOYMEAL", "SOYOIL", "POWER",
  ])(
    "detects %s as commodity",
    (sym) => {
      expect(inferAssetType(sym)).toBe("commodity");
    },
  );

  it("detects commodity aliases", () => {
    expect(inferAssetType("XAUUSD")).toBe("commodity");
    expect(inferAssetType("CRUDE")).toBe("commodity");
    expect(inferAssetType("NATURALGAS")).toBe("commodity");
    expect(inferAssetType("BRENT")).toBe("commodity");
    expect(inferAssetType("HOGS")).toBe("commodity");
    expect(inferAssetType("CATTLE")).toBe("commodity");
    expect(inferAssetType("ORANGEJUICE")).toBe("commodity");
    expect(inferAssetType("EMISSIONS")).toBe("commodity");
    expect(inferAssetType("RBOB")).toBe("commodity");
    expect(inferAssetType("IRON")).toBe("commodity");
    expect(inferAssetType("WOOD")).toBe("commodity");
  });

  it.each([
    "SPX500", "NSDQ100", "DJ30", "DAX", "FTSE", "NIKKEI", "NASDAQ",
    "UK100", "GER40", "FRA40", "JPN225", "AUS200", "ESP35", "HKG50",
    "CHINA50", "EUSTX50", "NIFTY50", "USDOLLAR", "NL25", "ITALY40",
    "SWITZERLAND20", "RTY", "SGX", "SWEDEN30", "NORWAY25", "CANADA60",
    "AILEADERS", "SEMIS", "CYBER", "GOLDMINERS", "CRYPTO10", "QUANTUM",
  ])(
    "detects %s as index",
    (sym) => {
      expect(inferAssetType(sym)).toBe("index");
    },
  );

  it("detects index aliases", () => {
    expect(inferAssetType("DOW")).toBe("index");
    expect(inferAssetType("S&P500")).toBe("index");
    expect(inferAssetType("HANGSENG")).toBe("index");
    expect(inferAssetType("RUSSELL")).toBe("index");
    expect(inferAssetType("DXY")).toBe("index");
    expect(inferAssetType("TSX")).toBe("index");
    expect(inferAssetType("SEMICONDUCTORS")).toBe("index");
    expect(inferAssetType("IBEX")).toBe("index");
    expect(inferAssetType("MIB")).toBe("index");
  });

  it("defaults to stock for unknown symbols", () => {
    expect(inferAssetType("AAPL")).toBe("stock");
    expect(inferAssetType("MSFT")).toBe("stock");
    expect(inferAssetType("RANDOMXYZ")).toBe("stock");
  });
});

// ── validateSymbol ─────────────────────────────────────────────────────

describe("validateSymbol", () => {
  it.each(["AAPL", "BTC", "SPY", "BTC/USD", "SHEL.L", "BRK-B", "S&P500", "A", "1234"])(
    "accepts valid symbol '%s'",
    (sym) => {
      expect(validateSymbol(sym)).toEqual({ valid: true });
    },
  );

  it("rejects empty string", () => {
    expect(validateSymbol("")).toEqual({ valid: false, reason: "Symbol is required." });
  });

  it("rejects symbol over 20 chars", () => {
    const result = validateSymbol("A".repeat(21));
    expect(result.valid).toBe(false);
  });

  it("accepts exactly 20 chars", () => {
    expect(validateSymbol("A".repeat(20)).valid).toBe(true);
  });

  it("rejects SQL injection attempts", () => {
    expect(validateSymbol("DROP").valid).toBe(false);
    expect(validateSymbol("SELECT").valid).toBe(false);
    expect(validateSymbol("UNION").valid).toBe(false);
    expect(validateSymbol("INSERT").valid).toBe(false);
    expect(validateSymbol("DELETE").valid).toBe(false);
    expect(validateSymbol("TRUNCATE").valid).toBe(false);
  });

  it("rejects special characters", () => {
    expect(validateSymbol("AAPL!").valid).toBe(false);
    expect(validateSymbol("@AAPL").valid).toBe(false);
    expect(validateSymbol("AAPL#").valid).toBe(false);
    expect(validateSymbol("AA PL").valid).toBe(false);
    expect(validateSymbol("AAPL;").valid).toBe(false);
  });

  it("rejects XSS attempts", () => {
    expect(validateSymbol("<script>").valid).toBe(false);
    expect(validateSymbol("alert(1)").valid).toBe(false);
    expect(validateSymbol("<img>").valid).toBe(false);
  });

  it("allows dots and slashes (needed for SHEL.L, BTC/USD)", () => {
    expect(validateSymbol("../etc").valid).toBe(true);
  });

  it("SQL keywords are case-insensitive", () => {
    expect(validateSymbol("drop").valid).toBe(false);
    expect(validateSymbol("Select").valid).toBe(false);
  });
});

// ── normalizeSymbol ────────────────────────────────────────────────────

describe("normalizeSymbol", () => {
  it("uppercases symbol", () => {
    expect(normalizeSymbol("aapl", "stock").symbol).toBe("AAPL");
  });

  it("strips leading $", () => {
    expect(normalizeSymbol("$AAPL", "stock").symbol).toBe("AAPL");
  });

  it("appends /USD for crypto without slash", () => {
    expect(normalizeSymbol("btc", "crypto").symbol).toBe("BTC/USD");
  });

  it("keeps existing /USD for crypto", () => {
    expect(normalizeSymbol("btc/usd", "crypto").symbol).toBe("BTC/USD");
  });

  it("crypto displayName is base symbol only", () => {
    expect(normalizeSymbol("btc", "crypto").displayName).toBe("BTC");
    expect(normalizeSymbol("btc/usd", "crypto").displayName).toBe("BTC");
  });

  it("resolves catalog commodity to canonical symbol", () => {
    const result = normalizeSymbol("XAUUSD", "commodity");
    expect(result.symbol).toBe("GOLD");
    expect(result.displayName).toBe("Gold");
  });

  it("resolves catalog index aliases", () => {
    const result = normalizeSymbol("DOW", "index");
    expect(result.symbol).toBe("DJ30");
    expect(result.displayName).toBe("Dow Jones 30");
  });

  it("stock symbol passthrough", () => {
    const result = normalizeSymbol("AAPL", "stock");
    expect(result.symbol).toBe("AAPL");
    expect(result.displayName).toBe("AAPL");
  });
});

// ── buildSuggestion ────────────────────────────────────────────────────

describe("buildSuggestion", () => {
  it("suggests crypto when stock lookup failed for known crypto", () => {
    const s = buildSuggestion("BTC", "stock");
    expect(s).toContain("crypto");
  });

  it("suggests stock when crypto lookup failed for stock-like symbol", () => {
    const s = buildSuggestion("AAPL", "crypto");
    expect(s).toContain("stock");
  });

  it("suggests commodity for catalog match", () => {
    const s = buildSuggestion("GOLD", "stock");
    expect(s).toContain("commodity");
  });

  it("returns null when no suggestion available", () => {
    expect(buildSuggestion("RANDOMXYZ", "stock")).toBeNull();
  });

  it("returns null when already correct type", () => {
    expect(buildSuggestion("BTC", "crypto")).toBeNull();
  });
});

// ── parseAddArgs (integration) ─────────────────────────────────────────

describe("parseAddArgs", () => {
  it("empty input returns error", () => {
    const r = parseAddArgs("");
    expect(r.ok).toBe(false);
  });

  it("whitespace-only returns error", () => {
    const r = parseAddArgs("   ");
    expect(r.ok).toBe(false);
  });

  it("AAPL alone defaults to stock", () => {
    const r = parseAddArgs("AAPL");
    expect(r).toEqual({ ok: true, symbol: "AAPL", assetType: "stock" });
  });

  it("AAPL stock explicit", () => {
    const r = parseAddArgs("AAPL stock");
    expect(r).toEqual({ ok: true, symbol: "AAPL", assetType: "stock" });
  });

  it("BTC alone auto-detects as crypto", () => {
    const r = parseAddArgs("BTC");
    expect(r).toEqual({ ok: true, symbol: "BTC/USD", assetType: "crypto" });
  });

  it("BTC crypto explicit", () => {
    const r = parseAddArgs("BTC crypto");
    expect(r).toEqual({ ok: true, symbol: "BTC/USD", assetType: "crypto" });
  });

  it("BTC coin alias", () => {
    const r = parseAddArgs("BTC coin");
    expect(r).toEqual({ ok: true, symbol: "BTC/USD", assetType: "crypto" });
  });

  it("BTC token alias", () => {
    const r = parseAddArgs("BTC token");
    expect(r).toEqual({ ok: true, symbol: "BTC/USD", assetType: "crypto" });
  });

  it("SPY etf", () => {
    const r = parseAddArgs("SPY etf");
    expect(r).toEqual({ ok: true, symbol: "SPY", assetType: "etf" });
  });

  it("GOLD auto-detects as commodity", () => {
    const r = parseAddArgs("GOLD");
    expect(r).toEqual({ ok: true, symbol: "GOLD", assetType: "commodity" });
  });

  it("GOLD commodity explicit", () => {
    const r = parseAddArgs("GOLD commodity");
    expect(r).toEqual({ ok: true, symbol: "GOLD", assetType: "commodity" });
  });

  it("SPX500 auto-detects as index", () => {
    const r = parseAddArgs("SPX500");
    expect(r).toEqual({ ok: true, symbol: "SPX500", assetType: "index" });
  });

  it("DOW auto-detects as index and maps to DJ30", () => {
    const r = parseAddArgs("DOW");
    expect(r).toEqual({ ok: true, symbol: "DJ30", assetType: "index" });
  });

  it("NASDAQ auto-detects as index and maps to NSDQ100", () => {
    const r = parseAddArgs("NASDAQ");
    expect(r).toEqual({ ok: true, symbol: "NSDQ100", assetType: "index" });
  });

  it("AAPL stocks alias", () => {
    const r = parseAddArgs("AAPL stocks");
    expect(r).toEqual({ ok: true, symbol: "AAPL", assetType: "stock" });
  });

  it("AAPL equity alias", () => {
    const r = parseAddArgs("AAPL equity");
    expect(r).toEqual({ ok: true, symbol: "AAPL", assetType: "stock" });
  });

  it("SHEL.L defaults to stock (dots allowed)", () => {
    const r = parseAddArgs("SHEL.L");
    expect(r).toEqual({ ok: true, symbol: "SHEL.L", assetType: "stock" });
  });

  it("handles extra whitespace", () => {
    const r = parseAddArgs("  AAPL   stock  ");
    expect(r).toEqual({ ok: true, symbol: "AAPL", assetType: "stock" });
  });

  it("case insensitive symbol", () => {
    const r = parseAddArgs("aapl");
    expect(r).toEqual({ ok: true, symbol: "AAPL", assetType: "stock" });
  });

  it("case insensitive type", () => {
    const r = parseAddArgs("AAPL STOCK");
    expect(r).toEqual({ ok: true, symbol: "AAPL", assetType: "stock" });
  });

  it("invalid type returns error with valid types list", () => {
    const r = parseAddArgs("AAPL bond");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("bond");
  });

  it("ignores extra arguments", () => {
    const r = parseAddArgs("AAPL stock extra stuff");
    expect(r).toEqual({ ok: true, symbol: "AAPL", assetType: "stock" });
  });

  it("rejects SQL injection", () => {
    const r = parseAddArgs("DROP");
    expect(r.ok).toBe(false);
  });

  it("rejects invalid chars", () => {
    const r = parseAddArgs("AAPL!@#");
    expect(r.ok).toBe(false);
  });

  it("rejects too-long symbol", () => {
    const r = parseAddArgs("A".repeat(21));
    expect(r.ok).toBe(false);
  });

  it("TAO auto-detects as crypto", () => {
    const r = parseAddArgs("TAO");
    expect(r).toEqual({ ok: true, symbol: "TAO/USD", assetType: "crypto" });
  });

  it("NEAR auto-detects as crypto", () => {
    const r = parseAddArgs("NEAR");
    expect(r).toEqual({ ok: true, symbol: "NEAR/USD", assetType: "crypto" });
  });

  it("ETH auto-detects as crypto", () => {
    const r = parseAddArgs("ETH");
    expect(r).toEqual({ ok: true, symbol: "ETH/USD", assetType: "crypto" });
  });

  it("SOL auto-detects as crypto", () => {
    const r = parseAddArgs("SOL");
    expect(r).toEqual({ ok: true, symbol: "SOL/USD", assetType: "crypto" });
  });

  it("OIL auto-detects as commodity", () => {
    const r = parseAddArgs("OIL");
    expect(r).toEqual({ ok: true, symbol: "OIL", assetType: "commodity" });
  });

  it("CRUDE alias for commodity", () => {
    const r = parseAddArgs("CRUDE");
    expect(r).toEqual({ ok: true, symbol: "OIL", assetType: "commodity" });
  });

  it("commodity with commodities alias type", () => {
    const r = parseAddArgs("GOLD commodities");
    expect(r).toEqual({ ok: true, symbol: "GOLD", assetType: "commodity" });
  });

  it("index with indices alias type", () => {
    const r = parseAddArgs("SPX500 indices");
    expect(r).toEqual({ ok: true, symbol: "SPX500", assetType: "index" });
  });

  // ── New commodities ────────────────────────────────────────────────
  it("CARBON auto-detects as commodity", () => {
    const r = parseAddArgs("CARBON");
    expect(r).toEqual({ ok: true, symbol: "CARBON", assetType: "commodity" });
  });

  it("BRENT auto-detects as commodity (Brent oil)", () => {
    const r = parseAddArgs("BRENT");
    expect(r).toEqual({ ok: true, symbol: "EUROOIL", assetType: "commodity" });
  });

  it("HOGS alias maps to LEANHOGS commodity", () => {
    const r = parseAddArgs("HOGS");
    expect(r).toEqual({ ok: true, symbol: "LEANHOGS", assetType: "commodity" });
  });

  it("ORANGEJUICE alias maps to OJ commodity", () => {
    const r = parseAddArgs("ORANGEJUICE");
    expect(r).toEqual({ ok: true, symbol: "OJ", assetType: "commodity" });
  });

  it("NICKEL explicit commodity", () => {
    const r = parseAddArgs("NICKEL commodity");
    expect(r).toEqual({ ok: true, symbol: "NICKEL", assetType: "commodity" });
  });

  it("SOYBEANS auto-detects as commodity", () => {
    const r = parseAddArgs("SOYBEANS");
    expect(r).toEqual({ ok: true, symbol: "SOYBEANS", assetType: "commodity" });
  });

  it("IRON alias maps to IRONORE commodity", () => {
    const r = parseAddArgs("IRON");
    expect(r).toEqual({ ok: true, symbol: "IRONORE", assetType: "commodity" });
  });

  it("WOOD alias maps to LUMBER commodity", () => {
    const r = parseAddArgs("WOOD");
    expect(r).toEqual({ ok: true, symbol: "LUMBER", assetType: "commodity" });
  });

  // ── New indices ────────────────────────────────────────────────────
  it("RUSSELL alias maps to RTY index", () => {
    const r = parseAddArgs("RUSSELL");
    expect(r).toEqual({ ok: true, symbol: "RTY", assetType: "index" });
  });

  it("RTY auto-detects as index", () => {
    const r = parseAddArgs("RTY");
    expect(r).toEqual({ ok: true, symbol: "RTY", assetType: "index" });
  });

  it("DXY alias maps to USDOLLAR index", () => {
    const r = parseAddArgs("DXY");
    expect(r).toEqual({ ok: true, symbol: "USDOLLAR", assetType: "index" });
  });

  it("TSX alias maps to CANADA60 index", () => {
    const r = parseAddArgs("TSX");
    expect(r).toEqual({ ok: true, symbol: "CANADA60", assetType: "index" });
  });

  it("SEMICONDUCTORS alias maps to SEMIS index", () => {
    const r = parseAddArgs("SEMICONDUCTORS");
    expect(r).toEqual({ ok: true, symbol: "SEMIS", assetType: "index" });
  });

  it("IBEX alias maps to ESP35 index", () => {
    const r = parseAddArgs("IBEX");
    expect(r).toEqual({ ok: true, symbol: "ESP35", assetType: "index" });
  });

  it("SWEDEN30 auto-detects as index", () => {
    const r = parseAddArgs("SWEDEN30");
    expect(r).toEqual({ ok: true, symbol: "SWEDEN30", assetType: "index" });
  });

  it("CRYPTO10 auto-detects as index", () => {
    const r = parseAddArgs("CRYPTO10");
    expect(r).toEqual({ ok: true, symbol: "CRYPTO10", assetType: "index" });
  });
});

// ── getCatalogEntry / getDisplayName ───────────────────────────────────

describe("getCatalogEntry", () => {
  it("returns entry for known commodity", () => {
    const e = getCatalogEntry("GOLD");
    expect(e?.assetType).toBe("commodity");
    expect(e?.symbol).toBe("GOLD");
  });

  it("returns entry for known index alias", () => {
    const e = getCatalogEntry("DOW");
    expect(e?.assetType).toBe("index");
    expect(e?.symbol).toBe("DJ30");
  });

  it("returns undefined for unknown", () => {
    expect(getCatalogEntry("AAPL")).toBeUndefined();
  });
});

describe("getDisplayName", () => {
  it("returns human-friendly name for Gold", () => {
    expect(getDisplayName("GOLD", "commodity")).toBe("Gold");
  });

  it("returns symbol for plain stock", () => {
    expect(getDisplayName("AAPL", "stock")).toBe("AAPL");
  });

  it("returns base for crypto", () => {
    expect(getDisplayName("BTC/USD", "crypto")).toBe("BTC");
  });
});
