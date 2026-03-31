using System.Data;
using System.Data.Common;
using Xunit;
using Moq;
using Moq.Protected;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Domain.Providers.Etoro.Models;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Workers.Etoro;

namespace DataFetcher.Worker.Tests;

public class EtoroInstrumentServiceTests
{
    private readonly Mock<IServiceScopeFactory> _scopeFactoryMock;
    private readonly Mock<IServiceScope> _scopeMock;
    private readonly Mock<IServiceProvider> _scopedProviderMock;
    private readonly Mock<IDbConnectionFactory> _dbFactoryMock;
    private readonly Mock<IDbConnection> _connectionMock;
    private readonly Mock<IEtoroMarketDataClient> _clientMock;
    private readonly EtoroInstrumentService _service;

    public EtoroInstrumentServiceTests()
    {
        _scopeFactoryMock = new Mock<IServiceScopeFactory>();
        _scopeMock = new Mock<IServiceScope>();
        _scopedProviderMock = new Mock<IServiceProvider>();
        _dbFactoryMock = new Mock<IDbConnectionFactory>();
        _connectionMock = new Mock<IDbConnection>();
        _clientMock = new Mock<IEtoroMarketDataClient>();

        _scopeFactoryMock.Setup(f => f.CreateScope()).Returns(_scopeMock.Object);
        _scopeMock.Setup(s => s.ServiceProvider).Returns(_scopedProviderMock.Object);
        _scopedProviderMock.Setup(p => p.GetService(typeof(IDbConnectionFactory))).Returns(_dbFactoryMock.Object);
        _scopedProviderMock.Setup(p => p.GetService(typeof(IEtoroMarketDataClient))).Returns(_clientMock.Object);

        SetupMockConnectionForDapper();
        _dbFactoryMock.Setup(f => f.CreateConnection()).Returns(_connectionMock.Object);

        _service = new EtoroInstrumentService(
            _scopeFactoryMock.Object,
            Mock.Of<ILogger<EtoroInstrumentService>>());
    }

