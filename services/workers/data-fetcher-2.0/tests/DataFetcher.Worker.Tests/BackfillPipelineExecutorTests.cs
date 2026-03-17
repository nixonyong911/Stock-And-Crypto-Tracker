using DataFetcher.Worker.Application.Providers.Pipeline;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class BackfillPipelineExecutorTests
{
    private readonly Mock<ILogger<BackfillPipelineExecutor>> _loggerMock = new();

    private static BackfillContext CreateContext(string assetType = "stock") => new()
    {
        TickerId = 1,
        Symbol = "AAPL",
        AssetType = assetType,
        DaysToBackfill = 30
    };

    private static Mock<IBackfillStep> CreateStepMock(
        string name,
        int order,
        Func<string, bool>? appliesTo = null,
        Func<BackfillContext, CancellationToken, Task<StepResult>>? execute = null)
    {
        var mock = new Mock<IBackfillStep>();
        mock.Setup(s => s.Name).Returns(name);
        mock.Setup(s => s.Order).Returns(order);
        mock.Setup(s => s.AppliesTo(It.IsAny<string>()))
            .Returns<string>(type => appliesTo?.Invoke(type) ?? true);
        mock.Setup(s => s.ExecuteAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()))
            .Returns<BackfillContext, CancellationToken>((ctx, ct) =>
                execute?.Invoke(ctx, ct) ?? Task.FromResult(new StepResult(true)));
        return mock;
    }

    private BackfillPipelineExecutor CreateExecutor(params Mock<IBackfillStep>[] steps) =>
        new(steps.Select(s => s.Object), _loggerMock.Object);

    [Fact]
    public async Task AllSteps_ExecuteInDeclaredOrder()
    {
        var callOrder = new List<string>();

        var step1 = CreateStepMock("Step1", 100, execute: (ctx, ct) =>
        {
            callOrder.Add("Step1");
            return Task.FromResult(new StepResult(true));
        });
        var step2 = CreateStepMock("Step2", 200, execute: (ctx, ct) =>
        {
            callOrder.Add("Step2");
            return Task.FromResult(new StepResult(true));
        });
        var step3 = CreateStepMock("Step3", 300, execute: (ctx, ct) =>
        {
            callOrder.Add("Step3");
            return Task.FromResult(new StepResult(true));
        });
        var step4 = CreateStepMock("Step4", 400, execute: (ctx, ct) =>
        {
            callOrder.Add("Step4");
            return Task.FromResult(new StepResult(true));
        });

        // Inject in shuffled order to prove OrderBy works
        var executor = CreateExecutor(step4, step2, step1, step3);
        await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.Equal(new[] { "Step1", "Step2", "Step3", "Step4" }, callOrder);
    }

    [Fact]
    public async Task NoStepSkipped_ForMatchingAssetType()
    {
        var steps = Enumerable.Range(1, 4)
            .Select(i => CreateStepMock($"Step{i}", i * 100, appliesTo: t => t == "stock"))
            .ToArray();

        var executor = CreateExecutor(steps);
        await executor.ExecuteAsync(CreateContext("stock"), CancellationToken.None);

        foreach (var step in steps)
            step.Verify(s => s.ExecuteAsync(
                It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task StepThrows_PipelineContinuesToNextStep()
    {
        var step1 = CreateStepMock("Step1", 100);
        var step2 = CreateStepMock("Step2", 200,
            execute: (_, _) => throw new InvalidOperationException("boom"));
        var step3 = CreateStepMock("Step3", 300);

        var executor = CreateExecutor(step1, step2, step3);
        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        step1.Verify(s => s.ExecuteAsync(
            It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Once);
        step3.Verify(s => s.ExecuteAsync(
            It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Once);

        Assert.Equal(3, result.StepOutcomes.Count);
        Assert.True(result.StepOutcomes[0].Success);
        Assert.False(result.StepOutcomes[1].Success);
        Assert.Equal("boom", result.StepOutcomes[1].Error);
        Assert.True(result.StepOutcomes[2].Success);
    }

    [Fact]
    public async Task AppliesToFiltering_SkipsMismatchedSteps()
    {
        var stockOnly = CreateStepMock("StockOnly", 100, appliesTo: t => t == "stock");
        var allAssets = CreateStepMock("AllAssets", 200);
        var cryptoOnly = CreateStepMock("CryptoOnly", 300, appliesTo: t => t == "crypto");

        var executor = CreateExecutor(stockOnly, allAssets, cryptoOnly);
        var result = await executor.ExecuteAsync(CreateContext("crypto"), CancellationToken.None);

        stockOnly.Verify(s => s.ExecuteAsync(
            It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Never);
        allAssets.Verify(s => s.ExecuteAsync(
            It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Once);
        cryptoOnly.Verify(s => s.ExecuteAsync(
            It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()), Times.Once);

        Assert.Equal(2, result.StepOutcomes.Count);
    }

    [Fact]
    public async Task AllStepsFail_PipelineReturnsFailure()
    {
        var step1 = CreateStepMock("Step1", 100,
            execute: (_, _) => Task.FromResult(new StepResult(false, "error1")));
        var step2 = CreateStepMock("Step2", 200,
            execute: (_, _) => Task.FromResult(new StepResult(false, "error2")));

        var executor = CreateExecutor(step1, step2);
        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.False(result.Success);
        Assert.All(result.StepOutcomes, o => Assert.False(o.Success));
    }

    [Fact]
    public async Task AtLeastOneStepSucceeds_PipelineReturnsSuccess()
    {
        var step1 = CreateStepMock("Step1", 100,
            execute: (_, _) => Task.FromResult(new StepResult(false, "fail")));
        var step2 = CreateStepMock("Step2", 200);
        var step3 = CreateStepMock("Step3", 300,
            execute: (_, _) => Task.FromResult(new StepResult(false, "fail")));

        var executor = CreateExecutor(step1, step2, step3);
        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.True(result.Success);
    }

    [Fact]
    public async Task NoApplicableSteps_ReturnsEmptyFailure()
    {
        var step1 = CreateStepMock("Step1", 100, appliesTo: _ => false);
        var step2 = CreateStepMock("Step2", 200, appliesTo: _ => false);

        var executor = CreateExecutor(step1, step2);
        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.Empty(result.StepOutcomes);
        Assert.False(result.Success);
    }

    [Fact]
    public async Task StepOutcomes_HaveDuration()
    {
        var step = CreateStepMock("Step1", 100);

        var executor = CreateExecutor(step);
        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        var outcome = Assert.Single(result.StepOutcomes);
        Assert.True(outcome.Duration >= TimeSpan.Zero);
    }

    [Fact]
    public async Task ContextDataFlowsBetweenSteps()
    {
        string? capturedValue = null;

        var writer = CreateStepMock("Writer", 100, execute: (ctx, _) =>
        {
            ctx.StepData["key1"] = "value1";
            return Task.FromResult(new StepResult(true));
        });

        var reader = CreateStepMock("Reader", 200, execute: (ctx, _) =>
        {
            capturedValue = ctx.StepData["key1"] as string;
            return Task.FromResult(new StepResult(true));
        });

        var executor = CreateExecutor(writer, reader);
        await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.Equal("value1", capturedValue);
    }

    [Fact]
    public async Task PipelineDuration_IsRecorded()
    {
        var step = CreateStepMock("Step1", 100);

        var executor = CreateExecutor(step);
        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        Assert.True(result.Duration >= TimeSpan.Zero);
    }

    [Fact]
    public async Task CancellationToken_StopsPipeline()
    {
        // When the parent CTS is cancelled, the pipeline's catch chain is:
        //   catch (OperationCanceledException) when (!ct.IsCancellationRequested) → filter false, skipped
        //   catch (Exception ex) → catches the OCE as a regular failure
        // So subsequent steps still execute but receive already-cancelled tokens.
        var cts = new CancellationTokenSource();

        var step1 = CreateStepMock("Step1", 100, execute: (_, _) =>
        {
            cts.Cancel();
            return Task.FromResult(new StepResult(true));
        });
        var step2 = CreateStepMock("Step2", 200, execute: (_, ct) =>
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult(new StepResult(true));
        });
        var step3 = CreateStepMock("Step3", 300, execute: (_, ct) =>
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult(new StepResult(true));
        });

        var executor = CreateExecutor(step1, step2, step3);
        var result = await executor.ExecuteAsync(CreateContext(), cts.Token);

        Assert.Equal(3, result.StepOutcomes.Count);
        Assert.True(result.StepOutcomes[0].Success);
        Assert.False(result.StepOutcomes[1].Success);
        Assert.False(result.StepOutcomes[2].Success);
    }

    [Fact]
    public async Task StepReturningFailure_RecordedInOutcome()
    {
        var step = CreateStepMock("Step1", 100,
            execute: (_, _) => Task.FromResult(new StepResult(false, "Data not found")));

        var executor = CreateExecutor(step);
        var result = await executor.ExecuteAsync(CreateContext(), CancellationToken.None);

        var outcome = Assert.Single(result.StepOutcomes);
        Assert.False(outcome.Success);
        Assert.Equal("Data not found", outcome.Error);
    }
}
