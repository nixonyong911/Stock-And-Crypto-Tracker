using DataFetcher.Worker.Domain.Providers.Etoro.Models;

namespace DataFetcher.Worker.Application.Providers.Etoro;

public interface IEtoroMarketDataClient
{
    Task<List<EtoroInstrument>> SearchInstrumentAsync(
        string value,
        string filterField = "internalSymbolFull",
        CancellationToken cancellationToken = default);

    Task<List<EtoroCandle>> GetCandlesAsync(
        int instrumentId,
        string interval,
        string direction = "desc",
        int count = 100,
        CancellationToken cancellationToken = default);
}
