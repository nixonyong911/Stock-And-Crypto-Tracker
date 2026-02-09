using DataFetcher.Worker.Infrastructure.Providers.Massive.Models;

namespace DataFetcher.Worker.Infrastructure.Providers.Massive;

/// <summary>
/// Client for interacting with the Massive technical indicators API.
/// </summary>
public interface IMassiveApiClient
{
    /// <summary>
    /// Gets Simple Moving Average (SMA) indicator data for a symbol.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol.</param>
    /// <param name="timestampGte">Start timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="timestampLte">End timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="window">The SMA window size (number of periods).</param>
    /// <param name="limit">Maximum number of results to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The SMA indicator response, or null if the response is empty.</returns>
    Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetSmaAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets Exponential Moving Average (EMA) indicator data for a symbol.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol.</param>
    /// <param name="timestampGte">Start timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="timestampLte">End timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="window">The EMA window size (number of periods).</param>
    /// <param name="limit">Maximum number of results to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The EMA indicator response, or null if the response is empty.</returns>
    Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetEmaAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets Moving Average Convergence Divergence (MACD) indicator data for a symbol.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol.</param>
    /// <param name="timestampGte">Start timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="timestampLte">End timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="shortWindow">The short-period window for MACD calculation.</param>
    /// <param name="longWindow">The long-period window for MACD calculation.</param>
    /// <param name="signalWindow">The signal line window for MACD calculation.</param>
    /// <param name="limit">Maximum number of results to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The MACD indicator response, or null if the response is empty.</returns>
    Task<MassiveIndicatorResponse<MassiveMacdValue>?> GetMacdAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int shortWindow,
        int longWindow,
        int signalWindow,
        int limit,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets Relative Strength Index (RSI) indicator data for a symbol.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol.</param>
    /// <param name="timestampGte">Start timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="timestampLte">End timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="window">The RSI window size (number of periods).</param>
    /// <param name="limit">Maximum number of results to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The RSI indicator response, or null if the response is empty.</returns>
    Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetRsiAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default);
}
