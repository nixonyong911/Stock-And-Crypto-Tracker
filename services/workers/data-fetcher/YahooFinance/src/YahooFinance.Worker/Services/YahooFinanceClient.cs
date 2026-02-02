using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using YahooFinanceApi;
using YahooFinance.Worker.Configuration;
using YahooFinance.Worker.Models;

namespace YahooFinance.Worker.Services;

public class YahooFinanceClient : IYahooFinanceClient
{
    private readonly YahooFinanceSettings _settings;
    private readonly ILogger<YahooFinanceClient> _logger;

    public YahooFinanceClient(
        IOptions<YahooFinanceSettings> settings,
        ILogger<YahooFinanceClient> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<FundamentalsData?> GetFundamentalsAsync(string symbol, int stockTickerId, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogDebug("Fetching fundamentals for {Symbol}", symbol);

            // Using YahooFinanceApi NuGet package
            var securities = await Yahoo.Symbols(symbol)
                .Fields(
                    // Valuation
                    Field.MarketCap,
                    Field.TrailingPE,
                    Field.ForwardPE,
                    Field.PriceToBook,
                    // Financials
                    Field.EpsTrailingTwelveMonths,
                    Field.EpsForward,
                    // Price metrics
                    Field.FiftyTwoWeekHigh,
                    Field.FiftyTwoWeekLow,
                    Field.FiftyDayAverage,
                    Field.TwoHundredDayAverage,
                    // Dividend
                    Field.TrailingAnnualDividendYield,
                    Field.TrailingAnnualDividendRate
                )
                .QueryAsync(cancellationToken);

            if (!securities.TryGetValue(symbol, out var security))
            {
                _logger.LogWarning("No data returned for {Symbol}", symbol);
                return null;
            }

            var data = new FundamentalsData
            {
                StockTickerId = stockTickerId,
                LastFetchedAt = DateTime.UtcNow,

                // Valuation Metrics
                MarketCap = GetDecimalField(security, Field.MarketCap),
                PeRatio = GetDecimalField(security, Field.TrailingPE),
                ForwardPe = GetDecimalField(security, Field.ForwardPE),
                PriceToBook = GetDecimalField(security, Field.PriceToBook),

                // Financial Health
                EpsTtm = GetDecimalField(security, Field.EpsTrailingTwelveMonths),

                // Price Metrics
                FiftyTwoWeekHigh = GetDecimalField(security, Field.FiftyTwoWeekHigh),
                FiftyTwoWeekLow = GetDecimalField(security, Field.FiftyTwoWeekLow),
                FiftyDayAverage = GetDecimalField(security, Field.FiftyDayAverage),
                TwoHundredDayAverage = GetDecimalField(security, Field.TwoHundredDayAverage),

                // Dividend
                DividendYield = GetDecimalField(security, Field.TrailingAnnualDividendYield),
                DividendRate = GetDecimalField(security, Field.TrailingAnnualDividendRate)
            };

            _logger.LogInformation("Successfully fetched fundamentals for {Symbol}: MarketCap={MarketCap}, PE={PE}",
                symbol, data.MarketCap, data.PeRatio);

            return data;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching fundamentals for {Symbol}", symbol);
            throw;
        }
    }

    public async Task<IEnumerable<EarningsData>> GetEarningsCalendarAsync(string symbol, int stockTickerId, CancellationToken cancellationToken = default)
    {
        var earningsList = new List<EarningsData>();

        try
        {
            _logger.LogDebug("Fetching earnings calendar for {Symbol}", symbol);

            // Query for earnings date fields
            var securities = await Yahoo.Symbols(symbol)
                .Fields(Field.EarningsTimestamp, Field.EarningsTimestampStart, Field.EarningsTimestampEnd)
                .QueryAsync(cancellationToken);

            if (!securities.TryGetValue(symbol, out var security))
            {
                _logger.LogDebug("No earnings data returned for {Symbol}", symbol);
                return earningsList;
            }

            // Try to get next earnings date
            DateOnly? earningsDate = null;

            var timestamp = GetLongField(security, Field.EarningsTimestamp);
            if (timestamp.HasValue)
            {
                var dt = DateTimeOffset.FromUnixTimeSeconds(timestamp.Value).UtcDateTime;
                earningsDate = DateOnly.FromDateTime(dt);
            }
            else
            {
                var timestampStart = GetLongField(security, Field.EarningsTimestampStart);
                if (timestampStart.HasValue)
                {
                    var dt = DateTimeOffset.FromUnixTimeSeconds(timestampStart.Value).UtcDateTime;
                    earningsDate = DateOnly.FromDateTime(dt);
                }
            }

            if (earningsDate.HasValue)
            {
                earningsList.Add(new EarningsData
                {
                    StockTickerId = stockTickerId,
                    EarningsDate = earningsDate.Value,
                    IsEstimate = earningsDate.Value >= DateOnly.FromDateTime(DateTime.UtcNow)
                });

                _logger.LogInformation("Found earnings date for {Symbol}: {Date}", symbol, earningsDate.Value);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not fetch earnings calendar for {Symbol}", symbol);
        }

        return earningsList;
    }

    private static decimal? GetDecimalField(Security security, Field field)
    {
        try
        {
            // Security is a dictionary-like object
            if (security.Fields.TryGetValue(field.ToString(), out var value) && value != null)
            {
                return value switch
                {
                    decimal d => d,
                    double dd => (decimal)dd,
                    float f => (decimal)f,
                    long l => l,
                    int i => i,
                    _ => null
                };
            }
        }
        catch
        {
            // Field not available
        }
        return null;
    }

    private static long? GetLongField(Security security, Field field)
    {
        try
        {
            if (security.Fields.TryGetValue(field.ToString(), out var value) && value != null)
            {
                return value switch
                {
                    long l => l,
                    int i => i,
                    double d => (long)d,
                    decimal dec => (long)dec,
                    _ => null
                };
            }
        }
        catch
        {
            // Field not available
        }
        return null;
    }
}
