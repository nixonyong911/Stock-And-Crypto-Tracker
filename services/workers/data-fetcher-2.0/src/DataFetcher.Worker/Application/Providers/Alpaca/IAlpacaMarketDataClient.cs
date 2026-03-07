using DataFetcher.Worker.Domain.Providers.Alpaca.Models;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public interface IAlpacaMarketDataClient
{
    Task<AlpacaBarResponse?> GetStockBarsAsync(
        IEnumerable<string> symbols,
        string timeframe,
        DateTime start,
        DateTime? end = null,
        int limit = 10000,
        string? pageToken = null,
        CancellationToken cancellationToken = default);

    Task<AlpacaBarResponse?> GetCryptoBarsAsync(
        IEnumerable<string> symbols,
        string timeframe,
        DateTime start,
        DateTime? end = null,
        int limit = 10000,
        string? pageToken = null,
        CancellationToken cancellationToken = default);

    Task<AlpacaAssetResponse?> GetAssetAsync(
        string symbol,
        CancellationToken cancellationToken = default);
}
