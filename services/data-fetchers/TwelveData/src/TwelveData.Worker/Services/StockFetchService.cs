using System.Diagnostics;
using Microsoft.Extensions.Logging;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;

namespace TwelveData.Worker.Services;

public class StockFetchService : IStockFetchService
{
    private readonly ITwelveDataApiClient _apiClient;
    private readonly IStockTickerRepository _tickerRepository;
    private readonly IStockPriceRepository _priceRepository;
    private readonly IFetchScheduleRepository _scheduleRepository;
    private readonly ILogger<StockFetchService> _logger;
    
    private const string DataSourceName = "TwelveData";

    public StockFetchService(
        ITwelveDataApiClient apiClient,
        IStockTickerRepository tickerRepository,
        IStockPriceRepository priceRepository,
        IFetchScheduleRepository scheduleRepository,
        ILogger<StockFetchService> logger)
    {
        _apiClient = apiClient;
        _tickerRepository = tickerRepository;
        _priceRepository = priceRepository;
        _scheduleRepository = scheduleRepository;
        _logger = logger;
    }

    public async Task FetchAndStoreStockDataAsync(FetchSchedule schedule, FetchConfig config, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var errorMessages = new List<string>();
        
        try
        {
            // Get the data source
            var dataSource = await _priceRepository.GetDataSourceByNameAsync(DataSourceName);
            if (dataSource == null)
            {
                var error = $"Data source '{DataSourceName}' not found in database. Please seed the data_sources table.";
                _logger.LogError(error);
                await _scheduleRepository.UpdateLastRunAsync(schedule.Id, "failed", error);
                return;
            }

            // Get active tickers from database using config exchange
            var tickers = await _tickerRepository.GetActiveTickersAsync(config.Exchange, "USD");
            var tickerList = tickers.ToList();
            
            if (tickerList.Count == 0)
            {
                var warning = $"No active tickers found for exchange {config.Exchange} with currency USD";
                _logger.LogWarning(warning);
                await _scheduleRepository.UpdateLastRunAsync(schedule.Id, "success", warning);
                return;
            }

            _logger.LogInformation("Starting stock data fetch for {Count} symbols from {Exchange} for date {Date}", 
                tickerList.Count, config.Exchange, config.FetchDate);

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
                    var recordsInserted = await FetchAndStoreSymbolDataAsync(ticker, dataSource.Id, config, cancellationToken);
                    totalRecords += recordsInserted;
                    successCount++;
                    
                    _logger.LogInformation("Fetched {Records} records for {Symbol}", recordsInserted, ticker.Symbol);
                    
                    // Rate limiting - wait between API calls using config value
                    await Task.Delay(TimeSpan.FromSeconds(config.RateLimitDelaySeconds), cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogInformation("Fetch operation was cancelled");
                    break;
                }
                catch (Exception ex)
                {
                    errorCount++;
                    var errorMsg = $"{ticker.Symbol}: {ex.Message}";
                    errorMessages.Add(errorMsg);
                    _logger.LogError(ex, "Error fetching data for symbol {Symbol}", ticker.Symbol);
                    // Continue with other symbols
                }
            }

            stopwatch.Stop();
            
            var status = errorCount == 0 ? "success" : (successCount > 0 ? "partial" : "failed");
            var message = $"Total records: {totalRecords}, Success: {successCount}, Errors: {errorCount}, Duration: {stopwatch.Elapsed.TotalSeconds:F1}s";
            
            if (errorMessages.Count > 0)
            {
                message += $". Errors: {string.Join("; ", errorMessages.Take(5))}";
                if (errorMessages.Count > 5)
                    message += $" (+{errorMessages.Count - 5} more)";
            }
            
            _logger.LogInformation("Completed stock data fetch. {Message}", message);
            
            await _scheduleRepository.UpdateLastRunAsync(schedule.Id, status, message);
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            var error = $"Fatal error: {ex.Message}";
            _logger.LogError(ex, "Fatal error during stock fetch operation");
            await _scheduleRepository.UpdateLastRunAsync(schedule.Id, "failed", error);
        }
    }

    private async Task<int> FetchAndStoreSymbolDataAsync(StockTicker ticker, int dataSourceId, FetchConfig config, CancellationToken cancellationToken)
    {
        var response = await _apiClient.GetTimeSeriesAsync(ticker.Symbol, config, cancellationToken);
        
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
