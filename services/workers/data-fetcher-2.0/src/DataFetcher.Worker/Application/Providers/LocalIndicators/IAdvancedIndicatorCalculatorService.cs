namespace DataFetcher.Worker.Application.Providers.LocalIndicators;

public interface IAdvancedIndicatorCalculatorService
{
    Task<BatchIndicatorResult> ComputeAllStockAdvancedIndicatorsAsync(CancellationToken cancellationToken = default);
    Task<BatchIndicatorResult> ComputeAllCryptoAdvancedIndicatorsAsync(CancellationToken cancellationToken = default);
}
