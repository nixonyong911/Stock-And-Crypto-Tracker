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

    Task<EtoroSocialSearchResponse> SearchInstrumentsSortedAsync(
        string sortField,
        int? instrumentTypeId = null,
        int pageSize = 25,
        int pageNumber = 1,
        string? fields = null,
        CancellationToken cancellationToken = default);

    Task<EtoroCuratedListsResponse?> GetCuratedListsAsync(
        CancellationToken cancellationToken = default);

    Task<EtoroInvestorSearchResponse> SearchTopInvestorsAsync(
        string period = "CurrYear",
        string sort = "-copiers",
        int pageSize = 100,
        CancellationToken cancellationToken = default);

    Task<EtoroUserPortfolioResponse?> GetUserPortfolioAsync(
        string username,
        CancellationToken cancellationToken = default);

    Task<EtoroSocialInstrument?> LookupInstrumentByIdAsync(
        int instrumentId,
        CancellationToken cancellationToken = default);
}
