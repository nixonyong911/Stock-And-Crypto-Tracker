using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Entities;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public interface ICryptoCandlestickAnalysisService
{
    Task<CryptoAnalysisResult?> AnalyzeCryptoAsync(int cryptoTickerId, string symbol, DateOnly date, CancellationToken cancellationToken = default);
    Task<CryptoBatchAnalysisResult> AnalyzeAllCryptoAsync(DateOnly date, CancellationToken cancellationToken = default);
    Task<CryptoBatchAnalysisResult> AnalyzeDevelopingCryptoAsync(DateOnly today, CancellationToken cancellationToken = default);
    Task<CryptoBatchAnalysisResult> AnalyzeWeeklyCryptoAsync(DateOnly weekEndDate, CancellationToken cancellationToken = default);
}
