using DataFetcher.Worker.Application.Providers.Pipeline;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class ComputeStepRegistryTests
{
    private static Mock<IComputeStep> CreateStepMock(
        string name, int priority = 100, string[]? dependsOn = null, Func<string, bool>? appliesTo = null)
    {
        var mock = new Mock<IComputeStep>();
        mock.Setup(s => s.StepName).Returns(name);
        mock.Setup(s => s.Priority).Returns(priority);
        mock.Setup(s => s.DependsOn).Returns(dependsOn ?? []);
        mock.Setup(s => s.WritesToTables).Returns([]);
        mock.Setup(s => s.ReadsFromTables).Returns([]);
        mock.Setup(s => s.AppliesTo(It.IsAny<string>()))
            .Returns<string>(type => appliesTo?.Invoke(type) ?? true);
        return mock;
    }

    [Fact]
    public void GetAll_ReturnsAllRegisteredSteps()
    {
        var steps = new[]
        {
            CreateStepMock("A").Object,
            CreateStepMock("B").Object,
            CreateStepMock("C").Object,
        };

        var registry = new ComputeStepRegistry(steps);
        Assert.Equal(3, registry.GetAll().Count);
    }

    [Fact]
    public void GetForAssetType_FiltersCorrectly()
    {
        var stockOnly = CreateStepMock("StockOnly", appliesTo: t => t == "stock");
        var cryptoOnly = CreateStepMock("CryptoOnly", appliesTo: t => t == "crypto");
        var both = CreateStepMock("Both");

        var registry = new ComputeStepRegistry(new[] { stockOnly.Object, cryptoOnly.Object, both.Object });

        var stockSteps = registry.GetForAssetType("stock");
        Assert.Equal(2, stockSteps.Count);
        Assert.Contains(stockSteps, s => s.StepName == "StockOnly");
        Assert.Contains(stockSteps, s => s.StepName == "Both");
        Assert.DoesNotContain(stockSteps, s => s.StepName == "CryptoOnly");

        var cryptoSteps = registry.GetForAssetType("crypto");
        Assert.Equal(2, cryptoSteps.Count);
        Assert.Contains(cryptoSteps, s => s.StepName == "CryptoOnly");
        Assert.Contains(cryptoSteps, s => s.StepName == "Both");
    }

    [Fact]
    public void GetExecutionPhases_ReturnsTopologicallySortedPhases()
    {
        var basic = CreateStepMock("BasicIndicators", 10);
        var candlestick = CreateStepMock("CandlestickAnalysis", 10);
        var advanced = CreateStepMock("AdvancedIndicators", 50, ["BasicIndicators"]);
        var priceTarget = CreateStepMock("PriceTargets", 100, ["CandlestickAnalysis", "BasicIndicators"]);

        var registry = new ComputeStepRegistry(new[]
            { priceTarget.Object, advanced.Object, basic.Object, candlestick.Object });

        var phases = registry.GetExecutionPhases("stock");

        // Phase 0: Candlestick + Basic (no deps)
        // Phase 1: Advanced + PriceTargets (both depend only on phase 0 items)
        Assert.Equal(2, phases.Count);
        Assert.Equal(2, phases[0].Count);
        Assert.Equal(2, phases[1].Count);
    }

    [Fact]
    public void GetExecutionPhases_ExcludesNonApplicableSteps()
    {
        var stockStep = CreateStepMock("StockOnly", appliesTo: t => t == "stock");
        var cryptoStep = CreateStepMock("CryptoOnly", appliesTo: t => t == "crypto");

        var registry = new ComputeStepRegistry(new[] { stockStep.Object, cryptoStep.Object });

        var stockPhases = registry.GetExecutionPhases("stock");
        Assert.Single(stockPhases);
        Assert.Equal("StockOnly", stockPhases[0][0].StepName);
    }

    [Fact]
    public void EmptyRegistry_ReturnsEmptyResults()
    {
        var registry = new ComputeStepRegistry(Enumerable.Empty<IComputeStep>());

        Assert.Empty(registry.GetAll());
        Assert.Empty(registry.GetForAssetType("stock"));
        Assert.Empty(registry.GetExecutionPhases("stock"));
    }

    [Fact]
    public void NewStepAddedToDI_AutomaticallyDiscovered()
    {
        var existing = CreateStepMock("Existing").Object;
        var newStep = CreateStepMock("NewIndicator", 150, ["Existing"]).Object;

        var registry = new ComputeStepRegistry(new[] { existing, newStep });

        var phases = registry.GetExecutionPhases("stock");
        Assert.Equal(2, phases.Count);
        Assert.Equal("Existing", phases[0][0].StepName);
        Assert.Equal("NewIndicator", phases[1][0].StepName);
    }
}
