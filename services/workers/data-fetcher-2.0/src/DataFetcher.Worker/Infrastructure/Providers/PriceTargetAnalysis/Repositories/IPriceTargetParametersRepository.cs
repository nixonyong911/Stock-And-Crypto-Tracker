using DataFetcher.Worker.Domain.Providers.PriceTargetAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.PriceTargetAnalysis.Repositories;

public interface IPriceTargetParametersRepository
{
    Task<PriceTargetParameters?> GetParametersAsync(string assetType, string traderType);
    Task<IReadOnlyList<PriceTargetParameters>> GetAllActiveParametersAsync(string assetType);
}
