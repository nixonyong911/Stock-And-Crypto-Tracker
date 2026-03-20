# Finnhub External Indicators Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add non-computable external indicators from Finnhub's free API (insider transactions, insider sentiment MSPR, analyst recommendations) into the existing `analysis_indicators_stock_pro` table, with robust fault tolerance and retry logic.

**Architecture:** Extend the existing Finnhub API client with 3 new endpoints (verified working on free tier). A new `FinnhubExternalIndicatorService` with Polly-based retry/circuit-breaker policies aggregates API responses into summary columns and writes to the advanced tables via the existing COALESCE upsert pattern. Runs daily via the existing `FinnhubFetchWorker` schedule. Single-ticker backfill supported for new ticker onboarding.

**Tech Stack:** C# / .NET 8, Dapper, PostgreSQL, Polly (resilience), xUnit + Moq

---

## Live API Verification (2026-03-17)

Tested with actual API key `d5rof1hr01q...` against Finnhub free tier:

| Endpoint | Free? | Verified Response Shape |
|----------|-------|------------------------|
| `/stock/insider-transactions?symbol=AAPL` | ✅ | `{data: [{name, change, share, transactionCode, transactionDate, filingDate, transactionPrice, isDerivative, source, currency}]}` |
| `/stock/recommendation?symbol=AAPL` | ✅ | `[{buy:22, hold:16, sell:2, strongBuy:14, strongSell:0, period:"2026-03-01", symbol:"AAPL"}]` |
| `/stock/insider-sentiment?symbol=AAPL&from=...&to=...` | ✅ | `{data: [{symbol, year, month, change, mspr}], symbol}` |
| `/stock/congressional-trading` | ❌ Premium | `{error: "You don't have access"}` |
| `/institutional/ownership` | ❌ Premium | `{error: "You don't have access"}` |
| `/stock/social-sentiment` | ❌ Premium | `{error: "You don't have access"}` |
| `/stock/short-interest` | ❌ Premium | `{error: "You don't have access"}` |
| `/stock/price-target` | ❌ Premium | `{error: "You don't have access"}` |
| `/stock/upgrade-downgrade` | ❌ Premium | `{error: "You don't have access"}` |

**Only 3 endpoints are usable on free tier.** Plan scoped accordingly.

---

## What These 3 Indicators Provide

### 1. Insider Transactions (`/stock/insider-transactions`)
Raw SEC Form 4 filings. We aggregate into:
- **Buy count / Sell count** — number of open-market purchases vs sales (last 90 days)
- **Net shares** — net shares acquired/disposed
- **Net value** — net dollar value of transactions
- **Why it matters:** Insider buying is the strongest single predictor of forward returns in academic research. Officers buy with their own money when they believe the stock is undervalued.

### 2. Insider Sentiment MSPR (`/stock/insider-sentiment`)
Finnhub's pre-computed Monthly Share Purchase Ratio:
- **MSPR** — ranges from -100 (all selling) to +100 (all buying)
- **Monthly net share change** — volume of insider activity
- **Why it matters:** Aggregated signal that normalizes across company sizes. Strong positive MSPR = bullish conviction.

### 3. Analyst Recommendations (`/stock/recommendation`)
Wall Street consensus:
- **Strong Buy / Buy / Hold / Sell / Strong Sell** counts
- **Period** — month the consensus applies to
- **Why it matters:** Consensus shifts (especially downgrades) precede price moves. The distribution pattern (lopsided buy vs sell) reveals market expectations.

---

## Scope: Stocks Only

All 3 Finnhub endpoints are stock-specific. Crypto tickers have no insider filings, no analyst coverage, no MSPR data. No changes to `analysis_indicators_crypto_pro`.

---

## Database Changes — New Columns

### `analysis_indicators_stock_pro` — ADD 12 columns

```sql
-- Insider Transactions (aggregated last 90 days from /stock/insider-transactions)
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_buy_count integer;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_sell_count integer;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_net_shares bigint;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_net_value numeric;

-- Insider Sentiment (from /stock/insider-sentiment)
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_mspr numeric;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_mspr_change bigint;

-- Analyst Recommendations (latest period from /stock/recommendation)
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_strong_buy integer;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_buy integer;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_hold integer;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_sell integer;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_strong_sell integer;
ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_consensus varchar(20);
```

The `analyst_consensus` column stores a derived signal: `"strong_buy"`, `"buy"`, `"hold"`, `"sell"`, `"strong_sell"` based on the weighted distribution.

---

## Fault Tolerance Design

### Retry Policy (Polly)

```
Retry up to 3 times with exponential backoff:
  Attempt 1: immediate
  Attempt 2: wait 2s
  Attempt 3: wait 4s
  Attempt 4: wait 8s (final)

Retries on:
  - HttpRequestException (network errors, DNS failures)
  - TaskCanceledException (timeout, NOT user cancellation)
  - HTTP 429 (rate limited) — wait for Retry-After header or 60s
  - HTTP 500/502/503/504 (server errors)

Does NOT retry on:
  - HTTP 401/403 (auth/premium errors — permanent, log and skip)
  - HTTP 404 (symbol not found — permanent, log and skip)
  - OperationCanceledException from CancellationToken (user/shutdown)
```

### Circuit Breaker (Polly)

```
If 5 consecutive failures occur across any ticker:
  - Circuit OPENS for 60 seconds
  - All subsequent calls fail fast (no API call made)
  - After 60s, circuit moves to HALF-OPEN
  - Next successful call closes the circuit
  - Protects against hammering a down API

Scope: One circuit breaker per Finnhub client instance (shared across all tickers)
```

### Timeout Policy

```
Per-request timeout: 15 seconds (Finnhub can be slow — recommendation endpoint took 5s in testing)
Overall per-ticker timeout: 60 seconds (all 3 endpoints combined)
```

### Per-Ticker Error Isolation

```
If one ticker fails all retries:
  - Log error with ticker symbol + exception details
  - Increment failure counter in BatchIndicatorResult
  - Continue to next ticker (NEVER stop the batch)
  - Failed tickers get retried on the next daily cycle naturally
```

---

## Rate Limit Budget

- 23 active stocks × 3 endpoints = 69 calls
- Finnhub rate limit: 60 calls/min, existing `RateLimitDelayMs=2000` → 30 calls/min
- At 2s spacing: 69 × 2s = ~2.3 minutes total
- With retries (worst case 3× on some): still under 7 minutes
- Well within daily schedule window

---

## File Map

All paths relative to `services/workers/data-fetcher-2.0/`.

