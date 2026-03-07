using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Microsoft.Extensions.Options;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public class AlpacaCryptoFetchService : IAlpacaCryptoFetchService
{
    private readonly IAlpacaMarketDataClient _apiClient;
    private readonly ICryptoTickerRepository _cryptoTickerRepository;
    private readonly IAlpacaStockPriceRepository _stockPriceRepo;
    private readonly IAlpacaCryptoPriceRepository _cryptoPriceRepository;
    private readonly AlpacaSettings _settings;
    private readonly ILogger<AlpacaCryptoFetchService> _logger;
    private const string DataSourceName = "Alpaca";

    public AlpacaCryptoFetchService(
        IAlpacaMarketDataClient apiClient,
        ICryptoTickerRepository cryptoTickerRepository,
        IAlpacaStockPriceRepository stockPriceRepo,
        IAlpacaCryptoPriceRepository cryptoPriceRepository,
        IOptions<AlpacaSettings> settings,
        ILogger<AlpacaCryptoFetchService> logger)
    {
        _apiClient = apiClient;
        _cryptoTickerRepository = cryptoTickerRepository;
        _stockPriceRepo = stockPriceRepo;
        _cryptoPriceRepository = cryptoPriceRepository;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<int> FetchLatestCryptoDataAsync(DateTime? since = null, CancellationToken cancellationToken = default)
    {
        var dataSource = await _stockPriceRepo.GetDataSourceByNameAsync(DataSourceName);
        if (dataSource == null)
            throw new InvalidOperationException($"Data source '{DataSourceName}' not found");

        var tickers = (await _cryptoTickerRepository.GetActiveTickersAsync()).ToList();
        if (tickers.Count == 0)
        {
            _logger.LogWarning("No active crypto tickers found");
            return 0;
        }

        var tickerMap = tickers.ToDictionary(t => t.Symbol, t => t.Id);
        var symbols = tickers.Select(t => t.Symbol).ToList();
        var start = since ?? DateTime.UtcNow.AddMinutes(-45);
        var end = DateTime.UtcNow; // no delay for crypto

        _logger.LogInformation("Fetching crypto bars for {Count} symbols from {Start} to {End}",
            symbols.Count, start, end);

        var totalRecords = 0;
        string? pageToken = null;

        do
        {
            cancellationToken.ThrowIfCancellationRequested();

            var response = await _apiClient.GetCryptoBarsAsync(
                symbols, _settings.CryptoTimeframe, start, end,
                _settings.MaxBarsPerRequest, pageToken, cancellationToken);

            if (response?.Bars == null || response.Bars.Count == 0)
                break;

            foreach (var (symbol, bars) in response.Bars)
            {
                if (!tickerMap.TryGetValue(symbol, out var tickerId))
                {
                    _logger.LogWarning("Unknown crypto symbol in response: {Symbol}", symbol);
                    continue;
                }

                var prices = bars.Select(bar => new AlpacaCryptoPriceRow
                {
                    CryptoTickerId = tickerId,
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
            }

            pageToken = response.NextPageToken;
        } while (!string.IsNullOrEmpty(pageToken));

        _logger.LogInformation("Crypto fetch complete: {Records} records for {Symbols} symbols", totalRecords, symbols.Count);
        return totalRecords;
    }
}
