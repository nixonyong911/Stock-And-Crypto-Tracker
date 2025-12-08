using AlphaVantage.Worker.Models;

namespace AlphaVantage.Worker.Services;

public interface IAlphaVantageApiClient
{
    Task<StockQuote?> GetQuoteAsync(string symbol, CancellationToken cancellationToken = default);
    Task<Dictionary<DateTime, StockDailyPrice>?> GetDailyPricesAsync(string symbol, bool compact = true, CancellationToken cancellationToken = default);
}

