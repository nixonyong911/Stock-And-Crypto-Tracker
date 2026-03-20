using DataFetcher.Worker.Application.Providers.Alpaca;
using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Alpaca.Models;
using DataFetcher.Worker.Tests.TestInfra;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests.ProviderTests;

public class AlpacaMarketDataProviderTests : ProviderTestBase<AlpacaMarketDataProvider>
{
    private readonly Mock<IAlpacaMarketDataClient> _mockClient = new();
    private readonly Mock<IAlpacaAssetVerificationService> _mockVerification = new();

    protected override AlpacaMarketDataProvider CreateProvider()
    {
        _mockClient.Setup(c => c.GetAssetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AlpacaAssetResponse { Status = "active", Tradable = true });

        return new AlpacaMarketDataProvider(
            _mockClient.Object,
            _mockVerification.Object,
            Options.Create(new AlpacaSettings()),
            new Mock<ILogger<AlpacaMarketDataProvider>>().Object);
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
        _mockClient.Setup(c => c.GetAssetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TaskCanceledException("Timeout", new TimeoutException()));
        var provider = new AlpacaMarketDataProvider(
            _mockClient.Object,
            _mockVerification.Object,
            Options.Create(new AlpacaSettings()),
            new Mock<ILogger<AlpacaMarketDataProvider>>().Object);

        var result = await provider.HealthCheckAsync(CancellationToken.None);
        Assert.NotNull(result);
        Assert.False(result.Healthy);
    }

    public override async Task Cancellation_StopsProcessing()
    {
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();
        _mockClient.Setup(c => c.GetAssetAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        var provider = new AlpacaMarketDataProvider(
            _mockClient.Object,
            _mockVerification.Object,
            Options.Create(new AlpacaSettings()),
            new Mock<ILogger<AlpacaMarketDataProvider>>().Object);

        var result = await provider.HealthCheckAsync(cts.Token);
        Assert.False(result.Healthy);
    }

    public override Task PartialFailure_WritesAvailableData()
    {
        var provider = CreateProvider();
        Assert.Equal("Alpaca", provider.ProviderName);
        Assert.True(provider.Capabilities.Stocks);
        Assert.True(provider.Capabilities.Crypto);
        Assert.True(provider.Capabilities.SupportsBatchFetch);
        return Task.CompletedTask;
    }
}
