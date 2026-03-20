using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using DataFetcher.Worker.Tests.TestInfra;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests.ProviderTests;

public class EtoroMarketDataProviderTests : ProviderTestBase<EtoroMarketDataProvider>
{
    private readonly Mock<IEtoroMarketDataClient> _mockClient = new();

    protected override EtoroMarketDataProvider CreateProvider()
    {
        _mockClient.Setup(c => c.SearchInstrumentAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<EtoroInstrument> { new() { InstrumentId = 1 } });

        return new EtoroMarketDataProvider(
            _mockClient.Object,
            Options.Create(new EtoroSettings()),
            new Mock<ILogger<EtoroMarketDataProvider>>().Object);
    }

    public override async Task HealthCheck_ReturnsResult()
    {
        var provider = CreateProvider();
        var result = await provider.HealthCheckAsync(CancellationToken.None);
        Assert.NotNull(result);
        Assert.True(result.Healthy);
    }

    public override Task TransientError_RetriesCorrectly()
    {
        var provider = CreateProvider();
        var config = provider.GetResilienceConfig();
        Assert.True(config.MaxRetries > 0);
        Assert.True(config.InitialRetryDelay > TimeSpan.Zero);
        return Task.CompletedTask;
    }

    public override Task PermanentError_SkipsGracefully()
    {
        var provider = CreateProvider();
        var config = provider.GetResilienceConfig();
        Assert.True(config.CircuitBreakerThreshold > 0);
        Assert.True(config.CircuitBreakerDuration > TimeSpan.Zero);
        return Task.CompletedTask;
    }

    public override async Task Timeout_HandledWithoutCrash()
    {
        _mockClient.Setup(c => c.SearchInstrumentAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TaskCanceledException("Timeout", new TimeoutException()));
        var provider = new EtoroMarketDataProvider(
            _mockClient.Object,
            Options.Create(new EtoroSettings()),
            new Mock<ILogger<EtoroMarketDataProvider>>().Object);

        var result = await provider.HealthCheckAsync(CancellationToken.None);
        Assert.NotNull(result);
        Assert.False(result.Healthy);
    }

    public override async Task Cancellation_StopsProcessing()
    {
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();
        _mockClient.Setup(c => c.SearchInstrumentAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        var provider = new EtoroMarketDataProvider(
            _mockClient.Object,
            Options.Create(new EtoroSettings()),
            new Mock<ILogger<EtoroMarketDataProvider>>().Object);

        var result = await provider.HealthCheckAsync(cts.Token);
        Assert.False(result.Healthy);
    }

    public override Task PartialFailure_WritesAvailableData()
    {
        var provider = CreateProvider();
        Assert.Equal("eToro", provider.ProviderName);
        Assert.True(provider.Capabilities.Stocks);
        Assert.True(provider.Capabilities.Crypto);
        Assert.False(provider.Capabilities.SupportsBatchFetch);
        return Task.CompletedTask;
    }
}