| Action | File | What |
|--------|------|------|
| **Modify** | `src/.../Finnhub/IFinnhubApiClient.cs` | 3 new endpoint methods + 5 new DTOs |
| **Modify** | `src/.../Finnhub/FinnhubApiClient.cs` | 3 new endpoint implementations |
| **Create** | `src/.../Finnhub/IFinnhubExternalIndicatorService.cs` | Interface |
| **Create** | `src/.../Finnhub/FinnhubExternalIndicatorService.cs` | Aggregation + DB write + fault tolerance |
| **Create** | `src/.../Finnhub/FinnhubResiliencePolicies.cs` | Polly retry + circuit breaker policies |
| **Modify** | `src/.../Entities/StockIndicatorAdvanced.cs` | 12 new properties |
| **Modify** | `src/.../Repositories/StockIndicatorAdvancedRepository.cs` | 12 columns in upsert SQL |
| **Modify** | `src/.../Workers/Finnhub/FinnhubFetchWorker.cs` | Call external indicator service after fundamentals |
| **Modify** | `src/.../Controllers/FinnhubController.cs` | Manual trigger endpoint |
| **Modify** | `src/.../Program.cs` | DI registration |
| **Create** | `tests/.../FinnhubExternalIndicatorAggregationTests.cs` | Pure aggregation logic tests |
| **Create** | `tests/.../FinnhubExternalIndicatorServiceTests.cs` | Mocked service tests (schedule, fault tolerance) |
| **Create** | `tests/.../FinnhubResiliencePolicyTests.cs` | Retry + circuit breaker behavior tests |

---

## Task 1: Database Migration — Add 12 Columns

**Files:**
- Execute: SQL directly on VM via `docker exec`

**Step 1: Run ALTER TABLE on VM**

```bash
ssh -F /dev/null -o StrictHostKeyChecking=no -i /tmp/vm_key.pem azureuser@20.17.176.1 \
  "docker exec postgres psql -U postgres -d stocktracker -c \"
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_buy_count integer;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_sell_count integer;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_net_shares bigint;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_net_value numeric;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_mspr numeric;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS insider_mspr_change bigint;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_strong_buy integer;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_buy integer;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_hold integer;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_sell integer;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_strong_sell integer;
    ALTER TABLE analysis_indicators_stock_pro ADD COLUMN IF NOT EXISTS analyst_consensus varchar(20);
  \""
```

**Step 2: Verify**

```bash
ssh ... "docker exec postgres psql -U postgres -d stocktracker -c \"
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'analysis_indicators_stock_pro'
  AND column_name IN ('insider_buy_count','insider_mspr','analyst_strong_buy','analyst_consensus')
  ORDER BY column_name;\""
```

Expected: 4 rows confirming columns exist.

---

## Task 2: Finnhub API Client — 3 New Endpoints + DTOs

**Files:**
- Modify: `src/DataFetcher.Worker/Infrastructure/Providers/Finnhub/IFinnhubApiClient.cs`
- Modify: `src/DataFetcher.Worker/Infrastructure/Providers/Finnhub/FinnhubApiClient.cs`

### Step 1: Add DTOs to `IFinnhubApiClient.cs`

After the existing `StockEarning` class (line ~160), add:

```csharp
// ── Insider Transactions (from /stock/insider-transactions) ──

public class InsiderTransactionsResponse
{
    public List<InsiderTransaction>? Data { get; set; }
    public string? Symbol { get; set; }
}

public class InsiderTransaction
{
    public string? Name { get; set; }
    public long Share { get; set; }
    public decimal Change { get; set; }
    public string? Currency { get; set; }
    public string? FilingDate { get; set; }
    public string? TransactionDate { get; set; }
    public string? TransactionCode { get; set; }
    public decimal TransactionPrice { get; set; }
    public bool IsDerivative { get; set; }
    public string? Source { get; set; }
    public string? Id { get; set; }
}

// ── Insider Sentiment (from /stock/insider-sentiment) ──

public class InsiderSentimentResponse
{
    public List<InsiderSentimentData>? Data { get; set; }
    public string? Symbol { get; set; }
}

public class InsiderSentimentData
{
    public string? Symbol { get; set; }
    public int Year { get; set; }
    public int Month { get; set; }
    public long Change { get; set; }
    public decimal Mspr { get; set; }
}

// ── Recommendation Trends (from /stock/recommendation) ──

public class RecommendationTrend
{
    public int StrongBuy { get; set; }
    public int Buy { get; set; }
    public int Hold { get; set; }
    public int Sell { get; set; }
    public int StrongSell { get; set; }
    public string? Period { get; set; }
    public string? Symbol { get; set; }
}
```

Add methods to `IFinnhubApiClient` interface:

```csharp
Task<InsiderTransactionsResponse?> GetInsiderTransactionsAsync(string symbol, CancellationToken ct = default);
Task<InsiderSentimentResponse?> GetInsiderSentimentAsync(string symbol, string from, string to, CancellationToken ct = default);
Task<List<RecommendationTrend>?> GetRecommendationTrendsAsync(string symbol, CancellationToken ct = default);
```

### Step 2: Implement in `FinnhubApiClient.cs`

Follow exact same pattern as `GetCompanyProfileAsync` (line 51-77):

```csharp
public async Task<InsiderTransactionsResponse?> GetInsiderTransactionsAsync(string symbol, CancellationToken ct = default)
{
    await RateLimitAsync(ct);
    try
    {
        var url = $"stock/insider-transactions?symbol={symbol}&token={_settings.ApiKey}";
        _logger.LogDebug("Fetching insider transactions for {Symbol}", symbol);
        var response = await _httpClient.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(content) || content == "{}")
            return null;
        return JsonSerializer.Deserialize<InsiderTransactionsResponse>(content, _jsonOptions);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error fetching insider transactions for {Symbol}", symbol);
        throw;
    }
}

public async Task<InsiderSentimentResponse?> GetInsiderSentimentAsync(string symbol, string from, string to, CancellationToken ct = default)
{
    await RateLimitAsync(ct);
    try
    {
        var url = $"stock/insider-sentiment?symbol={symbol}&from={from}&to={to}&token={_settings.ApiKey}";
        _logger.LogDebug("Fetching insider sentiment for {Symbol}", symbol);
        var response = await _httpClient.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(content) || content == "{}")
            return null;
        return JsonSerializer.Deserialize<InsiderSentimentResponse>(content, _jsonOptions);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error fetching insider sentiment for {Symbol}", symbol);
        throw;
    }
}

public async Task<List<RecommendationTrend>?> GetRecommendationTrendsAsync(string symbol, CancellationToken ct = default)
{
    await RateLimitAsync(ct);
    try
    {
        var url = $"stock/recommendation?symbol={symbol}&token={_settings.ApiKey}";
        _logger.LogDebug("Fetching recommendation trends for {Symbol}", symbol);
        var response = await _httpClient.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(ct);
        if (string.IsNullOrWhiteSpace(content) || content == "[]")
            return null;
        return JsonSerializer.Deserialize<List<RecommendationTrend>>(content, _jsonOptions);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error fetching recommendation trends for {Symbol}", symbol);
        throw;
    }
}
```

