using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public interface ICryptoPriceTargetBackfillService
{
    Task<BackfillResult> BackfillAsync(int cryptoTickerId, string symbol, int days = 90, CancellationToken ct = default);
    Task<BackfillResult> BackfillAllAsync(int days = 90, CancellationToken ct = default);
}
