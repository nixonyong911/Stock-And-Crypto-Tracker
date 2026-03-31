using System.Net;
using System.Text.Json;
using Xunit;
using Moq;
using Moq.Protected;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using DataFetcher.Worker.Configuration.Providers;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using DataFetcher.Worker.Infrastructure.Providers.Etoro;

namespace DataFetcher.Worker.Tests;

public class EtoroSocialClientTests
{
    private readonly Mock<HttpMessageHandler> _httpHandlerMock;
    private readonly EtoroMarketDataClient _client;

    public EtoroSocialClientTests()
    {
        _httpHandlerMock = new Mock<HttpMessageHandler>();
        var httpClient = new HttpClient(_httpHandlerMock.Object);
        var settings = Options.Create(new EtoroSettings
        {
            BaseUrl = "https://test-api.etoro.com",
            ApiKey = "test-api-key",
            UserKey = "test-user-key"
        });

        _client = new EtoroMarketDataClient(
            httpClient, settings, Mock.Of<ILogger<EtoroMarketDataClient>>());
    }

    private void SetupResponse(HttpStatusCode statusCode, string content)
    {
        _httpHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = statusCode,
                Content = new StringContent(content)
            });
    }

    private void SetupResponse(HttpStatusCode statusCode, object content)
    {
        SetupResponse(statusCode, JsonSerializer.Serialize(content));
    }

    private void SetupException(Exception ex)
    {
        _httpHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ThrowsAsync(ex);
    }

    #region SearchInstrumentsSortedAsync

    [Fact]
    public async Task SearchInstrumentsSorted_ReturnsInstruments_OnSuccess()
    {
        var response = new EtoroSocialSearchResponse
        {
            Page = 1, PageSize = 25, TotalItems = 100,
            Items =
            [
                new EtoroSocialInstrument { InstrumentId = 1, DisplayName = "Bitcoin", HoldingPct = 28.5 },
                new EtoroSocialInstrument { InstrumentId = 2, DisplayName = "Ethereum", HoldingPct = 16.2 }
            ]
        };
        SetupResponse(HttpStatusCode.OK, response);

        var result = await _client.SearchInstrumentsSortedAsync("-holdingPct");

        Assert.Equal(2, result.Items.Count);
        Assert.Equal("Bitcoin", result.Items[0].DisplayName);
        Assert.Equal(28.5, result.Items[0].HoldingPct);
    }

    [Fact]
    public async Task SearchInstrumentsSorted_DoesNotEncodeCommasInFields()
    {
        SetupResponse(HttpStatusCode.OK, new EtoroSocialSearchResponse());
        HttpRequestMessage? capturedRequest = null;

        _httpHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent("{\"items\":[]}")
            });

        await _client.SearchInstrumentsSortedAsync("-holdingPct");

        Assert.NotNull(capturedRequest);
        var url = capturedRequest!.RequestUri!.ToString();
        Assert.DoesNotContain("%2C", url);
        Assert.Contains("instrumentId,", url);
    }

    [Fact]
    public async Task SearchInstrumentsSorted_UsesPageNotPageNumber()
    {
        SetupResponse(HttpStatusCode.OK, new EtoroSocialSearchResponse());
        HttpRequestMessage? capturedRequest = null;

        _httpHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent("{\"items\":[]}")
            });

        await _client.SearchInstrumentsSortedAsync("-holdingPct", pageNumber: 3);

        Assert.NotNull(capturedRequest);
        var url = capturedRequest!.RequestUri!.ToString();
        Assert.Contains("page=3", url);
        Assert.DoesNotContain("pageNumber", url);
    }

    [Fact]
    public async Task SearchInstrumentsSorted_ReturnsEmpty_OnApiError()
    {
        SetupResponse(HttpStatusCode.Unauthorized, "{\"errorCode\":\"Unauthorized\"}");

        var result = await _client.SearchInstrumentsSortedAsync("-holdingPct");

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task SearchInstrumentsSorted_ReturnsEmpty_OnNetworkError()
    {
        SetupException(new HttpRequestException("Connection refused"));

        var result = await _client.SearchInstrumentsSortedAsync("-holdingPct");

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task SearchInstrumentsSorted_ReturnsEmpty_OnMalformedJson()
    {
        SetupResponse(HttpStatusCode.OK, "not-json");

        var result = await _client.SearchInstrumentsSortedAsync("-holdingPct");

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task SearchInstrumentsSorted_ReturnsEmpty_OnTimeout()
    {
        _httpHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ThrowsAsync(new TaskCanceledException("Timeout", new TimeoutException()));

        var result = await _client.SearchInstrumentsSortedAsync("-holdingPct");

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task SearchInstrumentsSorted_SetsAuthHeaders()
    {
        SetupResponse(HttpStatusCode.OK, new EtoroSocialSearchResponse());
        HttpRequestMessage? capturedRequest = null;

        _httpHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent("{\"items\":[]}")
            });

        await _client.SearchInstrumentsSortedAsync("-holdingPct");

        Assert.NotNull(capturedRequest);
        Assert.Contains("test-api-key", capturedRequest!.Headers.GetValues("X-Api-Key"));
        Assert.Contains("test-user-key", capturedRequest!.Headers.GetValues("X-User-Key"));
        Assert.True(capturedRequest.Headers.Contains("x-request-id"));
    }

    #endregion

    #region GetCuratedListsAsync

    [Fact]
    public async Task GetCuratedLists_ReturnsLists_OnSuccess()
    {
        var response = new EtoroCuratedListsResponse
        {
            CuratedLists =
            [
                new EtoroCuratedList
                {
                    Name = "AI Revolution",
                    Items = [new EtoroCuratedListItem { InstrumentId = 1 }]
                }
            ]
        };
        SetupResponse(HttpStatusCode.OK, response);

        var result = await _client.GetCuratedListsAsync();

        Assert.NotNull(result);
        Assert.Single(result!.CuratedLists);
        Assert.Equal("AI Revolution", result.CuratedLists[0].Name);
    }

    [Fact]
    public async Task GetCuratedLists_ReturnsNull_OnApiError()
    {
        SetupResponse(HttpStatusCode.InternalServerError, "Server error");

        var result = await _client.GetCuratedListsAsync();

        Assert.Null(result);
    }

    [Fact]
    public async Task GetCuratedLists_ReturnsNull_OnNetworkError()
    {
        SetupException(new HttpRequestException("Connection refused"));

        var result = await _client.GetCuratedListsAsync();

        Assert.Null(result);
    }

    #endregion

    #region SearchTopInvestorsAsync

    [Fact]
    public async Task SearchTopInvestors_ReturnsInvestors_OnSuccess()
    {
        var response = new EtoroInvestorSearchResponse
        {
            TotalItems = 100,
            Items =
            [
                new EtoroInvestor { UserName = "top_trader", Copiers = 50000, Gain = 120.5 }
            ]
        };
        SetupResponse(HttpStatusCode.OK, response);

        var result = await _client.SearchTopInvestorsAsync();

        Assert.Single(result.Items);
        Assert.Equal("top_trader", result.Items[0].UserName);
        Assert.Equal(50000, result.Items[0].Copiers);
    }

    [Fact]
    public async Task SearchTopInvestors_ReturnsEmpty_OnApiError()
    {
        SetupResponse(HttpStatusCode.Unauthorized, "{}");

        var result = await _client.SearchTopInvestorsAsync();

        Assert.Empty(result.Items);
    }

    #endregion

    #region LookupInstrumentByIdAsync

    [Fact]
    public async Task LookupInstrumentById_ReturnsInstrument_OnSuccess()
    {
        var response = new EtoroSocialSearchResponse
        {
            Items = [new EtoroSocialInstrument { InstrumentId = 42, DisplayName = "Tesla", InternalSymbol = "TSLA" }]
        };
        SetupResponse(HttpStatusCode.OK, response);

        var result = await _client.LookupInstrumentByIdAsync(42);

        Assert.NotNull(result);
        Assert.Equal(42, result!.InstrumentId);
        Assert.Equal("Tesla", result.DisplayName);
        Assert.Equal("TSLA", result.InternalSymbol);
    }

    [Fact]
    public async Task LookupInstrumentById_ReturnsNull_OnEmptyResults()
    {
        SetupResponse(HttpStatusCode.OK, new EtoroSocialSearchResponse { Items = [] });

        var result = await _client.LookupInstrumentByIdAsync(999);

        Assert.Null(result);
    }

    [Fact]
    public async Task LookupInstrumentById_ReturnsNull_OnApiError()
    {
        SetupResponse(HttpStatusCode.Unauthorized, "{}");

        var result = await _client.LookupInstrumentByIdAsync(42);

        Assert.Null(result);
    }

    [Fact]
    public async Task LookupInstrumentById_ReturnsNull_OnNetworkError()
    {
        SetupException(new HttpRequestException("Connection refused"));

        var result = await _client.LookupInstrumentByIdAsync(42);

        Assert.Null(result);
    }

    [Fact]
    public async Task LookupInstrumentById_ConstructsCorrectUrl()
    {
        SetupResponse(HttpStatusCode.OK, new EtoroSocialSearchResponse());
        HttpRequestMessage? capturedRequest = null;

        _httpHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent("{\"items\":[]}")
            });

        await _client.LookupInstrumentByIdAsync(42);

        Assert.NotNull(capturedRequest);
        var url = capturedRequest!.RequestUri!.ToString();
        Assert.Contains("instrumentId=42", url);
        Assert.Contains("displayname", url);
        Assert.Contains("internalSymbolFull", url);
    }

    #endregion

    #region GetUserPortfolioAsync

    [Fact]
    public async Task GetUserPortfolio_ReturnsPositions_OnSuccess()
    {
        var response = new EtoroUserPortfolioResponse
        {
            Positions =
            [
                new EtoroPosition { InstrumentId = 1, IsBuy = true, InvestmentPct = 10.0, NetProfit = 5.0 },
                new EtoroPosition { InstrumentId = 2, IsBuy = false, InvestmentPct = 3.0, NetProfit = -1.0 }
            ]
        };
        SetupResponse(HttpStatusCode.OK, response);

        var result = await _client.GetUserPortfolioAsync("test_user");

        Assert.NotNull(result);
        Assert.Equal(2, result!.Positions.Count);
        Assert.True(result.Positions[0].IsBuy);
        Assert.False(result.Positions[1].IsBuy);
    }

    [Fact]
    public async Task GetUserPortfolio_ReturnsNull_OnNotFound()
    {
        SetupResponse(HttpStatusCode.NotFound, "User not found");

        var result = await _client.GetUserPortfolioAsync("nonexistent_user");

        Assert.Null(result);
    }

    [Fact]
    public async Task GetUserPortfolio_ReturnsNull_OnNetworkError()
    {
        SetupException(new HttpRequestException("Connection refused"));

        var result = await _client.GetUserPortfolioAsync("test_user");

        Assert.Null(result);
    }

    [Fact]
    public async Task GetUserPortfolio_ConstructsCorrectUrl()
    {
        SetupResponse(HttpStatusCode.OK, new EtoroUserPortfolioResponse());
        HttpRequestMessage? capturedRequest = null;

        _httpHandlerMock.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent("{\"positions\":[]}")
            });

        await _client.GetUserPortfolioAsync("top_trader123");

        Assert.NotNull(capturedRequest);
        var url = capturedRequest!.RequestUri!.ToString();
        Assert.Contains("/user-info/people/top_trader123/portfolio/live", url);
    }

    #endregion
}