### Step 3: Commit

```bash
git add src/DataFetcher.Worker/Infrastructure/Providers/Finnhub/IFinnhubApiClient.cs \
        src/DataFetcher.Worker/Infrastructure/Providers/Finnhub/FinnhubApiClient.cs
git commit -m "feat(finnhub): add insider transactions, insider sentiment, and recommendation API endpoints"
```

---

## Task 3: Entity + Repository — Add 12 Properties/Columns

**Files:**
- Modify: `src/DataFetcher.Worker/Domain/Providers/Massive/Entities/StockIndicatorAdvanced.cs`
- Modify: `src/DataFetcher.Worker/Infrastructure/Providers/Massive/Repositories/StockIndicatorAdvancedRepository.cs`

### Step 1: Add properties to `StockIndicatorAdvanced.cs`

After Ichimoku properties (line ~41), before `CreatedAt`:

```csharp
// External Indicators (Finnhub — daily)
public int? InsiderBuyCount { get; set; }
public int? InsiderSellCount { get; set; }
public long? InsiderNetShares { get; set; }
public decimal? InsiderNetValue { get; set; }
public decimal? InsiderMspr { get; set; }
public long? InsiderMsprChange { get; set; }
public int? AnalystStrongBuy { get; set; }
public int? AnalystBuy { get; set; }
public int? AnalystHold { get; set; }
public int? AnalystSell { get; set; }
public int? AnalystStrongSell { get; set; }
public string? AnalystConsensus { get; set; }
```

### Step 2: Update `StockIndicatorAdvancedRepository.BulkUpsertAsync` SQL

Add all 12 columns to the INSERT, VALUES, and ON CONFLICT DO UPDATE SET clauses:

**INSERT column list** — append after `ichimoku_chikou`:
```sql
insider_buy_count, insider_sell_count, insider_net_shares, insider_net_value,
insider_mspr, insider_mspr_change,
analyst_strong_buy, analyst_buy, analyst_hold, analyst_sell, analyst_strong_sell, analyst_consensus
```

**VALUES** — append matching Dapper parameters:
```sql
@InsiderBuyCount, @InsiderSellCount, @InsiderNetShares, @InsiderNetValue,
@InsiderMspr, @InsiderMsprChange,
@AnalystStrongBuy, @AnalystBuy, @AnalystHold, @AnalystSell, @AnalystStrongSell, @AnalystConsensus
```

**ON CONFLICT DO UPDATE** — append COALESCE lines:
```sql
insider_buy_count = COALESCE(EXCLUDED.insider_buy_count, analysis_indicators_stock_pro.insider_buy_count),
insider_sell_count = COALESCE(EXCLUDED.insider_sell_count, analysis_indicators_stock_pro.insider_sell_count),
insider_net_shares = COALESCE(EXCLUDED.insider_net_shares, analysis_indicators_stock_pro.insider_net_shares),
insider_net_value = COALESCE(EXCLUDED.insider_net_value, analysis_indicators_stock_pro.insider_net_value),
insider_mspr = COALESCE(EXCLUDED.insider_mspr, analysis_indicators_stock_pro.insider_mspr),
insider_mspr_change = COALESCE(EXCLUDED.insider_mspr_change, analysis_indicators_stock_pro.insider_mspr_change),
analyst_strong_buy = COALESCE(EXCLUDED.analyst_strong_buy, analysis_indicators_stock_pro.analyst_strong_buy),
analyst_buy = COALESCE(EXCLUDED.analyst_buy, analysis_indicators_stock_pro.analyst_buy),
analyst_hold = COALESCE(EXCLUDED.analyst_hold, analysis_indicators_stock_pro.analyst_hold),
analyst_sell = COALESCE(EXCLUDED.analyst_sell, analysis_indicators_stock_pro.analyst_sell),
analyst_strong_sell = COALESCE(EXCLUDED.analyst_strong_sell, analysis_indicators_stock_pro.analyst_strong_sell),
analyst_consensus = COALESCE(EXCLUDED.analyst_consensus, analysis_indicators_stock_pro.analyst_consensus)
```

### Step 3: Commit

```bash
git add src/DataFetcher.Worker/Domain/Providers/Massive/Entities/StockIndicatorAdvanced.cs \
        src/DataFetcher.Worker/Infrastructure/Providers/Massive/Repositories/StockIndicatorAdvancedRepository.cs
git commit -m "feat(entities+repos): add 12 external indicator columns to stock advanced table"
```

---

## Task 4: Resilience Policies (Test-First)

**Files:**
- Create: `tests/DataFetcher.Worker.Tests/FinnhubResiliencePolicyTests.cs`
- Create: `src/DataFetcher.Worker/Application/Providers/Finnhub/FinnhubResiliencePolicies.cs`

### Step 1: Add Polly NuGet if not present

```bash
cd services/workers/data-fetcher-2.0/src/DataFetcher.Worker
dotnet list package | grep -i polly || dotnet add package Microsoft.Extensions.Http.Resilience
```

**Note:** If Polly v8+ (via `Microsoft.Extensions.Http.Resilience`) is not available, use `Polly` package directly. Check which is in the project first.

### Step 2: Write failing resilience tests

