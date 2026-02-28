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
    /// <param name="timespanOverride">Override the default timespan (e.g. "hour" for crypto).</param>
    /// <returns>The SMA indicator response, or null if the response is empty.</returns>
    Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetSmaAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default,
        string? timespanOverride = null);

    /// <summary>
    /// Gets Exponential Moving Average (EMA) indicator data for a symbol.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol.</param>
    /// <param name="timestampGte">Start timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="timestampLte">End timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="window">The EMA window size (number of periods).</param>
    /// <param name="limit">Maximum number of results to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <param name="timespanOverride">Override the default timespan (e.g. "hour" for crypto).</param>
    /// <returns>The EMA indicator response, or null if the response is empty.</returns>
    Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetEmaAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default,
        string? timespanOverride = null);

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
    /// <param name="timespanOverride">Override the default timespan (e.g. "hour" for crypto).</param>
    /// <returns>The MACD indicator response, or null if the response is empty.</returns>
    Task<MassiveIndicatorResponse<MassiveMacdValue>?> GetMacdAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int shortWindow,
        int longWindow,
        int signalWindow,
        int limit,
        CancellationToken cancellationToken = default,
        string? timespanOverride = null);

    /// <summary>
    /// Gets Relative Strength Index (RSI) indicator data for a symbol.
    /// </summary>
    /// <param name="symbol">The stock ticker symbol.</param>
    /// <param name="timestampGte">Start timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="timestampLte">End timestamp (Unix milliseconds, inclusive).</param>
    /// <param name="window">The RSI window size (number of periods).</param>
    /// <param name="limit">Maximum number of results to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <param name="timespanOverride">Override the default timespan (e.g. "hour" for crypto).</param>
    /// <returns>The RSI indicator response, or null if the response is empty.</returns>
    Task<MassiveIndicatorResponse<MassiveIndicatorValue>?> GetRsiAsync(
        string symbol,
        long timestampGte,
        long timestampLte,
        int window,
        int limit,
        CancellationToken cancellationToken = default,
        string? timespanOverride = null);

    /// <summary>
    /// Fetches a single page of indicator results from a URL (initial or next_url).
    /// Returns the deserialized values and the next_url for pagination (null if no more pages).
    /// </summary>
    /// <typeparam name="T">The indicator value type.</typeparam>
    /// <param name="url">The full URL to fetch (initial parameterized URL or next_url with apiKey appended).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A tuple of (values list, next URL or null).</returns>
    Task<(List<T> Values, string? NextUrl)> FetchPageAsync<T>(string url, CancellationToken cancellationToken = default);

    /// <summary>Builds the initial parameterized URL for SMA with limit=5000.</summary>
    string BuildSmaUrl(string symbol, long timestampGte, long timestampLte, int window, string? timespanOverride = null);

    /// <summary>Builds the initial parameterized URL for EMA with limit=5000.</summary>
    string BuildEmaUrl(string symbol, long timestampGte, long timestampLte, int window, string? timespanOverride = null);

    /// <summary>Builds the initial parameterized URL for MACD with limit=5000.</summary>
    string BuildMacdUrl(string symbol, long timestampGte, long timestampLte, int shortWindow, int longWindow, int signalWindow, string? timespanOverride = null);

    /// <summary>Builds the initial parameterized URL for RSI with limit=5000.</summary>
    string BuildRsiUrl(string symbol, long timestampGte, long timestampLte, int window, string? timespanOverride = null);
}
