using DataFetcher.Worker.Application.Providers.CandlestickAnalysis;

namespace DataFetcher.Worker.Application.Providers.Pipeline.Steps;

public class CandlestickComputeStep : ComputeStepBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<CandlestickComputeStep> _logger;

    public CandlestickComputeStep(
        IServiceProvider serviceProvider,
        ILogger<CandlestickComputeStep> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public override string StepName => "CandlestickAnalysis";
    public override int Priority => 10;
    public override string[] DependsOn => [];
    public override string[] WritesToTables =>
        ["analysis_stock_candlestick_pattern", "analysis_crypto_candlestick_pattern"];
    public override string[] ReadsFromTables => ["stock_prices", "crypto_prices"];

    public override async Task<ComputeStepResult> ExecuteAsync(PipelineContext ctx, CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var today = ctx.AnalyzeDate;
        var yesterday = today.AddDays(-1);

        try
        {
            if (ctx.AssetType == "crypto")
                return await RunCryptoAnalysisAsync(scope.ServiceProvider, yesterday, today, ct);
            else
                return await RunStockAnalysisAsync(scope.ServiceProvider, yesterday, today, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CandlestickAnalysis failed for {AssetType} on {Date}", ctx.AssetType, ctx.AnalyzeDate);
            return new ComputeStepResult(0, 0, ex.Message);
        }
    }

    private async Task<ComputeStepResult> RunStockAnalysisAsync(
        IServiceProvider sp, DateOnly yesterday, DateOnly today, CancellationToken ct)
    {
        var svc = sp.GetRequiredService<ICandlestickAnalysisService>();
        var totalProcessed = 0;
        var totalSkipped = 0;

        var confirmed = await svc.AnalyzeAllStocksAsync(yesterday, ct);
        totalProcessed += confirmed.SuccessCount;
        totalSkipped += confirmed.TotalStocks - confirmed.SuccessCount;
        _logger.LogInformation(
            "Stock confirmed candlestick for {Date}: {Success}/{Total}",
            yesterday, confirmed.SuccessCount, confirmed.TotalStocks);

        var developing = await svc.AnalyzeDevelopingStocksAsync(today, ct);
        totalProcessed += developing.SuccessCount;
        totalSkipped += developing.TotalStocks - developing.SuccessCount;
        _logger.LogInformation(
            "Stock developing candlestick for {Date}: {Success}/{Total}",
            today, developing.SuccessCount, developing.TotalStocks);

        var weekly = await svc.AnalyzeWeeklyStocksAsync(today, ct);
        totalProcessed += weekly.SuccessCount;
        totalSkipped += weekly.TotalStocks - weekly.SuccessCount;
        if (weekly.TotalStocks > 0)
            _logger.LogInformation(
                "Stock weekly candlestick for {Date}: {Success}/{Total}",
                today, weekly.SuccessCount, weekly.TotalStocks);

        return new ComputeStepResult(totalProcessed, totalSkipped);
    }

    private async Task<ComputeStepResult> RunCryptoAnalysisAsync(
        IServiceProvider sp, DateOnly yesterday, DateOnly today, CancellationToken ct)
    {
        var svc = sp.GetRequiredService<ICryptoCandlestickAnalysisService>();
        var totalProcessed = 0;
        var totalSkipped = 0;

        var confirmed = await svc.AnalyzeAllCryptoAsync(yesterday, ct);
        totalProcessed += confirmed.SuccessCount;
        totalSkipped += confirmed.TotalCrypto - confirmed.SuccessCount;
        _logger.LogInformation(
            "Crypto confirmed candlestick for {Date}: {Success}/{Total}",
            yesterday, confirmed.SuccessCount, confirmed.TotalCrypto);

        var developing = await svc.AnalyzeDevelopingCryptoAsync(today, ct);
        totalProcessed += developing.SuccessCount;
        totalSkipped += developing.TotalCrypto - developing.SuccessCount;
        _logger.LogInformation(
            "Crypto developing candlestick for {Date}: {Success}/{Total}",
            today, developing.SuccessCount, developing.TotalCrypto);

        var weekly = await svc.AnalyzeWeeklyCryptoAsync(today, ct);
        totalProcessed += weekly.SuccessCount;
        totalSkipped += weekly.TotalCrypto - weekly.SuccessCount;
        if (weekly.TotalCrypto > 0)
            _logger.LogInformation(
                "Crypto weekly candlestick for {Date}: {Success}/{Total}",
                today, weekly.SuccessCount, weekly.TotalCrypto);

        return new ComputeStepResult(totalProcessed, totalSkipped);
    }
}
