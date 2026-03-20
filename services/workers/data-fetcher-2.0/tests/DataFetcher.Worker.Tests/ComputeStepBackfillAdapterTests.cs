using DataFetcher.Worker.Application.Providers.Pipeline;
using DataFetcher.Worker.Application.Providers.Pipeline.Steps;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class ComputeStepBackfillAdapterTests
{
    [Fact]
    public void Properties_DelegateToInnerStep()
    {
        var inner = new Mock<IComputeStep>();
        inner.Setup(s => s.StepName).Returns("TestStep");
        inner.Setup(s => s.Priority).Returns(42);
        inner.Setup(s => s.AppliesTo("stock")).Returns(true);
        inner.Setup(s => s.AppliesTo("crypto")).Returns(false);

        var adapter = new ComputeStepBackfillAdapter(inner.Object);

        Assert.Equal("TestStep", adapter.Name);
        Assert.Equal(42, adapter.Order);
        Assert.True(adapter.AppliesTo("stock"));
        Assert.False(adapter.AppliesTo("crypto"));
    }

    [Fact]
    public async Task ExecuteAsync_DelegatesToBackfillAsync()
    {
        var inner = new Mock<IComputeStep>();
        inner.Setup(s => s.BackfillAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ComputeStepResult(10, 2));

        var adapter = new ComputeStepBackfillAdapter(inner.Object);
        var ctx = new BackfillContext
        {
            TickerId = 1,
            Symbol = "AAPL",
            AssetType = "stock",
            DaysToBackfill = 30
        };

        var result = await adapter.ExecuteAsync(ctx, CancellationToken.None);

        Assert.True(result.Success);
        inner.Verify(s => s.BackfillAsync(ctx, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_PropagatesErrors()
    {
        var inner = new Mock<IComputeStep>();
        inner.Setup(s => s.BackfillAsync(It.IsAny<BackfillContext>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ComputeStepResult(0, 0, "Something failed"));

        var adapter = new ComputeStepBackfillAdapter(inner.Object);
        var ctx = new BackfillContext
        {
            TickerId = 1,
            Symbol = "BTC",
            AssetType = "crypto",
            DaysToBackfill = 180
        };

        var result = await adapter.ExecuteAsync(ctx, CancellationToken.None);

        Assert.False(result.Success);
        Assert.Equal("Something failed", result.Error);
    }
}
