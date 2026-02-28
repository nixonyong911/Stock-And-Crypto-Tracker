using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public interface IPriceTargetService
{
    Task<PriceTarget?> CalculateForStockAsync(int stockTickerId, string symbol, DateOnly date, CancellationToken ct = default);
    Task<BatchPriceTargetResult> CalculateAllStocksAsync(DateOnly date, CancellationToken ct = default);
}
