using DataFetcher.Worker.Application.Providers.Pipeline;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class BackfillPipelineComputeStepIntegrationTests
{
    private readonly Mock<ILogger<BackfillPipelineExecutor>> _loggerMock = new();

    private static BackfillContext CreateContext(string assetType = "stock") => new()
    {
        TickerId = 1,
        Symbol = "AAPL",
        AssetType = assetType,
        DaysToBackfill = 30
    };

    private static Mock<IComputeStep> CreateComputeStepMock(
        string name,
        int priority = 100,
        Func<string, bool>? appliesTo = null,
        Func<BackfillContext, CancellationToken, Task<ComputeStepResult>>? backfill = null)
    {
        var mock = new Mock<IComputeStep>();
        mock.Setup(s => s.StepName).Returns(name);
        mock.Setup(s => s.Priority).Returns(priority);
        mock.Setup(s => s.DependsOn).Returns(Array.Empty<string>());
        mock.Setup(s => s.WritesToTables).Returns(Array.Empty<string>());
        mock.Setup(s => s.ReadsFromTables).Returns(Array.Empty<string>());
        mock.Setup(s => s.AppliesTo(It.IsAny<string>()))
            .Returns<string>(type => appliesTo?.Invoke(type) ?? true);
        mock.Setup(s => s.BackfillAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()))
            .Returns<BackfillContext, CancellationToken>((ctx, ct) =>
                backfill?.Invoke(ctx, ct) ?? Task.FromResult(new ComputeStepResult(5, 0)));
        return mock;
    }

    [Fact]
    public async Task ComputeStepsFromRegistry_IncludedInBackfill()
    {
        var computeStep = CreateComputeStepMock("NewIndicator", 150);
        var registry = new ComputeStepRegistry(new[] { computeStep.Object });

        var executor = new BackfillPipelineExecutor(
            Enumerable.Empty<IBackfillStep>(),
            registry,
            _loggerMock.Object);

        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.Single(result.StepOutcomes);
        Assert.Equal("NewIndicator", result.StepOutcomes[0].StepName);
        Assert.True(result.StepOutcomes[0].Success);
        computeStep.Verify(s => s.BackfillAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task LegacyAndComputeSteps_RunTogether()
    {
        var callOrder = new List<string>();

        var legacyStep = new Mock<IBackfillStep>();
        legacyStep.Setup(s => s.Name).Returns("LegacyCandlestick");
        legacyStep.Setup(s => s.Order).Returns(100);
        legacyStep.Setup(s => s.AppliesTo(It.IsAny<string>())).Returns(true);
        legacyStep.Setup(s => s.ExecuteAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()))
            .Returns<BackfillContext, CancellationToken>((_, _) =>
            {
                callOrder.Add("LegacyCandlestick");
                return Task.FromResult(new StepResult(true));
            });

        var computeStep = CreateComputeStepMock("NewIndicator", 200, backfill: (ctx, ct) =>
        {
            callOrder.Add("NewIndicator");
            return Task.FromResult(new ComputeStepResult(5, 0));
        });

        var registry = new ComputeStepRegistry(new[] { computeStep.Object });

        var executor = new BackfillPipelineExecutor(
            new[] { legacyStep.Object },
            registry,
            _loggerMock.Object);

        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.Equal(2, result.StepOutcomes.Count);
        Assert.Equal(new[] { "LegacyCandlestick", "NewIndicator" }, callOrder);
    }

    [Fact]
    public async Task DuplicateNamedSteps_LegacyTakesPrecedence()
    {
        var legacyStep = new Mock<IBackfillStep>();
        legacyStep.Setup(s => s.Name).Returns("CandlestickAnalysis");
        legacyStep.Setup(s => s.Order).Returns(100);
        legacyStep.Setup(s => s.AppliesTo(It.IsAny<string>())).Returns(true);
        legacyStep.Setup(s => s.ExecuteAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new StepResult(true));

        var computeStep = CreateComputeStepMock("CandlestickAnalysis", 100);
        var registry = new ComputeStepRegistry(new[] { computeStep.Object });

        var executor = new BackfillPipelineExecutor(
            new[] { legacyStep.Object },
            registry,
            _loggerMock.Object);

        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.Single(result.StepOutcomes);
        Assert.Equal("CandlestickAnalysis", result.StepOutcomes[0].StepName);
        legacyStep.Verify(s => s.ExecuteAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Once);
        computeStep.Verify(s => s.BackfillAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ComputeStepAssetFiltering_WorksThroughAdapter()
    {
        var stockOnly = CreateComputeStepMock("StockIndicator", appliesTo: t => t == "stock");
        var cryptoOnly = CreateComputeStepMock("CryptoIndicator", appliesTo: t => t == "crypto");

        var registry = new ComputeStepRegistry(new[] { stockOnly.Object, cryptoOnly.Object });

        var executor = new BackfillPipelineExecutor(
            Enumerable.Empty<IBackfillStep>(),
            registry,
            _loggerMock.Object);

        var cryptoResult = await executor.ExecuteAsync(CreateContext("crypto"), CancellationToken.None);

        Assert.Single(cryptoResult.StepOutcomes);
        Assert.Equal("CryptoIndicator", cryptoResult.StepOutcomes[0].StepName);
        stockOnly.Verify(s => s.BackfillAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
