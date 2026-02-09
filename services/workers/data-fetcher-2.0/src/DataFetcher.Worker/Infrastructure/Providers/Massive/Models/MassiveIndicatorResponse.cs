namespace DataFetcher.Worker.Infrastructure.Providers.Massive.Models;

/// <summary>
/// Top-level response from Massive technical indicator endpoints.
/// </summary>
/// <typeparam name="T">The type of indicator value (e.g., <see cref="MassiveIndicatorValue"/> or <see cref="MassiveMacdValue"/>).</typeparam>
public class MassiveIndicatorResponse<T>
{
    /// <summary>
    /// URL for the next page of results, if available.
    /// </summary>
    public string? NextUrl { get; set; }

    /// <summary>
    /// Unique identifier for this API request.
    /// </summary>
    public string? RequestId { get; set; }

    /// <summary>
    /// The indicator results containing the list of values.
    /// </summary>
    public MassiveIndicatorResults<T>? Results { get; set; }

    /// <summary>
    /// Status of the API response (e.g., "OK").
    /// </summary>
    public string? Status { get; set; }
}

/// <summary>
/// Container for indicator result values.
/// </summary>
/// <typeparam name="T">The type of indicator value.</typeparam>
public class MassiveIndicatorResults<T>
{
    /// <summary>
    /// The list of indicator data points.
    /// </summary>
    public List<T> Values { get; set; } = new();
}
