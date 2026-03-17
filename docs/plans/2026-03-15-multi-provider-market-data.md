# Multi-Provider Market Data Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a provider-agnostic market data layer where tickers are verified and fetched across multiple providers (Alpaca, eToro, future providers) with automatic failover, rate limit awareness, and per-ticker source tracking.

**Architecture:** Introduce an `IMarketDataProvider` abstraction that each provider implements. A `MarketDataResolver` orchestrates verification and fetching by trying providers in priority order. Each ticker stores which provider successfully serves its data. Scheduled fetch workers use the resolver for failover when a primary source fails or hits rate limits.

**Tech Stack:** C# (.NET 8), Dapper, PostgreSQL, RabbitMQ, HTTP clients with Polly retry

---

## Research Summary

### Provider Comparison

| Criteria | Alpaca | eToro |
|---|---|---|
| US Stocks | 13,390 (NASDAQ, NYSE, ARCA, BATS, OTC, AMEX) | Global exchanges |
| Crypto | 36 coins, 73 pairs | 127 coins |
| Commodities | None | 29 (gold, oil, silver, natgas, corn, wheat, coffee...) |
| Indices | None | 43 (S&P500, NASDAQ100, DAX, Nikkei, FTSE...) |
| Rate Limit | **200 req/min free**, 10k/min paid ($99/mo). Exposed via headers. | **Unknown** — not documented |
| Data Freshness | Stocks: IEX (free) or SIP (paid). Crypto: real-time, no auth | Unclear for API |
| Auth | `APCA-API-KEY-ID` + `APCA-API-SECRET-KEY` headers | `x-api-key` + `x-user-key` + `x-request-id` (UUID per request) |
| Symbol Format | Ticker strings (AAPL, BTC/USD) | Numeric `instrumentId` — requires symbol-to-ID lookup |
| OHLCV Format | Standard with VWAP, trade count | Standard OHLCV only |

### Provider Priority (recommended)

1. **Alpaca** — primary for US stocks and supported crypto (generous 200 req/min, well-documented, real-time crypto)
2. **eToro** — fallback for crypto not on Alpaca, commodities, indices (broader coverage, unknown rate limits)

### Key Constraints
- eToro uses `instrumentId` (integer) not ticker symbols — every eToro call needs a prior symbol resolution
- eToro rate limits are undocumented — must implement conservative rate tracking
- eToro requires a verified trading account for API keys (two keys: api-key + user-key)
- TAO (Bittensor) is NOT on either Alpaca (36 coins) OR eToro (127 coins) — a 3rd provider would be needed for long-tail altcoins

---

## Phase 1: Database Schema Changes

### Task 1: Add provider-tracking columns to ticker tables

**Files:**
- Create: `services/workers/data-fetcher-2.0/migrations/008_multi_provider_support.sql`

**Step 1: Write the migration**

