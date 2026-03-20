using DataFetcher.Worker.Application.Providers.LocalIndicators;
using DataFetcher.Worker.Infrastructure.Common.Repositories;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class AdvancedIndicatorsComputeStep : ComputeStepBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AdvancedIndicatorsComputeStep> _logger;

    public AdvancedIndicatorsComputeStep(
        IServiceProvider serviceProvider,
        ILogger<AdvancedIndicatorsComputeStep> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public override string StepName => "AdvancedIndicators";
    public override int Priority => 50;
    public override string[] DependsOn => ["BasicIndicators"];
    public override string[] WritesToTables =>
        ["analysis_indicators_stock_pro", "analysis_indicators_crypto_pro"];
    public override string[] ReadsFromTables =>
        ["analysis_indicators_stock_free", "analysis_indicators_crypto_free"];

    public override async Task<ComputeStepResult> ExecuteAsync(PipelineContext ctx, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var advancedSvc = scope.ServiceProvider.GetRequiredService<IAdvancedIndicatorCalculatorService>();
        var stockRepo = scope.ServiceProvider.GetRequiredService<IStockTickerRepository>();
        var cryptoRepo = scope.ServiceProvider.GetRequiredService<ICryptoTickerRepository>();

        var successCount = 0;
        var failCount = 0;

        try
        {
            if (ctx.AssetType == "crypto")
            {
                var tickers = (await cryptoRepo.GetActiveTickersAsync()).ToList();
                _logger.LogInformation("Computing advanced indicators for {Count} crypto tickers", tickers.Count);

                foreach (var ticker in tickers)
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        await advancedSvc.BackfillCryptoAdvancedIndicatorsAsync(ticker.Id, ticker.Symbol, ct);
                        successCount++;
                    }
                    catch (Exception ex)
                    {
                        failCount++;
                        _logger.LogWarning(ex, "Advanced indicators failed for crypto {Symbol}", ticker.Symbol);
                    }
                }
            }
            else
            {
                var tickers = (await stockRepo.GetActiveTickersAsync()).ToList();
                _logger.LogInformation("Computing advanced indicators for {Count} stock tickers", tickers.Count);

                foreach (var ticker in tickers)
                {
                    ct.ThrowIfCancellationRequested();
                    try
                    {
                        await advancedSvc.BackfillStockAdvancedIndicatorsAsync(ticker.Id, ticker.Symbol, ct);
                        successCount++;
                    }
                    catch (Exception ex)
                    {
                        failCount++;
                        _logger.LogWarning(ex, "Advanced indicators failed for stock {Symbol}", ticker.Symbol);
                    }
                }
            }

            _logger.LogInformation(
                "Advanced indicators complete for {AssetType}: {Success} succeeded, {Failed} failed",
                ctx.AssetType, successCount, failCount);
            return new ComputeStepResult(successCount, failCount);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AdvancedIndicators failed for {AssetType}", ctx.AssetType);
            return new ComputeStepResult(successCount, failCount, ex.Message);
        }
    }
}