    private void SetupMockConnectionForDapper()
    {
        var readerMock = new Mock<DbDataReader>();
        readerMock.Setup(r => r.ReadAsync(It.IsAny<CancellationToken>())).ReturnsAsync(false);
        readerMock.Setup(r => r.Read()).Returns(false);
        readerMock.Setup(r => r.FieldCount).Returns(0);
        readerMock.Setup(r => r.NextResultAsync(It.IsAny<CancellationToken>())).ReturnsAsync(false);
        readerMock.Setup(r => r.NextResult()).Returns(false);
        readerMock.Setup(r => r.HasRows).Returns(false);

        var cmdMock = new Mock<DbCommand>();
        cmdMock.SetupAllProperties();
        cmdMock.Protected().Setup<DbParameter>("CreateDbParameter")
            .Returns(new Mock<DbParameter>().Object);
        cmdMock.Protected().SetupGet<DbParameterCollection>("DbParameterCollection")
            .Returns(new Mock<DbParameterCollection>().Object);
        cmdMock.Protected()
            .Setup<Task<DbDataReader>>("ExecuteDbDataReaderAsync",
                ItExpr.IsAny<CommandBehavior>(), ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(readerMock.Object);
        cmdMock.Protected()
            .Setup<DbDataReader>("ExecuteDbDataReader", ItExpr.IsAny<CommandBehavior>())
            .Returns(readerMock.Object);

        _connectionMock.Setup(c => c.CreateCommand()).Returns(cmdMock.Object);
        _connectionMock.Setup(c => c.State).Returns(ConnectionState.Open);
    }

    #region Cache Operations (Zero I/O)

    [Fact]
    public void TryGet_ReturnsFalse_WhenCacheEmpty()
    {
        Assert.False(_service.TryGet(1, out var info));
        Assert.Null(info);
    }

    [Fact]
    public void TryGet_ReturnsTrue_AfterTrackFromSearch()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Bitcoin", Symbol = "BTC", InstrumentTypeId = 10
        });

        Assert.True(_service.TryGet(1, out var info));
        Assert.NotNull(info);
        Assert.Equal("Bitcoin", info!.DisplayName);
        Assert.Equal("BTC", info.Symbol);
        Assert.Equal(10, info.InstrumentTypeId);
    }

    [Fact]
    public void TrackFromSearch_CapturesAllFields()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1001, DisplayName = "Apple",
            Symbol = "AAPL", InstrumentTypeId = 5
        });

        Assert.True(_service.TryGet(1001, out var info));
        Assert.Equal("Apple", info!.DisplayName);
        Assert.Equal("AAPL", info.Symbol);
        Assert.Equal(5, info.InstrumentTypeId);
    }

    [Fact]
    public void TrackFromSearch_SkipsNullDisplayName()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = null
        });

        Assert.False(_service.Contains(1));
        Assert.Equal(0, _service.PendingCount);
    }

    [Fact]
    public void TrackFromSearch_UpdatesExistingEntry()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Old Name", Symbol = "OLD"
        });
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "New Name", Symbol = "NEW"
        });

        Assert.True(_service.TryGet(1, out var info));
        Assert.Equal("New Name", info!.DisplayName);
        Assert.Equal("NEW", info.Symbol);
    }

    [Fact]
    public void TrackEnriched_UpdatesCacheAndPending()
    {
        var info = new EtoroInstrumentService.InstrumentInfo("Tesla", "TSLA", 5);
        _service.TrackEnriched(42, info);

        Assert.True(_service.TryGet(42, out var cached));
        Assert.Equal("Tesla", cached!.DisplayName);
        Assert.Equal(1, _service.PendingCount);
    }

    [Fact]
    public void TrackEnriched_SkipsNullDisplayName()
    {
        var info = new EtoroInstrumentService.InstrumentInfo("", null, null);
        _service.TrackEnriched(42, info);

        Assert.False(_service.Contains(42));
    }

    [Fact]
    public void Contains_ChecksCache()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 5, DisplayName = "Test"
        });

        Assert.True(_service.Contains(5));
        Assert.False(_service.Contains(999));
    }

    [Fact]
    public void FindUnknownIds_ReturnsIdsNotInCache()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Known"
        });

        var positions = new List<EtoroSocialDataWorker.AggregatedPosition>
        {
            new() { InstrumentId = 1 },
            new() { InstrumentId = 2 },
            new() { InstrumentId = 3 }
        };
        var curatedIds = new HashSet<int> { 1, 4 };

        var unknowns = _service.FindUnknownIds(positions, curatedIds);

        Assert.Equal(3, unknowns.Count);
        Assert.Contains(2, unknowns);
        Assert.Contains(3, unknowns);
        Assert.Contains(4, unknowns);
        Assert.DoesNotContain(1, unknowns);
    }

    [Fact]
    public void FindUnknownIds_ReturnsEmpty_WhenAllKnown()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument { InstrumentId = 1, DisplayName = "A" });
        _service.TrackFromSearch(new EtoroSocialInstrument { InstrumentId = 2, DisplayName = "B" });

        var positions = new List<EtoroSocialDataWorker.AggregatedPosition>
        {
            new() { InstrumentId = 1 }
        };
        var curatedIds = new HashSet<int> { 2 };

        var unknowns = _service.FindUnknownIds(positions, curatedIds);
        Assert.Empty(unknowns);
    }

    [Fact]
    public void FindUnknownIds_DeduplicatesAcrossSources()
    {
        var positions = new List<EtoroSocialDataWorker.AggregatedPosition>
        {
            new() { InstrumentId = 5 },
            new() { InstrumentId = 5 }
        };
        var curatedIds = new HashSet<int> { 5 };

        var unknowns = _service.FindUnknownIds(positions, curatedIds);
        Assert.Single(unknowns);
        Assert.Contains(5, unknowns);
    }

    [Fact]
    public void GetSnapshot_ReturnsImmutableCopy()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Test"
        });

        var snapshot = _service.GetSnapshot();
        Assert.Single(snapshot);

        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 2, DisplayName = "New"
        });

        Assert.Single(snapshot);
        Assert.Equal(2, _service.CacheCount);
    }

    [Fact]
    public void ClearPending_DiscardsPendingButKeepsCache()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Test"
        });
        Assert.Equal(1, _service.PendingCount);

        _service.ClearPending();

        Assert.Equal(0, _service.PendingCount);
        Assert.True(_service.Contains(1));
    }

    [Fact]
    public void PartitionByKnown_SeparatesCorrectly()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Known1"
        });
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 3, DisplayName = "Known3"
        });

        var (known, unknown) = _service.PartitionByKnown(new[] { 1, 2, 3, 4 });

        Assert.Equal(2, known.Count);
        Assert.Contains(1, known.Keys);
        Assert.Contains(3, known.Keys);
        Assert.Equal(2, unknown.Count);
        Assert.Contains(2, unknown);
        Assert.Contains(4, unknown);
    }

    #endregion

    #region FlushPendingAsync

    [Fact]
    public async Task FlushPending_ReturnsZero_WhenNoPending()
    {
        var result = await _service.FlushPendingAsync(_connectionMock.Object);
        Assert.Equal(0, result);
    }

    [Fact]
    public async Task FlushPending_ClearsPendingAfterFlush()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Test"
        });
        Assert.Equal(1, _service.PendingCount);

        await _service.FlushPendingAsync(_connectionMock.Object);

        Assert.Equal(0, _service.PendingCount);
    }

    [Fact]
    public async Task FlushPending_CacheRemainsIntact()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Test"
        });

        await _service.FlushPendingAsync(_connectionMock.Object);

        Assert.True(_service.TryGet(1, out var info));
        Assert.Equal("Test", info!.DisplayName);
    }

    #endregion

    #region ResolveAsync

    [Fact]
    public async Task ResolveAsync_ReturnsCached_WhenInCache()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Cached"
        });

        var result = await _service.ResolveAsync(1);

        Assert.NotNull(result);
        Assert.Equal("Cached", result!.DisplayName);
        _scopeFactoryMock.Verify(f => f.CreateScope(), Times.Never);
    }

    [Fact]
    public async Task ResolveAsync_FallsBackToApi_OnDbMiss()
    {
        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroSocialInstrument
            {
                InstrumentId = 42, DisplayName = "Tesla", InternalSymbol = "TSLA.RTH",
                Symbol = "TSLA", InstrumentTypeId = 5
            });

        var result = await _service.ResolveAsync(42);

        Assert.NotNull(result);
        Assert.Equal("Tesla", result!.DisplayName);
        Assert.Equal("TSLA", result.Symbol);
    }

    [Fact]
    public async Task ResolveAsync_UpdatesCache_AfterResolve()
    {
        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(42, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EtoroSocialInstrument
            {
                InstrumentId = 42, DisplayName = "Tesla"
            });

        await _service.ResolveAsync(42);

        Assert.True(_service.TryGet(42, out _));
    }

    [Fact]
    public async Task ResolveAsync_ReturnsNull_WhenApiReturnsNull()
    {
        _clientMock.Setup(c => c.LookupInstrumentByIdAsync(99, It.IsAny<CancellationToken>()))
            .ReturnsAsync((EtoroSocialInstrument?)null);

        var result = await _service.ResolveAsync(99);

        Assert.Null(result);
    }

    #endregion

    #region ResolveBatchAsync

    [Fact]
    public async Task ResolveBatch_ReturnsCached_ForAllKnownIds()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument { InstrumentId = 1, DisplayName = "A" });
        _service.TrackFromSearch(new EtoroSocialInstrument { InstrumentId = 2, DisplayName = "B" });

        var result = await _service.ResolveBatchAsync(new[] { 1, 2 });

        Assert.Equal(2, result.Count);
        _scopeFactoryMock.Verify(f => f.CreateScope(), Times.Never);
    }

    [Fact]
    public async Task ResolveBatch_CallsBulkMetadataApi_ForUnknowns()
    {
        _clientMock.Setup(c => c.GetInstrumentsMetadataAsync(
                It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<EtoroInstrumentMetadata>
            {
                new() { InstrumentId = 42, DisplayName = "Tesla", InstrumentTypeId = 5, SymbolFull = "TSLA" }
            });

        var result = await _service.ResolveBatchAsync(new[] { 42 });

        Assert.Single(result);
        Assert.Equal("Tesla", result[42].DisplayName);
    }

    [Fact]
    public async Task ResolveBatch_UpdatesCache_ForAllResolved()
    {
        _clientMock.Setup(c => c.GetInstrumentsMetadataAsync(
                It.IsAny<IEnumerable<int>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<EtoroInstrumentMetadata>
            {
                new() { InstrumentId = 10, DisplayName = "Test", InstrumentTypeId = 5, SymbolFull = "TST" }
            });

        await _service.ResolveBatchAsync(new[] { 10 });

        Assert.True(_service.Contains(10));
    }

    #endregion

    #region Thread Safety

    [Fact]
    public async Task ConcurrentTryGet_DoesNotThrow()
    {
        _service.TrackFromSearch(new EtoroSocialInstrument
        {
            InstrumentId = 1, DisplayName = "Test"
        });

        var tasks = Enumerable.Range(0, 100).Select(_ => Task.Run(() =>
        {
            _service.TryGet(1, out EtoroInstrumentService.InstrumentInfo? _);
            _service.Contains(1);
            _service.GetSnapshot();
        }));

        var ex = await Record.ExceptionAsync(() => Task.WhenAll(tasks));
        Assert.Null(ex);
    }

    #endregion
}
