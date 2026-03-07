using DataFetcher.Worker.Domain.Providers.Alpaca.Models;

namespace DataFetcher.Worker.Application.Providers.Alpaca;

public interface IAlpacaTickerManagementService
{
    Task<AlpacaAddTickerResult> AddTickerAsync(AlpacaAddTickerRequest request, CancellationToken cancellationToken = default);
    Task<AlpacaAddTickerResult> ToggleTickerAsync(int id, string assetType, CancellationToken cancellationToken = default);
}
