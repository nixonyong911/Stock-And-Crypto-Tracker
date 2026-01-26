using System.Diagnostics;
using Microsoft.Extensions.Logging;
using StockTracker.Common.Metrics;
using StockTracker.Data.Entities;
using TwelveData.Worker.Models;
using TwelveData.Worker.Repositories;

namespace TwelveData.Worker.Services;

public class CryptoFetchService : ICryptoFetchService
{
    private readonly ITwelveDataApiClient _apiClient;
    private readonly ICryptoTickerRepository _tickerRepository;
    private readonly ICryptoPriceRepository _priceRepository;
    private readonly IFetchScheduleRepository _scheduleRepository;
    private readonly ILogger<CryptoFetchService> _logger;
    private readonly IMetricsClient _metrics;
    
    private const string DataSourceName = "TwelveData";

    public CryptoFetchService(
        ITwelveDataApiClient apiClient,
        ICryptoTickerRepository tickerRepository,
        ICryptoPriceRepository priceRepository,
        IFetchScheduleRepository scheduleRepository,
        ILogger<CryptoFetchService> logger,
        IMetricsClient metrics)
    {
        _apiClient = apiClient;
        _tickerRepository = tickerRepository;
        _priceRepository = priceRepository;
        _scheduleRepository = scheduleRepository;
        _logger = logger;
        _metrics = metrics;
    }

    public async Task<int> FetchSymbolAsync(string symbol, string? date = null, CancellationToken cancellationToken = default)
    {
        // Use provided date or default to "yesterday"
        var fetchDate = string.IsNullOrWhiteSpace(date) ? "yesterday" : date;
        
        _logger.LogInformation("Manual crypto fetch triggered for symbol {Symbol} with date {Date}", symbol, fetchDate);
        
        var stopwatch = Stopwatch.StartNew();
        
        try
        {
            // Get the data source
            var dataSource = await _priceRepository.GetDataSourceByNameAsync(DataSourceName);
            if (dataSource == null)
            {
                throw new InvalidOperationException($"Data source '{DataSourceName}' not found in database. Please seed the data_sources table.");
            }

            // Get or create the ticker (auto-creates if not found)
            var ticker = await _tickerRepository.GetOrCreateTickerAsync(symbol);
            _logger.LogInformation("Using crypto ticker {Symbol} (ID: {Id})", ticker.Symbol, ticker.Id);

            // Use configuration with provided or default date
            var config = new CryptoFetchConfig
            {
                FetchDate = fetchDate,
                Interval = "15min",
                OutputSize = 96,  // 24h of 15min intervals
                Timezone = "UTC",
                RateLimitDelaySeconds = 8
            };

            // Fetch and store the data
            var recordsInserted = await FetchAndStoreSymbolDataAsync(ticker, dataSource.Id, config, cancellationToken);
            
            _logger.LogInformation("Fetched {Records} records for crypto {Symbol} (date: {Date})", recordsInserted, ticker.Symbol, fetchDate);
            
            // Record success metrics
            await _metrics.IncrementCounterAsync("crypto_fetch_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["status"] = "success"
                });
            
            await _metrics.IncrementCounterAsync("crypto_records_inserted_total", recordsInserted,
                new Dictionary<string, string> { ["symbol"] = symbol });
            
            return recordsInserted;
        }
        catch (Exception ex)
        {
            // Record error metrics
            await _metrics.IncrementCounterAsync("crypto_fetch_operations_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["status"] = "error"
                });
            
            await _metrics.IncrementCounterAsync("crypto_fetch_errors_total", 1,
                new Dictionary<string, string>
                {
                    ["symbol"] = symbol,
                    ["error_type"] = ex.GetType().Name
                });
            