```sql
BEGIN;

-- 1. Add preferred data source to tickers
ALTER TABLE stock_tickers
    ADD COLUMN IF NOT EXISTS preferred_data_source_id INTEGER
        REFERENCES lookup_data_sources(id) ON DELETE SET NULL;

ALTER TABLE crypto_tickers
    ADD COLUMN IF NOT EXISTS preferred_data_source_id INTEGER
        REFERENCES lookup_data_sources(id) ON DELETE SET NULL;

-- 2. Add eToro data source
INSERT INTO lookup_data_sources (
    name, description, base_url, auth_type,
    rate_limit_per_minute, rate_limit_per_day,
    supports_stocks, supports_crypto, is_active
)
SELECT 'eToro', 'eToro Public API - stocks, crypto, commodities, indices',
       'https://public-api.etoro.com', 'api_key',
       60, NULL,  -- conservative: 60/min until we know their real limits
       true, true, true
WHERE NOT EXISTS (SELECT 1 FROM lookup_data_sources WHERE name = 'eToro');

-- 3. Symbol-to-instrumentId mapping for eToro
CREATE TABLE IF NOT EXISTS etoro_instrument_map (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL,  -- stock, crypto, commodity, index
    instrument_id INTEGER NOT NULL,
    display_name VARCHAR(255),
    instrument_type_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_etoro_instrument_map_symbol_asset_type
    ON etoro_instrument_map (symbol, asset_type);
CREATE INDEX IF NOT EXISTS ix_etoro_instrument_map_instrument_id
    ON etoro_instrument_map (instrument_id);

-- 4. Provider verification audit log
CREATE TABLE IF NOT EXISTS ticker_verification_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    asset_type VARCHAR(20) NOT NULL,
    data_source_id INTEGER NOT NULL REFERENCES lookup_data_sources(id),
    verified BOOLEAN NOT NULL,
    provider_name VARCHAR(100),
    provider_asset_name VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_ticker_verification_log_symbol
    ON ticker_verification_log (symbol, asset_type, created_at DESC);

-- 5. Provider rate limit tracking
CREATE TABLE IF NOT EXISTS provider_rate_limit_state (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_source_id INTEGER NOT NULL REFERENCES lookup_data_sources(id),
    window_start TIMESTAMPTZ NOT NULL,
    requests_used INTEGER NOT NULL DEFAULT 0,
    limit_per_window INTEGER,
    window_duration_seconds INTEGER NOT NULL DEFAULT 60,
    is_throttled BOOLEAN NOT NULL DEFAULT FALSE,
    throttled_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_provider_rate_limit_data_source
    ON provider_rate_limit_state (data_source_id);

-- 6. Update existing Alpaca tickers to set preferred_data_source_id
UPDATE stock_tickers
SET preferred_data_source_id = (SELECT id FROM lookup_data_sources WHERE name = 'Alpaca')
WHERE preferred_data_source_id IS NULL;

UPDATE crypto_tickers
SET preferred_data_source_id = (SELECT id FROM lookup_data_sources WHERE name = 'Alpaca')
WHERE preferred_data_source_id IS NULL;

-- 7. Add eToro fetch schedules
DO $$
DECLARE
    etoro_ds_id INT;
BEGIN
    SELECT id INTO etoro_ds_id FROM lookup_data_sources WHERE name = 'eToro' LIMIT 1;
    IF etoro_ds_id IS NULL THEN RETURN; END IF;

    INSERT INTO worker_fetch_schedules (data_source_id, name, schedule_time, schedule_timezone, is_enabled, fetch_config)
    SELECT etoro_ds_id, 'eToro Fallback Fetch', '00:00:00'::TIME, 'UTC', true,
           '{"interval_minutes": 30, "role": "fallback"}'::JSONB
    WHERE NOT EXISTS (
        SELECT 1 FROM worker_fetch_schedules WHERE data_source_id = etoro_ds_id AND name = 'eToro Fallback Fetch'
    );
END $$;

COMMIT;
```

**Step 2: Apply migration on VM**

```bash
ssh -F /dev/null -o StrictHostKeyChecking=no -i /tmp/vm_key.pem azureuser@20.17.176.1 \
  'docker exec postgres psql -U postgres -d stocktracker -f -' < migrations/008_multi_provider_support.sql
```

**Step 3: Commit**

```bash
git add migrations/008_multi_provider_support.sql
git commit -m "feat(db): add multi-provider support schema - ticker source tracking, eToro instrument map, rate limit state"
```

---

## Phase 2: Provider Abstraction Layer

### Task 2: Define IMarketDataProvider interface

**Files:**
- Create: `src/DataFetcher.Worker/Application/Providers/Common/IMarketDataProvider.cs`

This is the core abstraction that all providers implement:

