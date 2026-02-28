using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public interface IPriceTargetBackfillService
{
    Task<BackfillResult> BackfillAsync(int stockTickerId, string symbol, int days = 90, CancellationToken ct = default);
    Task<BackfillResult> BackfillAllAsync(int days = 90, CancellationToken ct = default);
}
