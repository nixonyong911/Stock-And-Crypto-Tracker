namespace DataFetcher.Worker.Application.Providers.Etoro;

public static class EtoroAssetCatalog
{
    public record CatalogEntry(
        string EtoroSymbol,
        int InstrumentId,
        string DisplayName,
        string AssetType,
        string Exchange);

    private static readonly Dictionary<string, CatalogEntry> _entries = BuildCatalog();

    public static bool TryLookup(string symbol, string assetType, out CatalogEntry? entry)
    {
        var key = NormalizeKey(symbol, assetType);
        return _entries.TryGetValue(key, out entry);
    }

    public static bool TryLookupByAlias(string alias, out CatalogEntry? entry)
    {
        entry = null;
        var normalizedAlias = alias.ToUpperInvariant().Trim();

        foreach (var kvp in _entries)
        {
            if (kvp.Value.EtoroSymbol.Equals(normalizedAlias, StringComparison.OrdinalIgnoreCase))
            {
                entry = kvp.Value;
                return true;
            }
        }

        if (_aliasMap.TryGetValue(normalizedAlias, out var canonical))
            return _entries.TryGetValue(canonical, out entry);

        return false;
    }

    private static string NormalizeKey(string symbol, string assetType) =>
        $"{assetType.ToUpperInvariant()}:{symbol.ToUpperInvariant().Trim()}";

    private static readonly Dictionary<string, string> _aliasMap = BuildAliasMap();

    private static Dictionary<string, CatalogEntry> BuildCatalog()
    {
        var catalog = new Dictionary<string, CatalogEntry>(StringComparer.OrdinalIgnoreCase);

        void Add(string assetType, string symbol, int instrumentId, string displayName, string exchange = "eToro")
        {
            catalog[$"{assetType.ToUpperInvariant()}:{symbol.ToUpperInvariant()}"] =
                new CatalogEntry(symbol.ToUpperInvariant(), instrumentId, displayName, assetType, exchange);
        }

        // ── Commodities (spot / main CFD instruments) ──
        Add("Commodity", "GOLD", 18, "Gold");
        Add("Commodity", "SILVER", 19, "Silver");
        Add("Commodity", "OIL", 17, "Crude Oil (WTI)");
        Add("Commodity", "NATGAS", 22, "Natural Gas");
        Add("Commodity", "COPPER", 21, "Copper");
        Add("Commodity", "PLATINUM", 40, "Platinum");
        Add("Commodity", "PALLADIUM", 91, "Palladium");
        Add("Commodity", "ALUMINUM", 344, "Aluminum");
        Add("Commodity", "NICKEL", 343, "Nickel");
        Add("Commodity", "ZINC", 340, "Zinc");
        Add("Commodity", "LEAD", 339, "Lead");
        Add("Commodity", "WHEAT", 97, "Wheat");
        Add("Commodity", "CORN", 331, "Corn");
        Add("Commodity", "SUGAR", 92, "Sugar");
        Add("Commodity", "COTTON", 93, "Cotton");
        Add("Commodity", "COFFEE", 334, "Coffee");
        Add("Commodity", "COCOA", 96, "Cocoa");
        Add("Commodity", "SOYBEANS", 332, "Soybeans");
        Add("Commodity", "IRONORE", 557, "Iron Ore");
        Add("Commodity", "RUBBER", 558, "Rubber");
        Add("Commodity", "LUMBER", 382, "Lumber");
        Add("Commodity", "RICE", 325, "Rice");
        Add("Commodity", "OATS", 324, "Oats");
        Add("Commodity", "STEEL", 380, "Steel");
        Add("Commodity", "COAL", 379, "Coal");

        // ── Indices (spot instruments) ──
        Add("Index", "SPX500", 27, "S&P 500", "CME");
        Add("Index", "NSDQ100", 28, "NASDAQ 100", "CME");
        Add("Index", "DJ30", 29, "Dow Jones 30", "CME");
        Add("Index", "UK100", 30, "FTSE 100", "LSE");
        Add("Index", "GER40", 32, "DAX 40", "XETRA");
        Add("Index", "FRA40", 31, "CAC 40", "EURONEXT");
        Add("Index", "JPN225", 36, "Nikkei 225", "JPX");
        Add("Index", "AUS200", 33, "ASX 200", "ASX");
        Add("Index", "ESP35", 34, "IBEX 35", "BME");
        Add("Index", "HKG50", 38, "Hang Seng 50", "HKEX");
        Add("Index", "CHINA50", 253, "China A50", "SGX");
        Add("Index", "EUSTX50", 43, "Euro Stoxx 50", "EUREX");
        Add("Index", "NIFTY50", 305, "Nifty 50", "NSE");
        Add("Index", "USDOLLAR", 25, "US Dollar Index", "ICE");
        Add("Index", "NL25", 353, "AEX 25", "EURONEXT");
        Add("Index", "ITALY40", 321, "FTSE MIB 40", "BIT");
        Add("Index", "SWITZERLAND20", 322, "Swiss Market Index", "SIX");

        return catalog;
    }