```csharp
namespace DataFetcher.Worker.Application.Providers.Common;

public interface IMarketDataProvider
{
    string ProviderName { get; }
    int Priority { get; } // lower = try first
    
    ProviderCapabilities Capabilities { get; }
    
    Task<AssetVerificationResult> VerifyAssetAsync(
        string symbol, string assetType, CancellationToken ct = default);
    
    Task<ProviderBarResult> GetBarsAsync(
        ProviderBarRequest request, CancellationToken ct = default);
    
    Task<ProviderRateLimitState> GetRateLimitStateAsync(CancellationToken ct = default);
}

public class ProviderCapabilities
{
    public bool SupportsStocks { get; init; }
    public bool SupportsCrypto { get; init; }
    public bool SupportsCommodities { get; init; }
    public bool SupportsIndices { get; init; }
    public bool SupportsEtfs { get; init; }
    public HashSet<string> SupportedExchanges { get; init; } = new();
}

public class ProviderBarRequest
{
    public required IEnumerable<string> Symbols { get; init; }
    public required string AssetType { get; init; }
    public required string Timeframe { get; init; }
    public required DateTime Start { get; init; }
    public DateTime? End { get; init; }
    public int Limit { get; init; } = 10000;
    public string? PageToken { get; init; }
}

public class ProviderBarResult
{
    public bool Success { get; init; }
    public bool RateLimited { get; init; }
    public string? ErrorMessage { get; init; }
    public string? NextPageToken { get; init; }
    
    // symbol -> list of bars
    public Dictionary<string, List<OhlcvBar>> Bars { get; init; } = new();
    
    // symbols that returned no data (for failover)
    public HashSet<string> MissingSymbols { get; init; } = new();
}

public class OhlcvBar
{
    public DateTime Timestamp { get; init; }
    public decimal Open { get; init; }
    public decimal High { get; init; }
    public decimal Low { get; init; }
    public decimal Close { get; init; }
    public decimal Volume { get; init; }
    public decimal? Vwap { get; init; }
    public long? TradeCount { get; init; }
}

public class ProviderRateLimitState
{
    public int Remaining { get; init; }
    public int Limit { get; init; }
    public DateTime? ResetsAt { get; init; }
    public bool IsThrottled => Remaining <= 0;
}
```

### Task 3: Define IMarketDataResolver interface

**Files:**
- Create: `src/DataFetcher.Worker/Application/Providers/Common/IMarketDataResolver.cs`

The resolver orchestrates multi-provider logic:

```csharp
namespace DataFetcher.Worker.Application.Providers.Common;

public interface IMarketDataResolver
{
    /// Verify a symbol across providers in priority order.
    /// Returns the first provider that recognizes it.
    Task<ResolverVerificationResult> VerifyAcrossProvidersAsync(
        string symbol, string assetType, CancellationToken ct = default);
    
    /// Fetch bars with failover: try preferred provider, fall back on failure/missing data.
    Task<ResolverFetchResult> FetchBarsWithFailoverAsync(
        ProviderBarRequest request, int? preferredDataSourceId = null, CancellationToken ct = default);
}

public class ResolverVerificationResult
{
    public bool Found { get; init; }
    public string? ProviderName { get; init; }
    public int? DataSourceId { get; init; }
    public string? AssetName { get; init; }
    public string? Exchange { get; init; }
    public string? ErrorMessage { get; init; }
    
    // All providers tried and their results (for logging)
    public List<ProviderAttempt> Attempts { get; init; } = new();
}

public class ResolverFetchResult
{
    public Dictionary<string, List<OhlcvBar>> Bars { get; init; } = new();
    
    // Which provider served each symbol's data
    public Dictionary<string, string> SourceMap { get; init; } = new();
    
    // Symbols that no provider could serve
    public HashSet<string> UnresolvableSymbols { get; init; } = new();
    
    public List<ProviderAttempt> Attempts { get; init; } = new();
}

public class ProviderAttempt
{
    public required string ProviderName { get; init; }
    public bool Success { get; init; }
    public bool RateLimited { get; init; }
    public string? Error { get; init; }
    public TimeSpan Duration { get; init; }
}
```

### Task 4: Implement AlpacaMarketDataProvider (adapter)

**Files:**
- Create: `src/DataFetcher.Worker/Application/Providers/Alpaca/AlpacaMarketDataProvider.cs`

Wraps existing `IAlpacaMarketDataClient` and `IAlpacaAssetVerificationService` behind the new interface:

```csharp
namespace DataFetcher.Worker.Application.Providers.Alpaca;

public class AlpacaMarketDataProvider : IMarketDataProvider
{
    public string ProviderName => "Alpaca";
    public int Priority => 1; // primary for US stocks
    
    public ProviderCapabilities Capabilities => new()
    {
        SupportsStocks = true,
        SupportsCrypto = true,
        SupportsCommodities = false,
        SupportsIndices = false,
        SupportsEtfs = true,
        SupportedExchanges = new() { "NASDAQ", "NYSE", "ARCA", "BATS", "OTC", "AMEX" }
    };
    
    // Delegate to existing IAlpacaAssetVerificationService for VerifyAssetAsync
    // Delegate to existing IAlpacaMarketDataClient for GetBarsAsync
    // Read X-RateLimit-Remaining headers for GetRateLimitStateAsync
}
```

