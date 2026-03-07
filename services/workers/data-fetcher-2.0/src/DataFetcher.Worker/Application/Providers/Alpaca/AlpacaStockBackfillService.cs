using System.Diagnostics;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public class AlpacaStockBackfillService : IAlpacaStockBackfillService
{
    private readonly IAlpacaMarketDataClient _apiClient;
    private readonly IStockTickerRepository _tickerRepository;
    private readonly IAlpacaStockPriceRepository _priceRepository;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaStockBackfillService> _logger;
    private readonly IMetricsClient _metrics;
    private const string DataSourceName = "Alpaca";

    public AlpacaStockBackfillService(
        IAlpacaMarketDataClient apiClient,
        IStockTickerRepository tickerRepository,
        IAlpacaStockPriceRepository priceRepository,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaStockBackfillService> logger,
        IMetricsClient metrics)
    {
        _apiClient = apiClient;
        _tickerRepository = tickerRepository;
        _priceRepository = priceRepository;
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
            var dataSource = await _priceRepository.GetDataSourceByNameAsync(DataSourceName);
            if (dataSource == null)
                throw new InvalidOperationException($"Data source '{DataSourceName}' not found");

            var ticker = await _tickerRepository.GetBySymbolAsync(request.Symbol);
            if (ticker == null)
                throw new InvalidOperationException($"Stock ticker '{request.Symbol}' not found");

            var start = DateTime.UtcNow.AddMonths(-_settings.MonthsToBackfill);
            var end = DateTime.UtcNow.AddMinutes(-15);
            string? pageToken = null;
            var totalRecords = 0;
            var pages = 0;

            _logger.LogInformation("Starting stock backfill for {Symbol}: {Start} to {End}", request.Symbol, start, end);

            do
            {
                cancellationToken.ThrowIfCancellationRequested();
                pages++;

                var response = await _apiClient.GetStockBarsAsync(
                    new[] { request.Symbol }, _settings.StockTimeframe, start, end,
                    _settings.MaxBarsPerRequest, pageToken, cancellationToken);

                if (response?.Bars == null || !response.Bars.ContainsKey(request.Symbol) || response.Bars[request.Symbol].Count == 0)
                    break;

                var bars = response.Bars[request.Symbol];
                var prices = bars.Select(bar => new AlpacaStockPriceRow
                {
                    StockTickerId = ticker.Id,
                    DataSourceId = dataSource.Id,
                    PriceTime = DateTime.SpecifyKind(bar.Timestamp, DateTimeKind.Utc),
                    OpenPrice = (decimal)bar.Open,
                    HighPrice = (decimal)bar.High,
                    LowPrice = (decimal)bar.Low,
                    ClosePrice = (decimal)bar.Close,
                    Volume = bar.Volume
                }).ToList();

                await _priceRepository.UpsertStockPricesBatchAsync(prices);
                totalRecords += prices.Count;

                _logger.LogInformation("Backfill page {Page} for {Symbol}: {Count} records (total: {Total})",
                    pages, request.Symbol, prices.Count, totalRecords);

                pageToken = response.NextPageToken;
            } while (!string.IsNullOrEmpty(pageToken));

            sw.Stop();
            result.Success = true;
            result.TotalRecordsInserted = totalRecords;
            result.PagesProcessed = pages;
            result.Duration = sw.Elapsed;

            _logger.LogInformation("Stock backfill complete for {Symbol}: {Records} records in {Pages} pages ({Duration:F1}s)",
                request.Symbol, totalRecords, pages, sw.Elapsed.TotalSeconds);

            await _metrics.IncrementCounterAsync("alpaca_backfill_total", 1,
                new Dictionary<string, string> { ["symbol"] = request.Symbol, ["status"] = "success" });
        }
        catch (Exception ex)
        {
            sw.Stop();
            result.Success = false;
            result.Error = ex.Message;
            result.Duration = sw.Elapsed;
            _logger.LogError(ex, "Stock backfill failed for {Symbol}", request.Symbol);

            await _metrics.IncrementCounterAsync("alpaca_backfill_total", 1,
                new Dictionary<string, string> { ["symbol"] = request.Symbol, ["status"] = "error" });
        }

        return result;
    }
}
