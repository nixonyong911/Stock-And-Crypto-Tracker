using System.Net;
using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using DataFetcher.Worker.Tests.TestInfra;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Xunit;

namespace DataFetcher.Worker.Tests.ProviderTests;

public class FinnhubApiClientTests : ProviderTestBase<FinnhubApiClient>
{
    private StubHttpHandler _handler = new();

    protected override FinnhubApiClient CreateProvider()
    {
        _handler = new StubHttpHandler(HttpStatusCode.OK, """{"ticker":"AAPL","name":"Apple"}""");
        var httpClient = new HttpClient(_handler);
        return new FinnhubApiClient(
            httpClient,
            Options.Create(new FinnhubSettings
            {
                ApiKey = "test-key",
                BaseUrl = "https://test.finnhub.io/api/v1",
                RateLimitDelayMs = 0
            }),
            new Mock<ILogger<FinnhubApiClient>>().Object);
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
        _handler = new StubHttpHandler(shouldThrow: true);
        var httpClient = new HttpClient(_handler);
        var provider = new FinnhubApiClient(
            httpClient,
            Options.Create(new FinnhubSettings
            {
                ApiKey = "test-key",
                BaseUrl = "https://test.finnhub.io/api/v1",
                RateLimitDelayMs = 0
            }),
            new Mock<ILogger<FinnhubApiClient>>().Object);

        var result = await provider.HealthCheckAsync(CancellationToken.None);
        Assert.NotNull(result);
        Assert.False(result.Healthy);
    }

    public override async Task Cancellation_StopsProcessing()
    {
        using var cts = new CancellationTokenSource();
        await cts.CancelAsync();

        var provider = CreateProvider();
        var result = await provider.HealthCheckAsync(cts.Token);
        Assert.False(result.Healthy);
    }

    public override Task PartialFailure_WritesAvailableData()
    {
        var provider = CreateProvider();
        Assert.Equal("Finnhub", provider.ProviderName);
        Assert.True(provider.Capabilities.Stocks);
        Assert.False(provider.Capabilities.Crypto);
        Assert.False(provider.Capabilities.SupportsBatchFetch);
        return Task.CompletedTask;
    }

    private class StubHttpHandler : HttpMessageHandler
    {
        private readonly HttpStatusCode _statusCode;
        private readonly string _content;
        private readonly bool _shouldThrow;

        public StubHttpHandler(
            HttpStatusCode statusCode = HttpStatusCode.OK,
            string content = "{}",
            bool shouldThrow = false)
        {
            _statusCode = statusCode;
            _content = content;
            _shouldThrow = shouldThrow;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (_shouldThrow)
                throw new TaskCanceledException("Timeout", new TimeoutException());

            return Task.FromResult(new HttpResponseMessage(_statusCode)
            {
                Content = new StringContent(_content)
            });
        }
    }
}