### Task 5: Implement EtoroMarketDataProvider

**Files:**
- Create: `src/DataFetcher.Worker/Application/Providers/Etoro/IEtoroMarketDataClient.cs`
- Create: `src/DataFetcher.Worker/Infrastructure/Providers/Etoro/EtoroMarketDataClient.cs`
- Create: `src/DataFetcher.Worker/Application/Providers/Etoro/EtoroMarketDataProvider.cs`
- Create: `src/DataFetcher.Worker/Configuration/Providers/EtoroSettings.cs`

Key implementation details:

```csharp
// EtoroSettings.cs
public class EtoroSettings
{
    public string BaseUrl { get; set; } = "https://public-api.etoro.com";
    public string ApiKey { get; set; } = string.Empty;
    public string UserKey { get; set; } = string.Empty;
    public int ConservativeRateLimitPerMinute { get; set; } = 60;
}
```

```csharp
// IEtoroMarketDataClient.cs
public interface IEtoroMarketDataClient
{
    Task<EtoroSearchResult?> SearchInstrumentAsync(string searchText, CancellationToken ct = default);
    Task<EtoroCandlesResponse?> GetCandlesAsync(int instrumentId, string interval, string direction, int count, CancellationToken ct = default);
    Task<EtoroRatesResponse?> GetRatesAsync(int[] instrumentIds, CancellationToken ct = default);
    Task<EtoroInstrumentTypesResponse?> GetInstrumentTypesAsync(CancellationToken ct = default);
}
```

```csharp
// EtoroMarketDataProvider.cs
public class EtoroMarketDataProvider : IMarketDataProvider
{
    public string ProviderName => "eToro";
    public int Priority => 2; // fallback
    
    public ProviderCapabilities Capabilities => new()
    {
        SupportsStocks = true,
        SupportsCrypto = true,
        SupportsCommodities = true,
        SupportsIndices = true,
        SupportsEtfs = true,
    };
    
    // VerifyAssetAsync: 
    //   1. Check etoro_instrument_map cache first
    //   2. If miss, call SearchInstrumentAsync(symbol)
    //   3. Match by symbol + asset type
    //   4. Cache instrumentId in etoro_instrument_map
    
    // GetBarsAsync:
    //   1. Resolve symbol -> instrumentId (from map or search)
    //   2. Call GetCandlesAsync(instrumentId, ...)
    //   3. Convert to OhlcvBar format
    
    // GetRateLimitStateAsync:
    //   Track locally since eToro doesn't expose rate limit headers
}
```

### Task 6: Implement MarketDataResolver

**Files:**
- Create: `src/DataFetcher.Worker/Application/Providers/Common/MarketDataResolver.cs`

Core orchestration logic:

```csharp
public class MarketDataResolver : IMarketDataResolver
{
    private readonly IEnumerable<IMarketDataProvider> _providers;
    private readonly IDbConnectionFactory _db;
    private readonly ILogger<MarketDataResolver> _logger;

    // VerifyAcrossProvidersAsync:
    //   1. Sort providers by Priority
    //   2. Filter to providers whose Capabilities match the assetType
    //   3. Try each in order:
    //      a. Check rate limit state — skip if throttled
    //      b. Call VerifyAssetAsync
    //      c. If found → return immediately with provider info
    //      d. If not found → log attempt, continue to next
    //      e. If rate limited → log, continue to next
    //   4. If all fail → return not found with all attempts
    
    // FetchBarsWithFailoverAsync:
    //   1. If preferredDataSourceId set → try that provider first
    //   2. Call GetBarsAsync on primary
    //   3. Inspect result:
    //      a. MissingSymbols → route those to next provider
    //      b. RateLimited → route ALL remaining to next provider
    //   4. Merge results from multiple providers
    //   5. Return unified result with SourceMap
}
```

**Failover flow for scheduled fetch (the TAO + NVIDIA + SOFI scenario):**

