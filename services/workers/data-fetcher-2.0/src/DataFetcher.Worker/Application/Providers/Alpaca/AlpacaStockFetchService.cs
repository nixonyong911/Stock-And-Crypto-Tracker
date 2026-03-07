using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public class AlpacaStockFetchService : IAlpacaStockFetchService
{
    private readonly IAlpacaMarketDataClient _apiClient;
    private readonly IStockTickerRepository _tickerRepository;
    private readonly IAlpacaStockPriceRepository _priceRepository;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaStockFetchService> _logger;
    private const string DataSourceName = "Alpaca";

    public AlpacaStockFetchService(
        IAlpacaMarketDataClient apiClient,
        IStockTickerRepository tickerRepository,
        IAlpacaStockPriceRepository priceRepository,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaStockFetchService> logger)
    {
        _apiClient = apiClient;
        _tickerRepository = tickerRepository;
        _priceRepository = priceRepository;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<int> FetchLatestStockDataAsync(DateTime? since = null, CancellationToken cancellationToken = default)
    {
        var dataSource = await _priceRepository.GetDataSourceByNameAsync(DataSourceName);
        if (dataSource == null)
            throw new InvalidOperationException($"Data source '{DataSourceName}' not found");

        var tickers = (await _tickerRepository.GetActiveTickersAsync()).ToList();
        if (tickers.Count == 0)
        {
            _logger.LogWarning("No active stock tickers found");
            return 0;
        }

        var tickerMap = tickers.ToDictionary(t => t.Symbol, t => t.Id);
        var symbols = tickers.Select(t => t.Symbol).ToList();
        var start = since ?? DateTime.UtcNow.AddMinutes(-45);
        var end = DateTime.UtcNow.AddMinutes(-15); // free tier 15-min delay

        _logger.LogInformation("Fetching stock bars for {Count} symbols from {Start} to {End}",
            symbols.Count, start, end);

        var totalRecords = 0;
        string? pageToken = null;

        do
        {
            cancellationToken.ThrowIfCancellationRequested();

            var response = await _apiClient.GetStockBarsAsync(
                symbols, _settings.StockTimeframe, start, end,
                _settings.MaxBarsPerRequest, pageToken, cancellationToken);

            if (response?.Bars == null || response.Bars.Count == 0)
                break;

            foreach (var (symbol, bars) in response.Bars)
            {
                if (!tickerMap.TryGetValue(symbol, out var tickerId))
                {
                    _logger.LogWarning("Unknown symbol in response: {Symbol}", symbol);
                    continue;
                }

                var prices = bars.Select(bar => new AlpacaStockPriceRow
                {
                    StockTickerId = tickerId,
                    DataSourceId = dataSource.Id,
                    PriceTime = DateTime.SpecifyKind(bar.Timestamp, DateTimeKind.Utc),
                    OpenPrice = (decimal)bar.Open,
                    HighPrice = (decimal)bar.High,
                    LowPrice = (decimal)bar.Low,
                    ClosePrice = (decimal)bar.Close,
                    Volume = (long)bar.Volume
                }).ToList();

                await _priceRepository.UpsertStockPricesBatchAsync(prices);
                totalRecords += prices.Count;
            }

            pageToken = response.NextPageToken;
        } while (!string.IsNullOrEmpty(pageToken));

        _logger.LogInformation("Stock fetch complete: {Records} records for {Symbols} symbols", totalRecords, symbols.Count);
        return totalRecords;
    }
}