    private static Dictionary<string, string> BuildAliasMap()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        void Alias(string alias, string assetType, string canonicalSymbol) =>
            map[alias] = $"{assetType.ToUpperInvariant()}:{canonicalSymbol.ToUpperInvariant()}";

        // Commodity aliases
        Alias("CRUDEOIL", "Commodity", "OIL");
        Alias("CRUDE", "Commodity", "OIL");
        Alias("WTI", "Commodity", "OIL");
        Alias("BRENT", "Commodity", "OIL");
        Alias("NATURALGAS", "Commodity", "NATGAS");
        Alias("GAS", "Commodity", "NATGAS");
        Alias("XAUUSD", "Commodity", "GOLD");
        Alias("XAGUSD", "Commodity", "SILVER");
        Alias("SOYBEAN", "Commodity", "SOYBEANS");
        Alias("ALUMINIUM", "Commodity", "ALUMINUM");
        Alias("WOOD", "Commodity", "LUMBER");
        Alias("IRON", "Commodity", "IRONORE");

        // Index aliases
        Alias("SP500", "Index", "SPX500");
        Alias("S&P500", "Index", "SPX500");
        Alias("S&P", "Index", "SPX500");
        Alias("SNP500", "Index", "SPX500");
        Alias("NASDAQ", "Index", "NSDQ100");
        Alias("NASDAQ100", "Index", "NSDQ100");
        Alias("NDX", "Index", "NSDQ100");
        Alias("QQQ", "Index", "NSDQ100");
        Alias("DOW", "Index", "DJ30");
        Alias("DOWJONES", "Index", "DJ30");
        Alias("DJIA", "Index", "DJ30");
        Alias("FTSE", "Index", "UK100");
        Alias("FTSE100", "Index", "UK100");
        Alias("DAX", "Index", "GER40");
        Alias("DAX40", "Index", "GER40");
        Alias("CAC", "Index", "FRA40");
        Alias("CAC40", "Index", "FRA40");
        Alias("NIKKEI", "Index", "JPN225");
        Alias("NIKKEI225", "Index", "JPN225");
        Alias("ASX", "Index", "AUS200");
        Alias("ASX200", "Index", "AUS200");
        Alias("IBEX", "Index", "ESP35");
        Alias("IBEX35", "Index", "ESP35");
        Alias("HANGSENG", "Index", "HKG50");
        Alias("HSI", "Index", "HKG50");
        Alias("EUROSTOXX", "Index", "EUSTX50");
        Alias("STOXX50", "Index", "EUSTX50");
        Alias("NIFTY", "Index", "NIFTY50");
        Alias("DXY", "Index", "USDOLLAR");
        Alias("AEX", "Index", "NL25");
        Alias("MIB", "Index", "ITALY40");
        Alias("SMI", "Index", "SWITZERLAND20");

        return map;
    }
}
