using DataFetcher.Worker.Domain.Providers.CandlestickAnalysis.Models;

namespace DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

public interface ICryptoAnalysisBackfillService
{
    Task<AnalysisBackfillResult> ExecuteBackfillAsync(AnalysisBackfillRequest request, CancellationToken cancellationToken = default);
}
