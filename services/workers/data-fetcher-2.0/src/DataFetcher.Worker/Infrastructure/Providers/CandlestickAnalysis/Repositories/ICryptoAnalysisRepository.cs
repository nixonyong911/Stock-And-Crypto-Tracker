using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Infrastructure.Providers.CandlestickAnalysis.Repositories;

public interface ICryptoAnalysisRepository
{
    Task UpsertAnalysisAsync(CryptoAnalysisResult result);
    Task<IEnumerable<CryptoAnalysisResult>> GetAnalysisAsync(string symbol, DateOnly? startDate, DateOnly? endDate);
    Task<bool> ExistsAsync(int cryptoTickerId, DateOnly date);
    Task<IEnumerable<DateOnly>> GetAnalyzedDatesAsync(int cryptoTickerId, DateOnly startDate, DateOnly endDate);
}
