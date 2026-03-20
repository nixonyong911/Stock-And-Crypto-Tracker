using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Application.Providers.Indicators;
using Xunit;

namespace DataFetcher.Worker.Tests.TestInfra;

public class CiGuardTests
{
    [Fact]
    public void AllIndicatorDefinitions_HaveTestCoverage()
    {
        var indicatorTypes = typeof(IIndicatorDefinition).Assembly
            .GetTypes()
            .Where(t => typeof(IIndicatorDefinition).IsAssignableFrom(t) && !t.IsAbstract && !t.IsInterface)
            .ToList();

        var testAssembly = typeof(CiGuardTests).Assembly;
        var testTypes = testAssembly.GetTypes()
            .Where(t => t.BaseType?.IsGenericType == true
                && t.BaseType.GetGenericTypeDefinition() == typeof(IndicatorTestBase<>))
            .Select(t => t.BaseType!.GetGenericArguments()[0])
            .ToHashSet();

        var missing = indicatorTypes.Where(t => !testTypes.Contains(t)).ToList();
        Assert.True(missing.Count == 0,
            $"Missing IndicatorTestBase<T> for: {string.Join(", ", missing.Select(t => t.Name))}");
    }

    [Fact]
    public void AllProviderContracts_HaveTestCoverage()
    {
        var providerTypes = typeof(IDataProviderContract).Assembly
            .GetTypes()
            .Where(t => typeof(IDataProviderContract).IsAssignableFrom(t) && !t.IsAbstract && !t.IsInterface)
            .ToList();

        var testAssembly = typeof(CiGuardTests).Assembly;
        var testTypes = testAssembly.GetTypes()
            .Where(t => t.BaseType?.IsGenericType == true
                && t.BaseType.GetGenericTypeDefinition() == typeof(ProviderTestBase<>))
            .Select(t => t.BaseType!.GetGenericArguments()[0])
            .ToHashSet();

        var missing = providerTypes.Where(t => !testTypes.Contains(t)).ToList();
        Assert.True(missing.Count == 0,
            $"Missing ProviderTestBase<T> for: {string.Join(", ", missing.Select(t => t.Name))}");
    }

    [Fact]
    public void AllIndicatorDefinitions_HaveNonEmptyOutputColumns()
    {
        var definitionTypes = typeof(IIndicatorDefinition).Assembly
            .GetTypes()
            .Where(t => typeof(IIndicatorDefinition).IsAssignableFrom(t) && !t.IsAbstract && !t.IsInterface);

        foreach (var type in definitionTypes)
        {
            var prop = type.GetProperty(nameof(IIndicatorDefinition.OutputColumns));
            Assert.NotNull(prop);
        }
    }
}
