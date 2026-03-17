using DataFetcher.Worker.Application.Providers.Finnhub;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class FinnhubResiliencePolicyTests
{
    [Fact]
    public void ShouldRetry_NetworkError_True()
    {
        Assert.True(FinnhubResiliencePolicies.IsTransientError(new HttpRequestException("Connection refused")));
    }

    [Fact]
    public void ShouldRetry_Timeout_True()
    {
        var ex = new TaskCanceledException("timeout", new TimeoutException());
        Assert.True(FinnhubResiliencePolicies.IsTransientError(ex));
    }

    [Fact]
    public void ShouldNotRetry_UserCancellation_False()
    {
        var cts = new CancellationTokenSource();
        cts.Cancel();
        Assert.False(FinnhubResiliencePolicies.IsTransientError(new OperationCanceledException(cts.Token)));
    }

    [Fact]
    public void ShouldNotRetry_Http403_False()
    {
        Assert.False(FinnhubResiliencePolicies.IsTransientError(
            new HttpRequestException("Forbidden", null, System.Net.HttpStatusCode.Forbidden)));
    }

    [Fact]
    public void ShouldNotRetry_Http401_False()
    {
        Assert.False(FinnhubResiliencePolicies.IsTransientError(
            new HttpRequestException("Unauthorized", null, System.Net.HttpStatusCode.Unauthorized)));
    }

    [Theory]
    [InlineData(System.Net.HttpStatusCode.TooManyRequests)]
    [InlineData(System.Net.HttpStatusCode.InternalServerError)]
    [InlineData(System.Net.HttpStatusCode.BadGateway)]
    [InlineData(System.Net.HttpStatusCode.ServiceUnavailable)]
    [InlineData(System.Net.HttpStatusCode.GatewayTimeout)]
    public void ShouldRetry_ServerErrors_True(System.Net.HttpStatusCode status)
    {
        Assert.True(FinnhubResiliencePolicies.IsTransientError(
            new HttpRequestException("error", null, status)));
    }

    [Fact]
    public void IsPermanentError_403_True()
    {
        Assert.True(FinnhubResiliencePolicies.IsPermanentError(
            new HttpRequestException("Forbidden", null, System.Net.HttpStatusCode.Forbidden)));
    }

    [Fact]
    public void IsPermanentError_404_True()
    {
        Assert.True(FinnhubResiliencePolicies.IsPermanentError(
            new HttpRequestException("Not Found", null, System.Net.HttpStatusCode.NotFound)));
    }

    [Fact]
    public void IsPermanentError_500_False()
    {
        Assert.False(FinnhubResiliencePolicies.IsPermanentError(
            new HttpRequestException("error", null, System.Net.HttpStatusCode.InternalServerError)));
    }

    [Fact]
    public void RetryDelays_ExponentialBackoff()
    {
        var delays = FinnhubResiliencePolicies.GetRetryDelays(3);
        Assert.Equal(3, delays.Length);
        Assert.Equal(TimeSpan.FromSeconds(2), delays[0]);
        Assert.Equal(TimeSpan.FromSeconds(4), delays[1]);
        Assert.Equal(TimeSpan.FromSeconds(8), delays[2]);
    }

    [Fact]
    public async Task ExecuteWithRetry_SucceedsFirstAttempt_ReturnsResult()
    {
        var result = await FinnhubResiliencePolicies.ExecuteWithRetryAsync(
            () => Task.FromResult<string?>("success"),
            3, NullLogger.Instance, "test", CancellationToken.None);
        Assert.Equal("success", result);
    }

    [Fact]
    public async Task ExecuteWithRetry_PermanentError_ReturnsNull()
    {
        var callCount = 0;
        var result = await FinnhubResiliencePolicies.ExecuteWithRetryAsync<string>(
            () => { callCount++; throw new HttpRequestException("Forbidden", null, System.Net.HttpStatusCode.Forbidden); },
            3, NullLogger.Instance, "test", CancellationToken.None);
        Assert.Null(result);
        Assert.Equal(1, callCount);
    }

    [Fact]
    public async Task ExecuteWithRetry_TransientThenSuccess_Retries()
    {
        var callCount = 0;
        var zeroDelays = new[] { TimeSpan.Zero, TimeSpan.Zero, TimeSpan.Zero };
        var result = await FinnhubResiliencePolicies.ExecuteWithRetryAsync(
            () =>
            {
                callCount++;
                if (callCount < 3) throw new HttpRequestException("error", null, System.Net.HttpStatusCode.InternalServerError);
                return Task.FromResult<string?>("success");
            },
            3, NullLogger.Instance, "test", CancellationToken.None, zeroDelays);
        Assert.Equal("success", result);
        Assert.Equal(3, callCount);
    }
}