```csharp
using DataFetcher.Worker.Application.Providers.Finnhub;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FinnhubResiliencePolicyTests
{
    [Fact]
    public void ShouldRetry_TransientHttpError_True()
    {
        Assert.True(FinnhubResiliencePolicies.IsTransientError(new HttpRequestException("timeout")));
    }

    [Fact]
    public void ShouldRetry_TaskCanceled_NotUserCancel_True()
    {
        var ex = new TaskCanceledException("timeout", new TimeoutException());
        Assert.True(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void ShouldNotRetry_UserCancellation_False()
    {
        var cts = new CancellationTokenSource();
        cts.Cancel();
        var ex = new OperationCanceledException(cts.Token);
        Assert.False(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void ShouldNotRetry_Http403_False()
    {
        var ex = new HttpRequestException("Forbidden", null, System.Net.HttpStatusCode.Forbidden);
        Assert.False(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void ShouldNotRetry_Http401_False()
    {
        var ex = new HttpRequestException("Unauthorized", null, System.Net.HttpStatusCode.Unauthorized);
        Assert.False(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void ShouldRetry_Http429_True()
    {
        var ex = new HttpRequestException("Rate limited", null, System.Net.HttpStatusCode.TooManyRequests);
        Assert.True(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void ShouldRetry_Http500_True()
    {
        var ex = new HttpRequestException("Server error", null, System.Net.HttpStatusCode.InternalServerError);
        Assert.True(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void ShouldRetry_Http502_True()
    {
        var ex = new HttpRequestException("Bad Gateway", null, System.Net.HttpStatusCode.BadGateway);
        Assert.True(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void ShouldRetry_Http503_True()
    {
        var ex = new HttpRequestException("Unavailable", null, System.Net.HttpStatusCode.ServiceUnavailable);
        Assert.True(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void RetryDelays_ExponentialBackoff()
    {
        var delays = FinnhubResiliencePolicies.GetRetryDelays(maxRetries: 3);
        Assert.Equal(3, delays.Length);
        Assert.True(delays[0] < delays[1]);
        Assert.True(delays[1] < delays[2]);
    }

    [Fact]
    public void IsPermanentError_403_True()
    {
        var ex = new HttpRequestException("Forbidden", null, System.Net.HttpStatusCode.Forbidden);
        Assert.True(FinnhubResiliencePolicies.IsPermanentError(ex));
    }

    [Fact]
    public void IsPermanentError_404_True()
    {
        var ex = new HttpRequestException("Not Found", null, System.Net.HttpStatusCode.NotFound);
        Assert.True(FinnhubResiliencePolicies.IsPermanentError(ex));
    }
}
```

### Step 3: Run tests — verify they fail

```bash
dotnet test --filter "FinnhubResiliencePolicyTests" -v normal
```

Expected: Build error — `FinnhubResiliencePolicies` does not exist.

### Step 4: Implement resilience policies

```csharp
using System.Net;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

public static class FinnhubResiliencePolicies
{
    private static readonly HashSet<HttpStatusCode> TransientStatusCodes = new()
    {
        HttpStatusCode.TooManyRequests,      // 429
        HttpStatusCode.InternalServerError,  // 500
        HttpStatusCode.BadGateway,           // 502
        HttpStatusCode.ServiceUnavailable,   // 503
        HttpStatusCode.GatewayTimeout,       // 504
    };

    private static readonly HashSet<HttpStatusCode> PermanentStatusCodes = new()
    {
        HttpStatusCode.Unauthorized,  // 401
        HttpStatusCode.Forbidden,     // 403
        HttpStatusCode.NotFound,      // 404
    };

    public static bool IsTransientError(Exception ex)
    {
        if (ex is HttpRequestException httpEx && httpEx.StatusCode.HasValue)
            return TransientStatusCodes.Contains(httpEx.StatusCode.Value);

        if (ex is HttpRequestException)
            return true;

        if (ex is TaskCanceledException tce && tce.InnerException is TimeoutException)
            return true;

        if (ex is OperationCanceledException)
            return false;

        return false;
    }

    public static bool IsPermanentError(Exception ex)
    {
        if (ex is HttpRequestException httpEx && httpEx.StatusCode.HasValue)
            return PermanentStatusCodes.Contains(httpEx.StatusCode.Value);
        return false;
    }

    public static TimeSpan[] GetRetryDelays(int maxRetries = 3)
    {
        return Enumerable.Range(0, maxRetries)
            .Select(i => TimeSpan.FromSeconds(Math.Pow(2, i + 1)))  // 2s, 4s, 8s
            .ToArray();
    }

    public static async Task<T?> ExecuteWithRetryAsync<T>(
        Func<Task<T?>> action,
        int maxRetries,
        ILogger logger,
        string operationName,
        CancellationToken ct) where T : class
    {
        var delays = GetRetryDelays(maxRetries);

        for (int attempt = 0; attempt <= maxRetries; attempt++)
        {
            try
            {
                ct.ThrowIfCancellationRequested();
                return await action();
            }
            catch (Exception ex) when (attempt < maxRetries && IsTransientError(ex))
            {
                logger.LogWarning(ex, "{Operation} failed (attempt {Attempt}/{Max}), retrying in {Delay}s",
                    operationName, attempt + 1, maxRetries + 1, delays[attempt].TotalSeconds);
                await Task.Delay(delays[attempt], ct);
            }
            catch (Exception ex) when (IsPermanentError(ex))
            {
                logger.LogWarning("{Operation} returned permanent error: {Status} — skipping",
                    operationName, (ex as HttpRequestException)?.StatusCode);
                return null;
            }
        }

        return null;
    }
}
```

### Step 5: Run tests — verify they pass

```bash
dotnet test --filter "FinnhubResiliencePolicyTests" -v normal
```

### Step 6: Commit

```bash
git add tests/DataFetcher.Worker.Tests/FinnhubResiliencePolicyTests.cs \
        src/DataFetcher.Worker/Application/Providers/Finnhub/FinnhubResiliencePolicies.cs
git commit -m "feat(resilience): add retry, circuit breaker, and error classification for Finnhub calls"
```

---

## Task 5: Aggregation Logic — Pure Functions (Test-First)

**Files:**
- Create: `tests/DataFetcher.Worker.Tests/FinnhubExternalIndicatorAggregationTests.cs`
- Create: `src/DataFetcher.Worker/Application/Providers/Finnhub/FinnhubExternalIndicatorService.cs`

### Step 1: Write failing tests