```
Input: [TAO/USD, NVDA, SOFI]
              │
              ▼
┌─────────────────────────────────────────────────┐
│ 1. Group by preferred_data_source_id            │
│    Alpaca: [TAO/USD, NVDA, SOFI]                │
│    eToro:  []                                   │
└─────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│ 2. Fetch from Alpaca: [TAO/USD, NVDA, SOFI]    │
│    Result:                                      │
│      ✓ NVDA: got bars                           │
│      ✗ TAO/USD: no data (MissingSymbols)        │
│      ⚠ SOFI: rate limited                       │
└─────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│ 3. Failover to eToro: [TAO/USD, SOFI]          │
│    Result:                                      │
│      ✗ TAO/USD: not in eToro either             │
│      ✓ SOFI: got bars from eToro                │
└─────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│ 4. Final result:                                │
│    NVDA → from Alpaca                           │
│    SOFI → from eToro (update preferred source?) │
│    TAO/USD → unresolvable (alert user)          │
└─────────────────────────────────────────────────┘
```

---

## Phase 3: Update /add Command Flow

### Task 7: Refactor TickerController to use resolver

**Files:**
- Modify: `src/DataFetcher.Worker/Presentation/Controllers/TickerController.cs`
- Modify (or create): `src/DataFetcher.Worker/Application/Providers/Common/TickerManagementService.cs`

Replace Alpaca-specific `IAlpacaTickerManagementService` with a provider-agnostic service:

```csharp
// New: ITickerManagementService (provider-agnostic)
public interface ITickerManagementService
{
    Task<AddTickerResult> AddTickerAsync(AddTickerRequest request, CancellationToken ct = default);
}

public class TickerManagementService : ITickerManagementService
{
    private readonly IMarketDataResolver _resolver;
    
    // AddTickerAsync flow:
    //   1. Normalize symbol (same as before)
    //   2. Call _resolver.VerifyAcrossProvidersAsync(symbol, assetType)
    //   3. If found:
    //      a. Insert into stock_tickers/crypto_tickers with preferred_data_source_id = winner
    //      b. Log verification attempt
    //      c. Queue backfill via RabbitMQ
    //   4. If not found across ALL providers:
    //      a. Return NOT_FOUND with helpful message listing which providers were tried
}
```

