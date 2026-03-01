using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.PriceTargetAnalysis;

public interface ICryptoPriceTargetService
{
    Task<PriceTarget?> CalculateForCryptoAsync(int cryptoTickerId, string symbol, DateOnly date, CancellationToken ct = default);
    Task<BatchPriceTargetResult> CalculateAllCryptoAsync(DateOnly date, CancellationToken ct = default);
}