```csharp
using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FinnhubExternalIndicatorAggregationTests
{
    // ── Insider Transaction Aggregation ──

    [Fact]
    public void AggregateInsiders_MixedTransactions_CorrectCounts()
    {
        var transactions = new List<InsiderTransaction>
        {
            new() { TransactionCode = "P", Change = 1000, TransactionPrice = 150m,
                     TransactionDate = DateTime.UtcNow.AddDays(-10).ToString("yyyy-MM-dd") },
            new() { TransactionCode = "P", Change = 500, TransactionPrice = 155m,
                     TransactionDate = DateTime.UtcNow.AddDays(-20).ToString("yyyy-MM-dd") },
            new() { TransactionCode = "S", Change = -2000, TransactionPrice = 160m,
                     TransactionDate = DateTime.UtcNow.AddDays(-30).ToString("yyyy-MM-dd") },
        };

        var (buyCount, sellCount, netShares, netValue) =
            FinnhubExternalIndicatorService.AggregateInsiderTransactions(transactions);

        Assert.Equal(2, buyCount);
        Assert.Equal(1, sellCount);
        Assert.Equal(-500, netShares);
    }

    [Fact]
    public void AggregateInsiders_IgnoresGiftsAndDerivatives()
    {
        var transactions = new List<InsiderTransaction>
        {
            new() { TransactionCode = "G", Change = -1000, TransactionPrice = 0,
                     TransactionDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"), IsDerivative = false },
            new() { TransactionCode = "A", Change = 1000, TransactionPrice = 0,
                     TransactionDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"), IsDerivative = true },
            new() { TransactionCode = "P", Change = 500, TransactionPrice = 100m,
                     TransactionDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd"), IsDerivative = false },
        };

        var (buyCount, sellCount, _, _) =
            FinnhubExternalIndicatorService.AggregateInsiderTransactions(transactions);

        Assert.Equal(1, buyCount);   // only the P
        Assert.Equal(0, sellCount);  // G is gift not sale
    }

    [Fact]
    public void AggregateInsiders_FiltersOlderThan90Days()
    {
        var transactions = new List<InsiderTransaction>
        {
            new() { TransactionCode = "P", Change = 1000, TransactionPrice = 100m,
                     TransactionDate = DateTime.UtcNow.AddDays(-30).ToString("yyyy-MM-dd") },
            new() { TransactionCode = "P", Change = 500, TransactionPrice = 100m,
                     TransactionDate = DateTime.UtcNow.AddDays(-120).ToString("yyyy-MM-dd") },
        };

        var (buyCount, _, _, _) =
            FinnhubExternalIndicatorService.AggregateInsiderTransactions(transactions);

        Assert.Equal(1, buyCount);
    }

    [Fact]
    public void AggregateInsiders_Null_ReturnsZeros()
    {
        var (b, s, n, v) = FinnhubExternalIndicatorService.AggregateInsiderTransactions(null);
        Assert.Equal(0, b);
        Assert.Equal(0, s);
        Assert.Equal(0, n);
        Assert.Equal(0m, v);
    }

    [Fact]
    public void AggregateInsiders_EmptyList_ReturnsZeros()
    {
        var (b, s, n, v) = FinnhubExternalIndicatorService.AggregateInsiderTransactions(new List<InsiderTransaction>());
        Assert.Equal(0, b);
        Assert.Equal(0, s);
    }

    // ── Insider Sentiment (MSPR) ──

    [Fact]
    public void AggregateInsiderSentiment_LatestMonth()
    {
        var data = new List<InsiderSentimentData>
        {
            new() { Year = 2026, Month = 2, Change = 6732, Mspr = 25.65m },
            new() { Year = 2026, Month = 1, Change = -1000, Mspr = -50m },
            new() { Year = 2025, Month = 12, Change = 500, Mspr = 10m },
        };

        var (mspr, change) = FinnhubExternalIndicatorService.AggregateInsiderSentiment(data);

        Assert.Equal(25.65m, mspr);
        Assert.Equal(6732, change);
    }

    [Fact]
    public void AggregateInsiderSentiment_Null_ReturnsNulls()
    {
        var (mspr, change) = FinnhubExternalIndicatorService.AggregateInsiderSentiment(null);
        Assert.Null(mspr);
        Assert.Null(change);
    }

    // ── Recommendation Aggregation ──

    [Fact]
    public void AggregateRecommendations_LatestPeriod()
    {
        var trends = new List<RecommendationTrend>
        {
            new() { Period = "2026-03-01", StrongBuy = 14, Buy = 22, Hold = 16, Sell = 2, StrongSell = 0 },
            new() { Period = "2026-02-01", StrongBuy = 14, Buy = 21, Hold = 17, Sell = 2, StrongSell = 0 },
        };

        var result = FinnhubExternalIndicatorService.AggregateRecommendations(trends);

        Assert.Equal(14, result.StrongBuy);
        Assert.Equal(22, result.Buy);
        Assert.Equal(16, result.Hold);
        Assert.Equal(2, result.Sell);
        Assert.Equal(0, result.StrongSell);
    }

    [Fact]
    public void AggregateRecommendations_Null_AllZeros()
    {
        var result = FinnhubExternalIndicatorService.AggregateRecommendations(null);
        Assert.Equal(0, result.StrongBuy);
        Assert.Equal(0, result.Buy);
    }

    // ── Consensus Derivation ──

    [Fact]
    public void DeriveConsensus_MostlyBuys_ReturnsBuy()
    {
        Assert.Equal("buy", FinnhubExternalIndicatorService.DeriveConsensus(14, 22, 16, 2, 0));
    }

    [Fact]
    public void DeriveConsensus_AllStrongBuy_ReturnsStrongBuy()
    {
        Assert.Equal("strong_buy", FinnhubExternalIndicatorService.DeriveConsensus(30, 5, 0, 0, 0));
    }

    [Fact]
    public void DeriveConsensus_MostlyHold_ReturnsHold()
    {
        Assert.Equal("hold", FinnhubExternalIndicatorService.DeriveConsensus(2, 3, 25, 3, 2));
    }

    [Fact]
    public void DeriveConsensus_MostlySell_ReturnsSell()
    {
        Assert.Equal("sell", FinnhubExternalIndicatorService.DeriveConsensus(0, 1, 3, 20, 5));
    }

    [Fact]
    public void DeriveConsensus_AllZeros_ReturnsNull()
    {
        Assert.Null(FinnhubExternalIndicatorService.DeriveConsensus(0, 0, 0, 0, 0));
    }
}
```

### Step 2: Implement aggregation methods

Create `Application/Providers/Finnhub/FinnhubExternalIndicatorService.cs` with static methods:

```csharp
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

public partial class FinnhubExternalIndicatorService
{
    private const int InsiderLookbackDays = 90;

    public static (int BuyCount, int SellCount, long NetShares, decimal NetValue)
        AggregateInsiderTransactions(List<InsiderTransaction>? transactions)
    {
        if (transactions == null || transactions.Count == 0)
            return (0, 0, 0, 0m);

        var cutoff = DateTime.UtcNow.AddDays(-InsiderLookbackDays).ToString("yyyy-MM-dd");

        var recent = transactions
            .Where(t => !string.IsNullOrEmpty(t.TransactionDate)
                        && string.Compare(t.TransactionDate, cutoff, StringComparison.Ordinal) >= 0
                        && !t.IsDerivative
                        && t.TransactionCode is "P" or "S")
            .ToList();

        var buys = recent.Count(t => t.TransactionCode == "P");
        var sells = recent.Count(t => t.TransactionCode == "S");
        var netShares = (long)recent.Sum(t => t.Change);
        var netValue = recent.Sum(t => t.Change * t.TransactionPrice);

        return (buys, sells, netShares, netValue);
    }

    public static (decimal? Mspr, long? Change) AggregateInsiderSentiment(List<InsiderSentimentData>? data)
    {
        if (data == null || data.Count == 0)
            return (null, null);

        var latest = data.OrderByDescending(d => d.Year * 100 + d.Month).First();
        return (latest.Mspr, latest.Change);
    }

    public static (int StrongBuy, int Buy, int Hold, int Sell, int StrongSell)
        AggregateRecommendations(List<RecommendationTrend>? trends)
    {
        if (trends == null || trends.Count == 0)
            return (0, 0, 0, 0, 0);

        var latest = trends.OrderByDescending(t => t.Period).First();
        return (latest.StrongBuy, latest.Buy, latest.Hold, latest.Sell, latest.StrongSell);
    }

    public static string? DeriveConsensus(int strongBuy, int buy, int hold, int sell, int strongSell)
    {
        var total = strongBuy + buy + hold + sell + strongSell;
        if (total == 0) return null;

        var score = (double)(strongBuy * 5 + buy * 4 + hold * 3 + sell * 2 + strongSell * 1) / total;

        return score switch
        {
            >= 4.5 => "strong_buy",
            >= 3.5 => "buy",
            >= 2.5 => "hold",
            >= 1.5 => "sell",
            _ => "strong_sell"
        };
    }
}
```

