using DataFetcher.Worker.Domain.Providers.Alpaca.Models;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public interface IAlpacaCryptoBackfillService
{
    Task<AlpacaBackfillResult> ExecuteBackfillAsync(AlpacaBackfillRequest request, CancellationToken cancellationToken = default);
}
