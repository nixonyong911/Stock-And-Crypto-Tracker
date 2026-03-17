using DataFetcher.Worker.Application.Providers.LocalIndicators;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

public interface IFinnhubExternalIndicatorService
{
    Task<BatchIndicatorResult> FetchAllStockExternalIndicatorsAsync(CancellationToken ct = default);
    Task<bool> FetchStockExternalIndicatorsAsync(int tickerId, string symbol, CancellationToken ct = default);
}