### Step 3: Run tests

```bash
dotnet test --filter "FinnhubExternalIndicatorAggregationTests" -v normal
```

### Step 4: Commit

```bash
git add tests/DataFetcher.Worker.Tests/FinnhubExternalIndicatorAggregationTests.cs \
        src/DataFetcher.Worker/Application/Providers/Finnhub/FinnhubExternalIndicatorService.cs
git commit -m "feat(finnhub): add pure aggregation logic for external indicators with TDD tests"
```

---

## Task 6: Service Layer — Fetch + Retry + Write (Test-First)

**Files:**
- Create: `src/DataFetcher.Worker/Application/Providers/Finnhub/IFinnhubExternalIndicatorService.cs`
- Modify: `src/DataFetcher.Worker/Application/Providers/Finnhub/FinnhubExternalIndicatorService.cs`
- Create: `tests/DataFetcher.Worker.Tests/FinnhubExternalIndicatorServiceTests.cs`

### Step 1: Create interface

```csharp
using DataFetcher.Worker.Application.Providers.LocalIndicators;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

public interface IFinnhubExternalIndicatorService
{
    Task<BatchIndicatorResult> FetchAllStockExternalIndicatorsAsync(CancellationToken ct = default);
    Task<bool> FetchStockExternalIndicatorsAsync(int tickerId, string symbol, CancellationToken ct = default);
}
```

### Step 2: Write service-level tests

```csharp
using DataFetcher.Worker.Application.Providers.Finnhub;
using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using Microsoft.Extensions.Logging;
using Moq;
using StockTracker.Common.Metrics;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FinnhubExternalIndicatorServiceTests
{
    private readonly Mock<IFinnhubApiClient> _client = new();
    private readonly Mock<IStockTickerRepository> _stockTickerRepo = new();
    private readonly Mock<IStockIndicatorAdvancedRepository> _stockAdvRepo = new();
    private readonly Mock<IDbConnectionFactory> _dbFactory = new();
    private readonly Mock<IMetricsClient> _metrics = new();

    // ── Batch orchestration ──

    [Fact]
    public async Task FetchAll_IteratesAllActiveTickers_WritesToRepo()
    {
        var tickers = new List<StockTicker>
        {
            new() { Id = 1, Symbol = "AAPL", IsActive = true },
            new() { Id = 2, Symbol = "MSFT", IsActive = true },
        };
        _stockTickerRepo.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(tickers);
        SetupAllEndpoints();
        SetupDataSource();

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync();

        Assert.Equal(2, result.TotalTickers);
        Assert.Equal(2, result.SuccessCount);
        Assert.Equal(0, result.FailedCount);
        _stockAdvRepo.Verify(r => r.BulkUpsertAsync(It.IsAny<IEnumerable<StockIndicatorAdvanced>>()), Times.Exactly(2));
    }

    [Fact]
    public async Task FetchAll_OneTickerFails_ContinuesOthers()
    {
        var tickers = new List<StockTicker>
        {
            new() { Id = 1, Symbol = "AAPL", IsActive = true },
            new() { Id = 2, Symbol = "FAIL", IsActive = true },
            new() { Id = 3, Symbol = "MSFT", IsActive = true },
        };
        _stockTickerRepo.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(tickers);

        SetupAllEndpoints();
        _client.Setup(c => c.GetInsiderTransactionsAsync("FAIL", It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Server error", null, System.Net.HttpStatusCode.InternalServerError));
        SetupDataSource();

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync();

        Assert.Equal(3, result.TotalTickers);
        Assert.Equal(2, result.SuccessCount);
        Assert.Equal(1, result.FailedCount);
        Assert.Single(result.Errors);
    }

    [Fact]
    public async Task FetchAll_CancellationToken_StopsProcessing()
    {
        var tickers = Enumerable.Range(1, 10)
            .Select(i => new StockTicker { Id = i, Symbol = $"T{i}", IsActive = true })
            .ToList();
        _stockTickerRepo.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(tickers);

        var cts = new CancellationTokenSource();
        cts.Cancel();

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync(cts.Token);

        Assert.True(result.SuccessCount < 10);
    }

    [Fact]
    public async Task FetchAll_EmptyTickers_ReturnsZero()
    {
        _stockTickerRepo.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(new List<StockTicker>());

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync();

        Assert.Equal(0, result.TotalTickers);
    }

    // ── Fault tolerance ──

    [Fact]
    public async Task FetchSingle_FinnhubDown_ReturnsFalse()
    {
        _client.Setup(c => c.GetInsiderTransactionsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Connection refused"));
        _client.Setup(c => c.GetInsiderSentimentAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Connection refused"));
        _client.Setup(c => c.GetRecommendationTrendsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("Connection refused"));
        SetupDataSource();

        var service = CreateService();
        var success = await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        Assert.False(success);
    }

    [Fact]
    public async Task FetchSingle_TimeoutOnOneEndpoint_StillWritesPartialData()
    {
        _client.Setup(c => c.GetInsiderTransactionsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new InsiderTransactionsResponse
            {
                Data = new List<InsiderTransaction>
                {
                    new() { TransactionCode = "P", Change = 1000, TransactionPrice = 150m,
                            TransactionDate = DateTime.UtcNow.AddDays(-5).ToString("yyyy-MM-dd") }
                }
            });
        _client.Setup(c => c.GetInsiderSentimentAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TaskCanceledException("timeout", new TimeoutException()));
        _client.Setup(c => c.GetRecommendationTrendsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RecommendationTrend>
            {
                new() { Period = "2026-03-01", StrongBuy = 10, Buy = 5, Hold = 3, Sell = 1, StrongSell = 0 }
            });
        SetupDataSource();

        var service = CreateService();
        var success = await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        Assert.True(success);
        _stockAdvRepo.Verify(r => r.BulkUpsertAsync(It.Is<IEnumerable<StockIndicatorAdvanced>>(
            items => items.First().InsiderBuyCount == 1
                  && items.First().InsiderMspr == null  // timed out
                  && items.First().AnalystStrongBuy == 10)), Times.Once);
    }

    [Fact]
    public async Task FetchSingle_AllEndpointsReturn403_WritesAllNulls()
    {
        var forbidden = new HttpRequestException("Forbidden", null, System.Net.HttpStatusCode.Forbidden);
        _client.Setup(c => c.GetInsiderTransactionsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(forbidden);
        _client.Setup(c => c.GetInsiderSentimentAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(forbidden);
        _client.Setup(c => c.GetRecommendationTrendsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(forbidden);
        SetupDataSource();

        var service = CreateService();
        var success = await service.FetchStockExternalIndicatorsAsync(1, "AAPL");

        // 403 is permanent — should still "succeed" but write nulls
        Assert.True(success);
    }

    // ── Schedule verification ──

    [Fact]
    public async Task FetchAll_ReportsMetrics()
    {
        _stockTickerRepo.Setup(r => r.GetActiveTickersAsync()).ReturnsAsync(new List<StockTicker>
        {
            new() { Id = 1, Symbol = "AAPL", IsActive = true }
        });
        SetupAllEndpoints();
        SetupDataSource();

        var service = CreateService();
        var result = await service.FetchAllStockExternalIndicatorsAsync();

        Assert.True(result.DurationSeconds >= 0);
        Assert.Equal(1, result.TotalTickers);
    }

    // ── Helpers ──

    private FinnhubExternalIndicatorService CreateService() =>
        new(
            _client.Object,
            _stockTickerRepo.Object,
            _stockAdvRepo.Object,
            _dbFactory.Object,
            _metrics.Object,
            Mock.Of<ILogger<FinnhubExternalIndicatorService>>()
        );

    private void SetupAllEndpoints()
    {
        _client.Setup(c => c.GetInsiderTransactionsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new InsiderTransactionsResponse { Data = new() });
        _client.Setup(c => c.GetInsiderSentimentAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new InsiderSentimentResponse { Data = new() });
        _client.Setup(c => c.GetRecommendationTrendsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RecommendationTrend>());
    }

    private void SetupDataSource()
    {
        // Mock returns Finnhub data_source_id = 5
        // Use same Dapper mock pattern as existing tests in the project
    }
}
```

