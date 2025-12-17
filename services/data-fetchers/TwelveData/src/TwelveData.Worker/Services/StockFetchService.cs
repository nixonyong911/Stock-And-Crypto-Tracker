using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TwelveData.Worker.Configuration;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;

namespace TwelveData.Worker.Services;

public class StockFetchService : IStockFetchService
{
    private readonly ITwelveDataApiClient _apiClient;
    private readonly IStockTickerRepository _tickerRepository;
    private readonly IStockPriceRepository _priceRepository;
    private readonly TwelveDataSettings _settings;
    private readonly ILogger<StockFetchService> _logger;
    
    private const string DataSourceName = "TwelveData";

    public StockFetchService(
        ITwelveDataApiClient apiClient,
        IStockTickerRepository tickerRepository,
        IStockPriceRepository priceRepository,
        IOptions<TwelveDataSettings> settings,
        ILogger<StockFetchService> logger)
    {
        _apiClient = apiClient;
        _tickerRepository = tickerRepository;
        _priceRepository = priceRepository;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task FetchAndStoreStockDataAsync(CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        
        // Get the data source
        var dataSource = await _priceRepository.GetDataSourceByNameAsync(DataSourceName);
        if (dataSource == null)
        {
            _logger.LogError("Data source '{DataSource}' not found in database. Please seed the data_sources table.", DataSourceName);
            return;
        }

        // Get active tickers from database
        var tickers = await _tickerRepository.GetActiveTickersAsync(_settings.Exchange, "USD");
        var tickerList = tickers.ToList();
        
        if (tickerList.Count == 0)
        {
            _logger.LogWarning("No active tickers found for exchange {Exchange} with currency USD", _settings.Exchange);
            return;
        }

        _logger.LogInformation("Starting stock data fetch for {Count} symbols from {Exchange}", 
            tickerList.Count, _settings.Exchange);

        var totalRecords = 0;
        var successCount = 0;
        var errorCount = 0;

        foreach (var ticker in tickerList)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                _logger.LogWarning("Cancellation requested, stopping fetch");
                break;
            }

            try
            {
                var recordsInserted = await FetchAndStoreSymbolDataAsync(ticker, dataSource.Id, cancellationToken);
                totalRecords += recordsInserted;
                successCount++;
                
                _logger.LogInformation("Fetched {Records} records for {Symbol}", recordsInserted, ticker.Symbol);
                
                // Rate limiting - wait between API calls to avoid hitting rate limits
                // Twelve Data free tier has limited requests per minute
                await Task.Delay(TimeSpan.FromSeconds(8), cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                _logger.LogInformation("Fetch operation was cancelled");
                break;
            }
            catch (Exception ex)
            {
                errorCount++;
                _logger.LogError(ex, "Error fetching data for symbol {Symbol}", ticker.Symbol);
                // Continue with other symbols
            }
        }

        stopwatch.Stop();
        _logger.LogInformation(
            "Completed stock data fetch. Total records: {TotalRecords}, Success: {Success}, Errors: {Errors}, Duration: {Duration}s", 
            totalRecords, successCount, errorCount, stopwatch.Elapsed.TotalSeconds);
    }

    private async Task<int> FetchAndStoreSymbolDataAsync(StockTicker ticker, int dataSourceId, CancellationToken cancellationToken)
    {
        var response = await _apiClient.GetTimeSeriesAsync(ticker.Symbol, cancellationToken);
        
        if (response?.Values == null || response.Values.Count == 0)
        {
            _logger.LogWarning("No price data returned for {Symbol}", ticker.Symbol);
            return 0;
        }

        var prices = response.Values.Select(value => new StockPrice
        {
            StockTickerId = ticker.Id,
            DataSourceId = dataSourceId,
            PriceTime = TwelveDataApiClient.ConvertToUtc(value.Datetime),
            OpenPrice = TwelveDataApiClient.ParseDecimal(value.Open),
            HighPrice = TwelveDataApiClient.ParseDecimal(value.High),
            LowPrice = TwelveDataApiClient.ParseDecimal(value.Low),
            ClosePrice = TwelveDataApiClient.ParseDecimal(value.Close),
            Volume = TwelveDataApiClient.ParseLong(value.Volume)
        }).ToList();

        // Batch upsert for better performance
        await _priceRepository.UpsertStockPricesBatchAsync(prices);
        
        return prices.Count;
    }
}

