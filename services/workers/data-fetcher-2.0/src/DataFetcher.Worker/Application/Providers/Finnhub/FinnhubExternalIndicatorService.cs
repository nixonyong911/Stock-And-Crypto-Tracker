using System.Diagnostics;
using Dapper;
using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Domain.Providers.Massive.Entities;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Massive.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

public partial class FinnhubExternalIndicatorService : IFinnhubExternalIndicatorService
{
    private const int MaxRetries = 2;
    private const string MetricsPrefix = "finnhub_external_indicator";

    private readonly IFinnhubApiClient _finnhubClient;
    private readonly IStockTickerRepository _stockTickerRepo;
    private readonly IStockIndicatorAdvancedRepository _stockAdvancedRepo;
    private readonly IInsiderTradingRepository _insiderTradingRepo;
    private readonly IDbConnectionFactory _dbConnectionFactory;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<FinnhubExternalIndicatorService> _logger;

    private int? _dataSourceId;

    public FinnhubExternalIndicatorService(
        IFinnhubApiClient finnhubClient,
        IStockTickerRepository stockTickerRepo,
        IStockIndicatorAdvancedRepository stockAdvancedRepo,
        IInsiderTradingRepository insiderTradingRepo,
        IDbConnectionFactory dbConnectionFactory,
        IMetricsClient metrics,
        ILogger<FinnhubExternalIndicatorService> logger)
    {
        _finnhubClient = finnhubClient;
        _stockTickerRepo = stockTickerRepo;
        _stockAdvancedRepo = stockAdvancedRepo;
        _insiderTradingRepo = insiderTradingRepo;
        _dbConnectionFactory = dbConnectionFactory;
        _metrics = metrics;
        _logger = logger;
    }

    public async Task<BatchIndicatorResult> FetchAllStockExternalIndicatorsAsync(CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
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
                    if (success)
                        result.SuccessCount++;
                    else
                        result.FailedCount++;
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    result.FailedCount++;
                    result.Errors.Add($"{ticker.Symbol}: {ex.Message}");
                    _logger.LogError(ex, "Failed fetching external indicators for {Symbol}", ticker.Symbol);
                }
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            _logger.LogInformation("External indicator fetch cancelled");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed batch external indicator fetch");
            result.Errors.Add($"Batch error: {ex.Message}");
        }

        try
        {
            await _insiderTradingRepo.CleanupOldTransactionsAsync(90);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to cleanup old insider trading transactions");
        }

        sw.Stop();
        result.DurationSeconds = sw.Elapsed.TotalSeconds;
        await _metrics.IncrementCounterAsync($"{MetricsPrefix}.batch_complete");
        return result;
    }

    public async Task<bool> FetchStockExternalIndicatorsAsync(int tickerId, string symbol, CancellationToken ct = default)
    {
        try
        {
            var dataSourceId = await GetFinnhubDataSourceIdAsync();

            var insider = await FinnhubResiliencePolicies.ExecuteWithRetryAsync(
                () => _finnhubClient.GetInsiderTransactionsAsync(symbol, ct),
                MaxRetries, _logger, $"InsiderTransactions({symbol})", ct);

            if (insider?.Data is { Count: > 0 })
            {
                try
                {
                    await _insiderTradingRepo.BulkUpsertAsync(tickerId, symbol, insider.Data);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to store raw insider transactions for {Symbol}", symbol);
                }
            }

            var fromDate = DateTime.UtcNow.AddMonths(-12).ToString("yyyy-MM-dd");
            var toDate = DateTime.UtcNow.ToString("yyyy-MM-dd");

            var sentiment = await FinnhubResiliencePolicies.ExecuteWithRetryAsync(
                () => _finnhubClient.GetInsiderSentimentAsync(symbol, fromDate, toDate, ct),
                MaxRetries, _logger, $"InsiderSentiment({symbol})", ct);

            var recs = await FinnhubResiliencePolicies.ExecuteWithRetryAsync(
                () => _finnhubClient.GetRecommendationTrendsAsync(symbol, ct),
                MaxRetries, _logger, $"RecommendationTrends({symbol})", ct);

            var (buyCount, sellCount, netShares, netValue) =
                AggregateInsiderTransactions(insider?.Data);
            var (mspr, msprChange) =
                AggregateInsiderSentiment(sentiment?.Data);
            var (strongBuy, buy, hold, sell, strongSell) =
                AggregateRecommendations(recs);
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
                AnalystConsensus = consensus
            };

            await _stockAdvancedRepo.BulkUpsertAsync(new[] { entity });
            _logger.LogDebug("Wrote external indicators for {Symbol}", symbol);
            return true;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed fetching external indicators for {Symbol}", symbol);
            return false;
        }
    }

    internal virtual async Task<int> GetFinnhubDataSourceIdAsync()
    {
        if (_dataSourceId.HasValue) return _dataSourceId.Value;

        using var conn = _dbConnectionFactory.CreateConnection();
        _dataSourceId = await conn.QueryFirstOrDefaultAsync<int?>(
            "SELECT id FROM lookup_data_sources WHERE name = 'Finnhub'");

        return _dataSourceId ?? throw new InvalidOperationException("Finnhub data source not found in lookup_data_sources");
    }

    // ================================================================
    // Static Aggregation Methods
    // ================================================================

    private const int InsiderLookbackDays = 90;

    public static (int BuyCount, int SellCount, long NetShares, decimal NetValue)
        AggregateInsiderTransactions(List<InsiderTransaction>? transactions)
    {
        if (transactions is null || transactions.Count == 0)
            return (0, 0, 0, 0m);

        var cutoff = DateTime.UtcNow.AddDays(-InsiderLookbackDays);

        var filtered = transactions.Where(t =>
            !t.IsDerivative
            && t.TransactionCode is "P" or "S"
            && DateTime.TryParse(t.TransactionDate, out var date)
            && date >= cutoff
        ).ToList();

        var buyCount = filtered.Count(t => t.TransactionCode == "P");
        var sellCount = filtered.Count(t => t.TransactionCode == "S");
        var netShares = (long)filtered.Sum(t => t.Change);
        var netValue = filtered.Sum(t => t.Change * t.TransactionPrice);

        return (buyCount, sellCount, netShares, netValue);
    }

    public static (decimal? Mspr, long? Change) AggregateInsiderSentiment(List<InsiderSentimentData>? data)
    {
        if (data is null || data.Count == 0)
            return (null, null);

        var latest = data.OrderByDescending(d => d.Year * 100 + d.Month).First();
        return (latest.Mspr, latest.Change);
    }

    public static (int StrongBuy, int Buy, int Hold, int Sell, int StrongSell)
        AggregateRecommendations(List<RecommendationTrend>? trends)
    {
        if (trends is null || trends.Count == 0)
            return (0, 0, 0, 0, 0);

        var latest = trends.OrderByDescending(t => t.Period).First();
        return (latest.StrongBuy, latest.Buy, latest.Hold, latest.Sell, latest.StrongSell);
    }

    public static string? DeriveConsensus(int strongBuy, int buy, int hold, int sell, int strongSell)
    {
        var total = strongBuy + buy + hold + sell + strongSell;
        if (total == 0) return null;

        var score = (strongBuy * 5.0 + buy * 4.0 + hold * 3.0 + sell * 2.0 + strongSell * 1.0) / total;

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