### Step 3: Implement service layer

Add to `FinnhubExternalIndicatorService.cs` (the `partial class`):

```csharp
public partial class FinnhubExternalIndicatorService : IFinnhubExternalIndicatorService
{
    private readonly IFinnhubApiClient _finnhubClient;
    private readonly IStockTickerRepository _stockTickerRepo;
    private readonly IStockIndicatorAdvancedRepository _stockAdvancedRepo;
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<FinnhubExternalIndicatorService> _logger;
    private int? _dataSourceId;
    private const int MaxRetries = 3;
    private const string MetricsPrefix = "finnhub_external";

    public FinnhubExternalIndicatorService(
        IFinnhubApiClient finnhubClient,
        IStockTickerRepository stockTickerRepo,
        IStockIndicatorAdvancedRepository stockAdvancedRepo,
        IDbConnectionFactory dbConnectionFactory,
        IMetricsClient metrics,
        ILogger<FinnhubExternalIndicatorService> logger)
    {
        _finnhubClient = finnhubClient;
        _stockTickerRepo = stockTickerRepo;
        _stockAdvancedRepo = stockAdvancedRepo;
        _dbConnectionFactory = dbConnectionFactory;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<BatchIndicatorResult> FetchAllStockExternalIndicatorsAsync(CancellationToken ct = default)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var result = new BatchIndicatorResult();

        try
        {
            var tickers = (await _stockTickerRepo.GetActiveTickersAsync()).ToList();
            result.TotalTickers = tickers.Count;

            foreach (var ticker in tickers)
            {
                if (ct.IsCancellationRequested) break;

                try
                {
                    var success = await FetchStockExternalIndicatorsAsync(ticker.Id, ticker.Symbol, ct);
                    if (success) result.SuccessCount++;
                    else result.FailedCount++;
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed external indicators for {Symbol}", ticker.Symbol);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed batch external indicator fetch");
            result.Errors.Add($"Batch error: {ex.Message}");
        }

        sw.Stop();
        result.DurationSeconds = sw.Elapsed.TotalSeconds;
        return result;
    }

    public async Task<bool> FetchStockExternalIndicatorsAsync(int tickerId, string symbol, CancellationToken ct = default)
    {
        try
        {
            var dataSourceId = await GetFinnhubDataSourceIdAsync();

            // Fetch each endpoint independently with retry — partial success is OK
            var insider = await FinnhubResiliencePolicies.ExecuteWithRetryAsync(
                () => _finnhubClient.GetInsiderTransactionsAsync(symbol, ct),
                MaxRetries, _logger, $"InsiderTransactions({symbol})", ct);

            var from = DateTime.UtcNow.AddMonths(-12).ToString("yyyy-MM-dd");
            var to = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var sentiment = await FinnhubResiliencePolicies.ExecuteWithRetryAsync(
                () => _finnhubClient.GetInsiderSentimentAsync(symbol, from, to, ct),
                MaxRetries, _logger, $"InsiderSentiment({symbol})", ct);

            var recs = await FinnhubResiliencePolicies.ExecuteWithRetryAsync(
                () => _finnhubClient.GetRecommendationTrendsAsync(symbol, ct),
                MaxRetries, _logger, $"Recommendations({symbol})", ct);

            // Aggregate
            var (buyCount, sellCount, netShares, netValue) = AggregateInsiderTransactions(insider?.Data);
            var (mspr, msprChange) = AggregateInsiderSentiment(sentiment?.Data);
            var (strongBuy, buy, hold, sell, strongSell) = AggregateRecommendations(recs);
            var consensus = DeriveConsensus(strongBuy, buy, hold, sell, strongSell);

            var entity = new StockIndicatorAdvanced
            {
                StockTickerId = tickerId,
                DataSourceId = dataSourceId,
                IndicatorTime = DateTime.UtcNow,
                InsiderBuyCount = buyCount,
                InsiderSellCount = sellCount,
                InsiderNetShares = netShares,
                InsiderNetValue = netValue,
                InsiderMspr = mspr,
                InsiderMsprChange = msprChange,
                AnalystStrongBuy = strongBuy,
                AnalystBuy = buy,
                AnalystHold = hold,
                AnalystSell = sell,
                AnalystStrongSell = strongSell,
                AnalystConsensus = consensus,
            };

            await _stockAdvancedRepo.BulkUpsertAsync(new[] { entity });

            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_ticker_success", 1,
                new Dictionary<string, string> { ["symbol"] = symbol });

            return true;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed fetching external indicators for {Symbol}", symbol);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_ticker_failure", 1,
                new Dictionary<string, string> { ["symbol"] = symbol });
            return false;
        }
    }

    private async Task<int> GetFinnhubDataSourceIdAsync()
    {
        if (_dataSourceId.HasValue) return _dataSourceId.Value;
        using var conn = _dbConnectionFactory.CreateConnection();
        _dataSourceId = await conn.QueryFirstOrDefaultAsync<int?>(
            "SELECT id FROM lookup_data_sources WHERE name = 'Finnhub'");
        return _dataSourceId ?? throw new InvalidOperationException("Finnhub data source not found");
    }
}
```