            throw;
        }
        finally
        {
            stopwatch.Stop();
            
            // Record fetch duration
            await _metrics.ObserveHistogramAsync("crypto_fetch_duration_seconds",
                stopwatch.Elapsed.TotalSeconds,
                new Dictionary<string, string> { ["symbol"] = symbol });
        }
    }

    public async Task FetchAndStoreCryptoDataAsync(FetchSchedule schedule, CryptoFetchConfig config, CancellationToken cancellationToken = default)
    {
        var batchStopwatch = Stopwatch.StartNew();
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

            // Get active crypto tickers from database
            var tickers = await _tickerRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            
            if (tickerList.Count == 0)
            {
                var warning = "No active crypto tickers found";
                _logger.LogWarning(warning);
                await _scheduleRepository.UpdateLastRunAsync(schedule.Id, "success", warning);
                return;
            }

            _logger.LogInformation("Starting crypto data fetch for {Count} symbols for date {Date}", 
                tickerList.Count, config.FetchDate);

            // Record symbols to process
            await _metrics.SetGaugeAsync("crypto_symbols_to_process", tickerList.Count);

            var totalRecords = 0;
            var successCount = 0;
            var errorCount = 0;

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning("Cancellation requested, stopping crypto fetch");
                    break;
                }

                var symbolStopwatch = Stopwatch.StartNew();
                
                try
                {
                    var recordsInserted = await FetchAndStoreSymbolDataAsync(ticker, dataSource.Id, config, cancellationToken);
                    totalRecords += recordsInserted;
                    successCount++;
                    
                    _logger.LogInformation("Fetched {Records} records for crypto {Symbol}", recordsInserted, ticker.Symbol);
                    
                    // Record success metrics
                    await _metrics.IncrementCounterAsync("crypto_fetch_operations_total", 1,
                        new Dictionary<string, string>
                        {
                            ["symbol"] = ticker.Symbol,
                            ["status"] = "success"
                        });
                    
                    await _metrics.IncrementCounterAsync("crypto_records_inserted_total", recordsInserted,
                        new Dictionary<string, string> { ["symbol"] = ticker.Symbol });
                    
                    // Rate limiting - wait between API calls using config value
                    await Task.Delay(TimeSpan.FromSeconds(config.RateLimitDelaySeconds), cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogInformation("Crypto fetch operation was cancelled");
                    break;
                }
                catch (Exception ex)
                {
                    errorCount++;
                    var errorMsg = $"{ticker.Symbol}: {ex.Message}";
                    errorMessages.Add(errorMsg);
                    _logger.LogError(ex, "Error fetching data for crypto symbol {Symbol}", ticker.Symbol);
                    
                    // Record error metrics
                    await _metrics.IncrementCounterAsync("crypto_fetch_operations_total", 1,
                        new Dictionary<string, string>
                        {
                            ["symbol"] = ticker.Symbol,
                            ["status"] = "error"
                        });
                    
                    await _metrics.IncrementCounterAsync("crypto_fetch_errors_total", 1,
                        new Dictionary<string, string>
                        {
                            ["symbol"] = ticker.Symbol,
                            ["error_type"] = ex.GetType().Name
                        });
                    
                    // Continue with other symbols
                }
                finally
                {
                    symbolStopwatch.Stop();
                    
                    // Record fetch duration for this symbol
                    await _metrics.ObserveHistogramAsync("crypto_fetch_duration_seconds",
                        symbolStopwatch.Elapsed.TotalSeconds,
                        new Dictionary<string, string> { ["symbol"] = ticker.Symbol });
                }
            }

            batchStopwatch.Stop();
            
            var status = errorCount == 0 ? "success" : (successCount > 0 ? "partial" : "failed");
            var message = $"Total records: {totalRecords}, Success: {successCount}, Errors: {errorCount}, Duration: {batchStopwatch.Elapsed.TotalSeconds:F1}s";
            
            if (errorMessages.Count > 0)
            {
                message += $". Errors: {string.Join("; ", errorMessages.Take(5))}";
                if (errorMessages.Count > 5)
                    message += $" (+{errorMessages.Count - 5} more)";
            }
            
            _logger.LogInformation("Completed crypto data fetch. {Message}", message);
            
            // Record batch duration
            await _metrics.ObserveHistogramAsync("crypto_batch_duration_seconds",
                batchStopwatch.Elapsed.TotalSeconds);
            
            // Record symbols processed
            await _metrics.IncrementCounterAsync("crypto_symbols_processed_total", successCount);
            
            await _scheduleRepository.UpdateLastRunAsync(schedule.Id, status, message);
        }
        catch (Exception ex)
        {
            batchStopwatch.Stop();
            var error = $"Fatal error: {ex.Message}";
            _logger.LogError(ex, "Fatal error during crypto fetch operation");
            await _scheduleRepository.UpdateLastRunAsync(schedule.Id, "failed", error);
        }
    }

    public async Task<CryptoBatchFetchResult> FetchAllActiveTickersAsync(string? date = null, CancellationToken cancellationToken = default)
    {
        var fetchDate = string.IsNullOrWhiteSpace(date) ? "yesterday" : date;
        var result = new CryptoBatchFetchResult();
        
        _logger.LogInformation("Starting batch fetch for all active crypto tickers with date {Date}", fetchDate);
        
        try
        {
            // Get the data source
            var dataSource = await _priceRepository.GetDataSourceByNameAsync(DataSourceName);
            if (dataSource == null)
            {
                throw new InvalidOperationException($"Data source '{DataSourceName}' not found in database.");
            }

            // Get all active crypto tickers
            var tickers = await _tickerRepository.GetActiveTickersAsync();
            var tickerList = tickers.ToList();
            
            if (tickerList.Count == 0)
            {
                _logger.LogWarning("No active crypto tickers found for batch fetch");
                return result;
            }

            _logger.LogInformation("Found {Count} active crypto tickers for batch fetch", tickerList.Count);

            // Use default config with provided date
            var config = new CryptoFetchConfig
            {
                FetchDate = fetchDate,
                Interval = "15min",
                OutputSize = 96,  // 24h of 15min intervals
                Timezone = "UTC",
                RateLimitDelaySeconds = 8
            };

            foreach (var ticker in tickerList)
            {
                if (cancellationToken.IsCancellationRequested)
                {
                    _logger.LogWarning("Crypto batch fetch cancelled");
                    break;
                }

                var symbolResult = new CryptoSymbolResult { Symbol = ticker.Symbol };
                var stopwatch = Stopwatch.StartNew();

                try
                {
                    var recordsInserted = await FetchAndStoreSymbolDataAsync(ticker, dataSource.Id, config, cancellationToken);
                    
                    symbolResult.Success = true;
                    symbolResult.RecordsInserted = recordsInserted;
                    result.SuccessCount++;
                    result.TotalRecordsInserted += recordsInserted;

                    // Record success metrics
                    await _metrics.IncrementCounterAsync("crypto_fetch_operations_total", 1,
                        new Dictionary<string, string>
                        {
                            ["symbol"] = ticker.Symbol,
                            ["status"] = "success"
                        });
                    
                    await _metrics.IncrementCounterAsync("crypto_records_inserted_total", recordsInserted,
                        new Dictionary<string, string> { ["symbol"] = ticker.Symbol });

                    _logger.LogInformation("Fetched {Records} records for crypto {Symbol}", recordsInserted, ticker.Symbol);

                    // Rate limiting
                    await Task.Delay(TimeSpan.FromSeconds(config.RateLimitDelaySeconds), cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    symbolResult.Success = false;
                    symbolResult.Error = ex.Message;
                    result.FailedCount++;

                    // Record error metrics
                    await _metrics.IncrementCounterAsync("crypto_fetch_operations_total", 1,
                        new Dictionary<string, string>
                        {
                            ["symbol"] = ticker.Symbol,
                            ["status"] = "error"
                        });
                    
                    await _metrics.IncrementCounterAsync("crypto_fetch_errors_total", 1,
                        new Dictionary<string, string>
                        {
                            ["symbol"] = ticker.Symbol,
                            ["error_type"] = ex.GetType().Name
                        });

                    _logger.LogWarning(ex, "Error fetching crypto {Symbol}", ticker.Symbol);
                }
                finally
                {
                    stopwatch.Stop();
                    await _metrics.ObserveHistogramAsync("crypto_fetch_duration_seconds",
                        stopwatch.Elapsed.TotalSeconds,
                        new Dictionary<string, string> { ["symbol"] = ticker.Symbol });
                    
                    result.SymbolResults.Add(symbolResult);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fatal error during crypto batch fetch");
            throw;
        }

        _logger.LogInformation("Crypto batch fetch completed: {Success} success, {Failed} failed, {Records} records",
            result.SuccessCount, result.FailedCount, result.TotalRecordsInserted);

        return result;
    }

    private async Task<int> FetchAndStoreSymbolDataAsync(CryptoTicker ticker, int dataSourceId, CryptoFetchConfig config, CancellationToken cancellationToken)
    {
        var response = await _apiClient.GetCryptoTimeSeriesAsync(ticker.Symbol, config, cancellationToken);
        
        if (response?.Values == null || response.Values.Count == 0)
        {
            _logger.LogWarning("No price data returned for crypto {Symbol}", ticker.Symbol);
            return 0;
        }

        var prices = response.Values.Select(value => new CryptoPrice
        {
            CryptoTickerId = ticker.Id,
            DataSourceId = dataSourceId,
            PriceTime = TwelveDataApiClient.ConvertUtcString(value.Datetime),
            OpenPrice = TwelveDataApiClient.ParseDecimal(value.Open),
            HighPrice = TwelveDataApiClient.ParseDecimal(value.High),
            LowPrice = TwelveDataApiClient.ParseDecimal(value.Low),
            ClosePrice = TwelveDataApiClient.ParseDecimal(value.Close),
            Volume = TwelveDataApiClient.ParseDecimal(value.Volume),  // decimal for crypto
            MarketCap = null  // TwelveData time_series doesn't include market cap
        }).ToList();

        // Batch upsert for better performance
        await _priceRepository.UpsertCryptoPricesBatchAsync(prices);
        
        return prices.Count;
    }
}
