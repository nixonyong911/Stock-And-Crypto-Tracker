using DataFetcher.Worker.Application.Scheduling;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class JobDependencyResolverTests
{
    private readonly JobDependencyResolver _resolver = new();

    [Fact]
    public void NoDependencies_PreservesOriginalOrder()
    {
        var jobs = new IScheduledJob[]
        {
            new FakeJob("Alpha"),
            new FakeJob("Beta"),
            new FakeJob("Gamma"),
        };

        var result = _resolver.GetExecutionOrder(jobs);

        Assert.Equal(new[] { "Alpha", "Beta", "Gamma" }, result.Select(j => j.Name));
    }

    [Fact]
    public void LinearDependencyChain_ReturnsCorrectOrder()
    {
        var jobs = new IScheduledJob[]
        {
            new FakeJob("A", "B"),
            new FakeJob("B", "C"),
            new FakeJob("C"),
        };

        var result = _resolver.GetExecutionOrder(jobs);

        Assert.Equal(new[] { "C", "B", "A" }, result.Select(j => j.Name));
    }

    [Fact]
    public void DiamondDependency_ResolvedCorrectly()
    {
        var jobs = new IScheduledJob[]
        {
            new FakeJob("A"),
            new FakeJob("B", "A"),
            new FakeJob("C", "A"),
            new FakeJob("D", "B", "C"),
        };

        var result = _resolver.GetExecutionOrder(jobs);
        var names = result.Select(j => j.Name).ToList();

        Assert.Equal("A", names[0]);
        Assert.Equal("D", names[3]);
        Assert.Contains("B", names.GetRange(1, 2));
        Assert.Contains("C", names.GetRange(1, 2));
    }

    [Fact]
    public void CircularDependency_ThrowsInvalidOperation()
    {
        var jobs = new IScheduledJob[]
        {
            new FakeJob("A", "B"),
            new FakeJob("B", "A"),
        };

        var ex = Assert.Throws<InvalidOperationException>(() => _resolver.GetExecutionOrder(jobs));
        Assert.Contains("Circular dependency", ex.Message);
        Assert.Contains("A", ex.Message);
        Assert.Contains("B", ex.Message);
    }

    [Fact]
    public void EmptyJobList_ReturnsEmpty()
    {
        var result = _resolver.GetExecutionOrder(Array.Empty<IScheduledJob>());

        Assert.Empty(result);
    }

    [Fact]
    public void SingleJob_NoDependencies_ReturnsSelf()
    {
        var jobs = new IScheduledJob[] { new FakeJob("OnlyJob") };

        var result = _resolver.GetExecutionOrder(jobs);

        Assert.Single(result);
        Assert.Equal("OnlyJob", result[0].Name);
    }

    [Fact]
    public void DependsOnNonexistentJob_ThrowsInvalidOperation()
    {
        var jobs = new IScheduledJob[]
        {
            new FakeJob("Orphan", "NonExistent"),
        };

        var ex = Assert.Throws<InvalidOperationException>(() => _resolver.GetExecutionOrder(jobs));
        Assert.Contains("NonExistent", ex.Message);
        Assert.Contains("not registered", ex.Message);
    }

    [Fact]
    public void MixedDependenciesAndIndependent_CorrectOrder()
    {
        var jobs = new IScheduledJob[]
        {
            new FakeJob("Independent1"),
            new FakeJob("Independent2"),
            new FakeJob("Dependent", "Independent1"),
        };

        var result = _resolver.GetExecutionOrder(jobs);
        var names = result.Select(j => j.Name).ToList();

        var depIdx = names.IndexOf("Dependent");
        var ind1Idx = names.IndexOf("Independent1");
        var ind2Idx = names.IndexOf("Independent2");

        Assert.True(ind1Idx < depIdx, "Independent1 should come before Dependent");
        Assert.True(ind2Idx < depIdx, "Independent2 should come before Dependent");
    }

    [Fact]
    public void AdvancedDependsOnLocal_CorrectOrder()
    {
        var jobs = new IScheduledJob[]
        {
            new FakeJob("AdvancedIndicator", "LocalIndicator"),
            new FakeJob("LocalIndicator"),
        };

        var result = _resolver.GetExecutionOrder(jobs);

        Assert.Equal(new[] { "LocalIndicator", "AdvancedIndicator" }, result.Select(j => j.Name));
    }

    private class FakeJob : IScheduledJob
    {
        public string Name { get; }
        public string[] DependsOn { get; }

        public FakeJob(string name, params string[] dependsOn)
        {
            Name = name;
            DependsOn = dependsOn;
        }

        public Task ExecuteAsync(CancellationToken ct) => Task.CompletedTask;
    }
}