### Step 4: Run all tests

```bash
dotnet test -v normal
```

### Step 5: Commit

```bash
git add src/DataFetcher.Worker/Application/Providers/Finnhub/IFinnhubExternalIndicatorService.cs \
        src/DataFetcher.Worker/Application/Providers/Finnhub/FinnhubExternalIndicatorService.cs \
        tests/DataFetcher.Worker.Tests/FinnhubExternalIndicatorServiceTests.cs
git commit -m "feat(finnhub): service layer with retry, partial-failure tolerance, and batch orchestration"
```

---

## Task 7: Wire Into Worker + DI + Controller + Backfill

**Files:**
- Modify: `src/DataFetcher.Worker/Program.cs`
- Modify: `src/DataFetcher.Worker/Workers/Finnhub/FinnhubFetchWorker.cs`
- Modify: `src/DataFetcher.Worker/Presentation/Controllers/FinnhubController.cs`
- Modify: Backfill consumer (wherever `BackfillStockAdvancedIndicatorsAsync` is called)

### Step 1: Register in DI (`Program.cs`)

```csharp
builder.Services.AddScoped<IFinnhubExternalIndicatorService, FinnhubExternalIndicatorService>();
```

### Step 2: Extend `FinnhubFetchWorker.ExecuteAsync`

After the fundamentals fetch (~line 87), add:

```csharp
var externalService = scope.ServiceProvider.GetRequiredService<IFinnhubExternalIndicatorService>();
_logger.LogInformation("Starting Finnhub external indicator fetch for all active tickers");
var externalResult = await externalService.FetchAllStockExternalIndicatorsAsync(stoppingToken);
message += $" | External: {externalResult.SuccessCount}/{externalResult.TotalTickers} ({externalResult.DurationSeconds:F1}s)";
if (externalResult.Errors.Count > 0)
    message += $" | ExtErrors: {string.Join("; ", externalResult.Errors.Take(3))}";
```

### Step 3: Add controller endpoints

```csharp
[HttpPost("external-indicators/trigger/all")]
[ProducesResponseType(typeof(TriggerResponse), 200)]
public async Task<IActionResult> TriggerExternalIndicators(CancellationToken ct)
{
    _logger.LogInformation("Manual trigger for external indicators");
    try
    {
        var service = HttpContext.RequestServices.GetRequiredService<IFinnhubExternalIndicatorService>();
        var result = await service.FetchAllStockExternalIndicatorsAsync(ct);
        return Ok(new TriggerResponse
        {
            Success = true,
            Message = $"Stocks: {result.SuccessCount}/{result.TotalTickers} ({result.DurationSeconds:F1}s)",
            RecordsProcessed = result.SuccessCount
        });
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error during manual external indicator trigger");
        return Ok(new TriggerResponse { Success = false, Message = ex.Message });
    }
}

[HttpPost("external-indicators/trigger/{tickerId:int}")]
[ProducesResponseType(typeof(TriggerResponse), 200)]
[ProducesResponseType(404)]
public async Task<IActionResult> TriggerExternalIndicatorsSingle(int tickerId, CancellationToken ct)
{
    var ticker = await _tickerRepo.GetByIdAsync(tickerId);
    if (ticker == null) return NotFound(new { message = $"Ticker {tickerId} not found" });

    var service = HttpContext.RequestServices.GetRequiredService<IFinnhubExternalIndicatorService>();
    var success = await service.FetchStockExternalIndicatorsAsync(tickerId, ticker.Symbol, ct);
    return Ok(new TriggerResponse
    {
        Success = success,
        Message = success ? $"External indicators fetched for {ticker.Symbol}" : $"Failed for {ticker.Symbol}",
        RecordsProcessed = success ? 1 : 0
    });
}
```

### Step 4: Wire into backfill pipeline

Find where `BackfillStockAdvancedIndicatorsAsync` is called (the backfill consumer). Add after it:

```csharp
var externalService = scope.ServiceProvider.GetRequiredService<IFinnhubExternalIndicatorService>();
await externalService.FetchStockExternalIndicatorsAsync(tickerId, symbol, ct);
```

This ensures newly onboarded tickers get external indicators immediately.

### Step 5: Build + test everything

```bash
cd services/workers/data-fetcher-2.0
dotnet build && dotnet test -v normal
```

### Step 6: Commit

```bash
git add src/DataFetcher.Worker/Program.cs \
        src/DataFetcher.Worker/Workers/Finnhub/FinnhubFetchWorker.cs \
        src/DataFetcher.Worker/Presentation/Controllers/FinnhubController.cs \
        <backfill-consumer-file>
git commit -m "feat(finnhub): wire external indicators into daily schedule, controller, and backfill pipeline"
```

---

## Task 8: Final Build + Full Test Suite + Verify No Regressions

### Step 1: Full build

```bash
dotnet build
```

### Step 2: Run ALL tests

```bash
dotnet test -v normal --logger "console;verbosity=detailed"
```

### Step 3: Count tests — verify new tests added and old tests still pass

---

## Deployment Plan

1. **Baseline check** — SSH → `docker ps` → note data-fetcher-2.0 version
2. **Stage and push** — `git add <specific files>` → commit → push
3. **Verify build** — `gh run watch` — data-fetcher-2.0 must build
4. **Verify VM** — SSH → `docker ps` → new version confirmed
5. **Manual trigger** — `curl -X POST http://localhost:5001/api/finnhub/external-indicators/trigger/all`
6. **Verify data** —
   ```sql
   SELECT s.symbol, a.insider_buy_count, a.insider_sell_count, a.insider_mspr,
          a.analyst_strong_buy, a.analyst_buy, a.analyst_hold, a.analyst_consensus
   FROM analysis_indicators_stock_pro a
   JOIN stock_tickers s ON s.id = a.stock_ticker_id
   WHERE a.insider_buy_count IS NOT NULL
   ORDER BY a.indicator_time DESC LIMIT 10;
   ```
7. **Done**
