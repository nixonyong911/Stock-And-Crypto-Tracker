using System.Net;
using System.Text.Json;
using DataFetcher.Worker.Configuration;
using DataFetcher.Worker.Infrastructure.Common;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class GatewayAlertNotifierTests
{
    private const string TestBaseUrl = "https://gateway.test";
    private const string TestServiceKey = "test-service-key-123";

    private readonly MockHttpMessageHandler _handler;
    private readonly GatewayAlertNotifier _sut;

    public GatewayAlertNotifierTests()
    {
        _handler = new MockHttpMessageHandler();
        var httpClient = new HttpClient(_handler);
        var settings = Options.Create(new GatewaySettings
        {
            BaseUrl = TestBaseUrl,
            InternalServiceKey = TestServiceKey
        });

        _sut = new GatewayAlertNotifier(httpClient, settings, NullLogger<GatewayAlertNotifier>.Instance);
    }

    [Fact]
    public async Task NotifyAsync_Stock_SendsPostToCorrectUrlWithBody()
    {
        _handler.ResponseToReturn = new HttpResponseMessage(HttpStatusCode.OK);

        await _sut.NotifyAsync("stock");

        Assert.Equal(HttpMethod.Post, _handler.CapturedMethod);
        Assert.Equal($"{TestBaseUrl}/internal/check-recommendations", _handler.CapturedUri!.ToString());

        Assert.NotNull(_handler.CapturedBody);
        var body = JsonDocument.Parse(_handler.CapturedBody!).RootElement;
        Assert.Equal("stock", body.GetProperty("assetType").GetString());
    }

    [Fact]
    public async Task NotifyAsync_Crypto_SendsPostWithCryptoAssetType()
    {
        _handler.ResponseToReturn = new HttpResponseMessage(HttpStatusCode.OK);

        await _sut.NotifyAsync("crypto");

        Assert.NotNull(_handler.CapturedBody);
        var body = JsonDocument.Parse(_handler.CapturedBody!).RootElement;
        Assert.Equal("crypto", body.GetProperty("assetType").GetString());
    }

    [Fact]
    public async Task NotifyAsync_IncludesServiceKeyHeader()
    {
        _handler.ResponseToReturn = new HttpResponseMessage(HttpStatusCode.OK);

        await _sut.NotifyAsync("stock");

        Assert.NotNull(_handler.CapturedRequest);
        Assert.True(_handler.CapturedRequest!.Headers.Contains("X-Service-Key"));
        var values = _handler.CapturedRequest.Headers.GetValues("X-Service-Key").ToList();
        Assert.Single(values);
        Assert.Equal(TestServiceKey, values[0]);
    }

    [Fact]
    public async Task NotifyAsync_Http500_DoesNotThrow()
    {
        _handler.ResponseToReturn = new HttpResponseMessage(HttpStatusCode.InternalServerError);

        var exception = await Record.ExceptionAsync(() => _sut.NotifyAsync("stock"));

        Assert.Null(exception);
    }

    [Fact]
    public async Task NotifyAsync_NetworkFailure_DoesNotThrow()
    {
        _handler.ExceptionToThrow = new HttpRequestException("Connection refused");

        var exception = await Record.ExceptionAsync(() => _sut.NotifyAsync("stock"));

        Assert.Null(exception);
    }

    [Fact]
    public async Task NotifyAsync_EmptyBaseUrl_SkipsRequest()
    {
        var handler = new MockHttpMessageHandler { ResponseToReturn = new HttpResponseMessage(HttpStatusCode.OK) };
        var httpClient = new HttpClient(handler);
        var settings = Options.Create(new GatewaySettings { BaseUrl = "", InternalServiceKey = TestServiceKey });
        var sut = new GatewayAlertNotifier(httpClient, settings, NullLogger<GatewayAlertNotifier>.Instance);

        await sut.NotifyAsync("stock");

        Assert.Null(handler.CapturedRequest);
    }

    private class MockHttpMessageHandler : HttpMessageHandler
    {
        public HttpMethod? CapturedMethod { get; private set; }
        public Uri? CapturedUri { get; private set; }
        public HttpRequestMessage? CapturedRequest { get; private set; }
        public string? CapturedBody { get; private set; }
        public HttpResponseMessage ResponseToReturn { get; set; } = new(HttpStatusCode.OK);
        public Exception? ExceptionToThrow { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            CapturedMethod = request.Method;
            CapturedUri = request.RequestUri;
            CapturedRequest = request;

            if (request.Content != null)
                CapturedBody = await request.Content.ReadAsStringAsync(cancellationToken);

            if (ExceptionToThrow is not null)
                throw ExceptionToThrow;

            return ResponseToReturn;
        }
    }
}