**User experience change:**
- Before: "Symbol 'TAO' not found." (user doesn't know why)
- After: "Symbol 'TAO' not found on any provider (tried: Alpaca, eToro). This asset may not be supported yet."

### Task 8: Update gateway add.ts to handle new response format

**Files:**
- Modify: `services/ai/gateway-2.0/src/extensions/telegram/commands/add.ts`

Minimal change — the `POST /api/ticker` response format stays the same, but we can optionally show which provider the ticker was found on:

```typescript
// After successful add, optionally show provider info:
if (isNewTicker) {
    const providerNote = body.provider ? ` (via ${body.provider})` : "";
    await ctx.reply(
        `${displaySymbol} has been added to your watchlist${providerNote}. It may take 15-60 minutes for data.`
    );
}
```

---

## Phase 4: Update Scheduled Fetch Workers

### Task 9: Create MultiProviderFetchWorker

**Files:**
- Create: `src/DataFetcher.Worker/Workers/Common/MultiProviderStockFetchWorker.cs`
- Create: `src/DataFetcher.Worker/Workers/Common/MultiProviderCryptoFetchWorker.cs`

These replace (or wrap) the existing `AlpacaStockFetchWorker` and `AlpacaCryptoFetchWorker`:

```csharp
public class MultiProviderStockFetchWorker : BackgroundService
{
    // Every 30 minutes:
    //   1. Get all active stock tickers
    //   2. Group by preferred_data_source_id
    //   3. For each provider group:
    //      a. Check provider rate limit state
    //      b. Call resolver.FetchBarsWithFailoverAsync(symbols, preferredSource)
    //   4. Upsert returned bars into stock_prices
    //   5. For any symbol where data came from a DIFFERENT provider than preferred:
    //      a. Update preferred_data_source_id on the ticker
    //   6. Log results per provider
}
```

### Task 10: Update backfill consumers for multi-provider

**Files:**
- Modify: `src/DataFetcher.Worker/Workers/Alpaca/AlpacaBackfillQueueConsumer.cs`

Add failover logic: if Alpaca backfill returns 0 records, try eToro:

```csharp
// In ProcessBackfillMessage:
var result = await _alpacaBackfillService.ExecuteBackfillAsync(request);
if (result.RecordCount == 0)
{
    _logger.LogInformation("Alpaca returned 0 records for {Symbol}, trying eToro", request.Symbol);
    var etoroResult = await _etoroBackfillService.ExecuteBackfillAsync(request);
    if (etoroResult.RecordCount > 0)
    {
        // Update ticker's preferred_data_source_id to eToro
    }
}
```

---

## Phase 5: Configuration & DI Registration

### Task 11: Add eToro configuration

**Files:**
- Modify: `src/DataFetcher.Worker/appsettings.json`
- Modify: `src/DataFetcher.Worker/Program.cs`
- Modify: `deployment/vm/docker-compose.yml` (env vars)

```json
// appsettings.json addition:
{
  "Providers": {
    "Etoro": {
      "BaseUrl": "https://public-api.etoro.com",
      "ApiKey": "",
      "UserKey": "",
      "ConservativeRateLimitPerMinute": 60
    }
  }
}
```

```csharp
// Program.cs additions:
builder.Services.Configure<EtoroSettings>(builder.Configuration.GetSection("Providers:Etoro"));
builder.Services.AddHttpClient<IEtoroMarketDataClient, EtoroMarketDataClient>()
    .AddPolicyHandler(GetRetryPolicy());
builder.Services.AddScoped<EtoroMarketDataProvider>();
builder.Services.AddScoped<AlpacaMarketDataProvider>();
builder.Services.AddScoped<IEnumerable<IMarketDataProvider>>(sp => new IMarketDataProvider[]
{
    sp.GetRequiredService<AlpacaMarketDataProvider>(),
    sp.GetRequiredService<EtoroMarketDataProvider>()
});
builder.Services.AddScoped<IMarketDataResolver, MarketDataResolver>();
builder.Services.AddScoped<ITickerManagementService, TickerManagementService>();
```

### Task 12: Store eToro keys in Infisical

```bash
infisical secrets set ETORO_API_KEY="<value>" --env=prod
infisical secrets set ETORO_USER_KEY="<value>" --env=prod
```

---

## Phase 6: Deployment & Verification

### Task 13: Baseline check

```bash
ssh into VM → docker ps → note current data-fetcher image version
```

### Task 14: Stage, push, verify build

```bash
git status → git add <specific files> → git commit -m "feat: multi-provider market data with failover"
git push origin main
gh run watch
```

### Task 15: Verify VM deployment

```bash
ssh → docker ps → confirm new image
docker logs data-fetcher-2.0 --since=5m | grep -i "etoro\|provider\|resolver"
```

### Task 16: End-to-end test

```bash
# Test 1: Add a crypto that only eToro has (not TAO — pick one from eToro's 127 list)
/add INJ crypto   # Injective — on eToro, not on Alpaca

# Test 2: Add a stock (should still use Alpaca as primary)
/add MSFT

# Test 3: Check watchlist — should show data from correct provider
/wishlist
```

---

## Open Questions (Need User Input)

1. **eToro User Key** — I need both `x-api-key` AND `x-user-key` to test eToro. The key you provided returned `InvalidKey`. Please verify you have both keys from Settings > Trading > API Key Management.

2. **TAO (Bittensor)** — Neither Alpaca nor eToro support TAO. Do you want to:
   - a) Add a 3rd provider (CoinGecko / CoinMarketCap free API) specifically for long-tail crypto?
   - b) Accept that TAO isn't available and remove it from the current watchlist?
   - c) Both?

3. **Commodities & Indices** — eToro uses CFD pricing for these. The OHLCV may differ from spot prices. Is that acceptable for your analysis, or do you need spot data specifically?

4. **Asset type `commodity` and `index`** — The current `/add` command only accepts `stock`, `etf`, `crypto`. Should we add `commodity` and `index` as valid types? This affects the gateway code and the `user_watchlist.asset_type` column.

5. **Existing TAO stock entry** — TAO is currently in `stock_tickers` as "Invesco China Real Estate ETF" (an actual ETF on ARCA) with 0 price data. Two users have it in their watchlist as `stock`. Should we:
   - a) Delete it and re-add properly when a provider is available?
   - b) Leave it — Alpaca should be able to fetch OHLCV for this ETF (the 0-data issue might be a feed gap)?
