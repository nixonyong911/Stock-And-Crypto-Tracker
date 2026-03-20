using DataFetcher.Worker.Application.Providers.Pipeline;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class TopologicalSortHelperTests
{
    private static IComputeStep CreateStep(
        string name, int priority = 100, string[]? dependsOn = null)
    {
        var mock = new Mock<IComputeStep>();
        mock.Setup(s => s.StepName).Returns(name);
        mock.Setup(s => s.Priority).Returns(priority);
        mock.Setup(s => s.DependsOn).Returns(dependsOn ?? []);
        mock.Setup(s => s.AppliesTo(It.IsAny<string>())).Returns(true);
        return mock.Object;
    }

    [Fact]
    public void EmptyList_ReturnsEmptyPhases()
    {
        var result = TopologicalSortHelper.Sort(Array.Empty<IComputeStep>());
        Assert.Empty(result);
    }

    [Fact]
    public void SingleStep_ReturnsOnePhaseWithOneStep()
    {
        var step = CreateStep("A");
        var phases = TopologicalSortHelper.Sort(new[] { step });

        Assert.Single(phases);
        Assert.Single(phases[0]);
        Assert.Equal("A", phases[0][0].StepName);
    }

    [Fact]
    public void IndependentSteps_AllInPhaseZero()
    {
        var a = CreateStep("A", 10);
        var b = CreateStep("B", 20);
        var c = CreateStep("C", 30);

        var phases = TopologicalSortHelper.Sort(new[] { c, a, b });

        Assert.Single(phases);
        Assert.Equal(3, phases[0].Count);
        Assert.Equal(new[] { "A", "B", "C" }, phases[0].Select(s => s.StepName).ToArray());
    }

    [Fact]
    public void LinearDependencyChain_ProducesSequentialPhases()
    {
        var a = CreateStep("A");
        var b = CreateStep("B", dependsOn: ["A"]);
        var c = CreateStep("C", dependsOn: ["B"]);

        var phases = TopologicalSortHelper.Sort(new[] { c, a, b });

        Assert.Equal(3, phases.Count);
        Assert.Equal("A", phases[0][0].StepName);
        Assert.Equal("B", phases[1][0].StepName);
        Assert.Equal("C", phases[2][0].StepName);
    }

    [Fact]
    public void DiamondDependency_ConvergesToSamePhase()
    {
        //   A
        //  / \
        // B   C
        //  \ /
        //   D
        var a = CreateStep("A");
        var b = CreateStep("B", dependsOn: ["A"]);
        var c = CreateStep("C", dependsOn: ["A"]);
        var d = CreateStep("D", dependsOn: ["B", "C"]);

        var phases = TopologicalSortHelper.Sort(new[] { d, b, c, a });

        Assert.Equal(3, phases.Count);
        Assert.Equal("A", phases[0][0].StepName);
        Assert.Equal(2, phases[1].Count);
        Assert.Contains(phases[1], s => s.StepName == "B");
        Assert.Contains(phases[1], s => s.StepName == "C");
        Assert.Equal("D", phases[2][0].StepName);
    }

    [Fact]
    public void PipelineShape_MatchesExpectedPhases()
    {
        var candlestick = CreateStep("CandlestickAnalysis", 10);
        var basic = CreateStep("BasicIndicators", 10);
        var advanced = CreateStep("AdvancedIndicators", 50, ["BasicIndicators"]);
        var priceTarget = CreateStep("PriceTargets", 100, ["CandlestickAnalysis", "BasicIndicators"]);

        var phases = TopologicalSortHelper.Sort(new[] { priceTarget, advanced, basic, candlestick });

        // Phase 0: Candlestick + Basic (no deps, both priority 10)
        // Phase 1: Advanced + PriceTargets (both depend only on phase 0 items, can run concurrently)
        Assert.Equal(2, phases.Count);

        var phase0Names = phases[0].Select(s => s.StepName).OrderBy(n => n).ToArray();
        Assert.Equal(new[] { "BasicIndicators", "CandlestickAnalysis" }, phase0Names);

        var phase1Names = phases[1].Select(s => s.StepName).OrderBy(n => n).ToArray();
        Assert.Equal(new[] { "AdvancedIndicators", "PriceTargets" }, phase1Names);
    }

    [Fact]
    public void CircularDependency_ThrowsInvalidOperationException()
    {
        var a = CreateStep("A", dependsOn: ["B"]);
        var b = CreateStep("B", dependsOn: ["A"]);

        Assert.Throws<InvalidOperationException>(() =>
            TopologicalSortHelper.Sort(new[] { a, b }));
    }

    [Fact]
    public void SelfDependency_ThrowsInvalidOperationException()
    {
        var a = CreateStep("A", dependsOn: ["A"]);

        Assert.Throws<InvalidOperationException>(() =>
            TopologicalSortHelper.Sort(new[] { a }));
    }

    [Fact]
    public void UnknownDependency_IgnoredGracefully()
    {
        var a = CreateStep("A", dependsOn: ["NonExistent"]);

        var phases = TopologicalSortHelper.Sort(new[] { a });
        Assert.Single(phases);
        Assert.Equal("A", phases[0][0].StepName);
    }

    [Fact]
    public void StepsWithinPhase_SortedByPriority()
    {
        var a = CreateStep("A", priority: 300);
        var b = CreateStep("B", priority: 100);
        var c = CreateStep("C", priority: 200);

        var phases = TopologicalSortHelper.Sort(new[] { a, b, c });

        Assert.Single(phases);
        Assert.Equal(new[] { "B", "C", "A" }, phases[0].Select(s => s.StepName).ToArray());
    }
}
