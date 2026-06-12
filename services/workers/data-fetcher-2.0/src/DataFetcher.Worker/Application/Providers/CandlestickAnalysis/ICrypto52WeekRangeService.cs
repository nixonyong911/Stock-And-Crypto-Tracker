namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

/// <summary>
/// Computes and stores the 52-week high/low for crypto tickers from Alpaca
/// 1Day bars. Crypto counterpart of the Finnhub-sourced stock 52-week range.
/// </summary>
public interface ICrypto52WeekRangeService
{
    /// <summary>
    /// Refreshes the 52-week range for all active crypto tickers not already
    /// computed today. Returns the number of tickers upserted.
    /// </summary>
    Task<int> RefreshAllAsync(CancellationToken cancellationToken = default);
}
