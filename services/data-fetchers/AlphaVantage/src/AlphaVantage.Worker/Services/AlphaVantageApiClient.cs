using System.Globalization;
using System.Text.Json;
using AlphaVantage.Worker.Configuration;
using AlphaVantage.Worker.Models;
using Microsoft.Extensions.Options;

namespace AlphaVantage.Worker.Services;

public class AlphaVantageApiClient : IAlphaVantageApiClient
{
    private readonly HttpClient _httpClient;
    private readonly AlphaVantageSettings _settings;
    private readonly ILogger<AlphaVantageApiClient> _logger;

    public AlphaVantageApiClient(
        HttpClient httpClient,
        IOptions<AlphaVantageSettings> settings,
        ILogger<AlphaVantageApiClient> logger)
    {
        _httpClient = httpClient;
        _settings = settings.Value;
        _logger = logger;
        
        _httpClient.BaseAddress = new Uri(_settings.BaseUrl);
    }

    public async Task<StockQuote?> GetQuoteAsync(string symbol, CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={_settings.ApiKey}";
            
            _logger.LogDebug("Fetching quote for {Symbol}", symbol);
            
            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            
            // Check for API limit message
            if (content.Contains("Thank you for using Alpha Vantage"))
            {
                _logger.LogWarning("Alpha Vantage API rate limit reached");
                return null;
            }
            
            var quoteResponse = JsonSerializer.Deserialize<GlobalQuoteResponse>(content);
            
            if (quoteResponse?.GlobalQuote == null)
            {
                _logger.LogWarning("No quote data returned for {Symbol}", symbol);
                return null;
            }

            var data = quoteResponse.GlobalQuote;
            
            return new StockQuote
            {
                Symbol = data.Symbol,
                Open = ParseDecimal(data.Open),
                High = ParseDecimal(data.High),
                Low = ParseDecimal(data.Low),
                Price = ParseDecimal(data.Price),
                Volume = ParseLong(data.Volume),
                LatestTradingDay = DateTime.TryParse(data.LatestTradingDay, out var date) ? date : DateTime.Today,
                PreviousClose = ParseDecimal(data.PreviousClose),
                Change = ParseDecimal(data.Change),
                ChangePercent = data.ChangePercent
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching quote for {Symbol}", symbol);
            throw;
        }
    }

    public async Task<Dictionary<DateTime, StockDailyPrice>?> GetDailyPricesAsync(string symbol, bool compact = true, CancellationToken cancellationToken = default)
    {
        try
        {
            var outputSize = compact ? "compact" : "full";
            var url = $"/query?function=TIME_SERIES_DAILY&symbol={symbol}&outputsize={outputSize}&apikey={_settings.ApiKey}";
            
            _logger.LogDebug("Fetching daily prices for {Symbol} (outputSize: {OutputSize})", symbol, outputSize);
            
            var response = await _httpClient.GetAsync(url, cancellationToken);
            response.EnsureSuccessStatusCode();
            
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            
            // Check for API limit message
            if (content.Contains("Thank you for using Alpha Vantage"))
            {
                _logger.LogWarning("Alpha Vantage API rate limit reached");
                return null;
            }
            
            var timeSeriesResponse = JsonSerializer.Deserialize<TimeSeriesDailyResponse>(content);
            
            if (timeSeriesResponse?.TimeSeries == null)
            {
                _logger.LogWarning("No time series data returned for {Symbol}", symbol);
                return null;
            }

            var result = new Dictionary<DateTime, StockDailyPrice>();
            
            foreach (var (dateString, data) in timeSeriesResponse.TimeSeries)
            {
                if (DateTime.TryParse(dateString, out var date))
                {
                    result[date] = new StockDailyPrice
                    {
                        PriceDate = date,
                        OpenPrice = ParseDecimal(data.Open),
                        HighPrice = ParseDecimal(data.High),
                        LowPrice = ParseDecimal(data.Low),
                        ClosePrice = ParseDecimal(data.Close),
                        Volume = ParseLong(data.Volume)
                    };
                }
            }

            _logger.LogDebug("Fetched {Count} daily prices for {Symbol}", result.Count, symbol);
            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching daily prices for {Symbol}", symbol);
            throw;
        }
    }

    private static decimal ParseDecimal(string value)
    {
        return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var result) ? result : 0;
    }

    private static long ParseLong(string value)
    {
        return long.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var result) ? result : 0;
    }
}

