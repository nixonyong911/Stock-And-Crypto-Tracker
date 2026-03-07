using System.Diagnostics;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public class AlpacaCryptoBackfillService : IAlpacaCryptoBackfillService
{
    private readonly IAlpacaMarketDataClient _apiClient;
    private readonly ICryptoTickerRepository _cryptoTickerRepository;
    private readonly IAlpacaStockPriceRepository _stockPriceRepo;
    private readonly IAlpacaCryptoPriceRepository _cryptoPriceRepository;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaCryptoBackfillService> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "Alpaca";

    public AlpacaCryptoBackfillService(
        IAlpacaMarketDataClient apiClient,
        ICryptoTickerRepository cryptoTickerRepository,
        IAlpacaStockPriceRepository stockPriceRepo,
        IAlpacaCryptoPriceRepository cryptoPriceRepository,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaCryptoBackfillService> logger,
        IMetricsClient metrics)
    {
        _apiClient = apiClient;
        _cryptoTickerRepository = cryptoTickerRepository;
        _stockPriceRepo = stockPriceRepo;
        _cryptoPriceRepository = cryptoPriceRepository;
        _settings = settings.Value;
        _logger = logger;
        _metrics = metrics;
    }

    public async Task<AlpacaBackfillResult> ExecuteBackfillAsync(AlpacaBackfillRequest request, CancellationToken cancellationToken = default)
    {
        var result = new AlpacaBackfillResult { Symbol = request.Symbol };
        var sw = Stopwatch.StartNew();

        try
        {
            var dataSource = await _stockPriceRepo.GetDataSourceByNameAsync(DataSourceName);
            if (dataSource == null)
                throw new InvalidOperationException($"Data source '{DataSourceName}' not found");

            var tickers = await _cryptoTickerRepository.GetActiveTickersAsync();
            var ticker = tickers.FirstOrDefault(t => t.Symbol == request.Symbol);
            if (ticker == null)
                throw new InvalidOperationException($"Crypto ticker '{request.Symbol}' not found");

            var start = DateTime.UtcNow.AddMonths(-_settings.MonthsToBackfill);
            var end = DateTime.UtcNow;
            string? pageToken = null;
            var totalRecords = 0;
            var pages = 0;

            _logger.LogInformation("Starting crypto backfill for {Symbol}: {Start} to {End}", request.Symbol, start, end);

            do
            {
                cancellationToken.ThrowIfCancellationRequested();
                pages++;

                var response = await _apiClient.GetCryptoBarsAsync(
                    new[] { request.Symbol }, _settings.CryptoTimeframe, start, end,
                    _settings.MaxBarsPerRequest, pageToken, cancellationToken);

                if (response?.Bars == null || !response.Bars.ContainsKey(request.Symbol) || response.Bars[request.Symbol].Count == 0)
                    break;

                var bars = response.Bars[request.Symbol];
                var prices = bars.Select(bar => new AlpacaCryptoPriceRow
                {
                    CryptoTickerId = ticker.Id,
                    DataSourceId = dataSource.Id,
                    PriceTime = DateTime.SpecifyKind(bar.Timestamp, DateTimeKind.Utc),
                    OpenPrice = (decimal)bar.Open,
                    HighPrice = (decimal)bar.High,
                    LowPrice = (decimal)bar.Low,
                    ClosePrice = (decimal)bar.Close,
                    Volume = bar.Volume,
                    MarketCap = null
                }).ToList();

                await _cryptoPriceRepository.UpsertCryptoPricesBatchAsync(prices);
                totalRecords += prices.Count;

                _logger.LogInformation("Crypto backfill page {Page} for {Symbol}: {Count} records (total: {Total})",
                    pages, request.Symbol, prices.Count, totalRecords);

                pageToken = response.NextPageToken;
            } while (!string.IsNullOrEmpty(pageToken));

            sw.Stop();
            result.Success = true;
            result.TotalRecordsInserted = totalRecords;
            result.PagesProcessed = pages;
            result.Duration = sw.Elapsed;

            _logger.LogInformation("Crypto backfill complete for {Symbol}: {Records} records in {Pages} pages ({Duration:F1}s)",
                request.Symbol, totalRecords, pages, sw.Elapsed.TotalSeconds);

            await _metrics.IncrementCounterAsync("alpaca_crypto_backfill_total", 1,
                new Dictionary<string, string> { ["symbol"] = request.Symbol, ["status"] = "success" });
        }
        catch (Exception ex)
        {
            sw.Stop();
            result.Success = false;
            result.Error = ex.Message;
            result.Duration = sw.Elapsed;
            _logger.LogError(ex, "Crypto backfill failed for {Symbol}", request.Symbol);

            await _metrics.IncrementCounterAsync("alpaca_crypto_backfill_total", 1,
                new Dictionary<string, string> { ["symbol"] = request.Symbol, ["status"] = "error" });
        }

        return result;
    }
}
