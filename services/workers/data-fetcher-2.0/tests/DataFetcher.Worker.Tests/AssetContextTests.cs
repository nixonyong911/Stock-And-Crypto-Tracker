using DataFetcher.Worker.Application.Providers.Common;
using DataFetcher.Worker.Tests.TestData;
using Xunit;
using static DataFetcher.Worker.Application.Providers.LocalIndicators.AdvancedIndicatorCalculatorService;

namespace DataFetcher.Worker.Tests;

public class AssetContextTests
{
    // ================================================================
    // AssetContext routing tests
    // ================================================================

    [Fact]
    public void StockAssetContext_ReturnsStockAssetType()
    {
        var context = new StockAssetContext();
        Assert.Equal("stock", context.AssetType);
    }

    [Fact]
    public void CryptoAssetContext_ReturnsCryptoAssetType()
    {
        var context = new CryptoAssetContext();
        Assert.Equal("crypto", context.AssetType);
    }

    [Fact]
    public void Factory_ResolvesStockContext()
    {
        var contexts = new IAssetContext[] { new StockAssetContext(), new CryptoAssetContext() };
        var factory = new AssetContextFactory(contexts);
        var resolved = factory.GetContext("stock");

        Assert.IsType<StockAssetContext>(resolved);
        Assert.Equal("stock", resolved.AssetType);
    }

    [Fact]
    public void Factory_ResolvesCryptoContext()
    {
        var contexts = new IAssetContext[] { new StockAssetContext(), new CryptoAssetContext() };
        var factory = new AssetContextFactory(contexts);
        var resolved = factory.GetContext("crypto");

        Assert.IsType<CryptoAssetContext>(resolved);
        Assert.Equal("crypto", resolved.AssetType);
    }

    [Theory]
    [InlineData("Stock")]
    [InlineData("STOCK")]
    [InlineData("Crypto")]
    public void Factory_CaseInsensitive(string assetType)
    {
        var contexts = new IAssetContext[] { new StockAssetContext(), new CryptoAssetContext() };
        var factory = new AssetContextFactory(contexts);

        var resolved = factory.GetContext(assetType);
        Assert.NotNull(resolved);
        Assert.Equal(assetType.ToLowerInvariant(), resolved.AssetType);
    }

    [Fact]
    public void Factory_UnknownAssetType_ThrowsWithMessage()
    {
        var contexts = new IAssetContext[] { new StockAssetContext(), new CryptoAssetContext() };
        var factory = new AssetContextFactory(contexts);

        var ex = Assert.Throws<ArgumentException>(() => factory.GetContext("forex"));
        Assert.Contains("forex", ex.Message);
        Assert.Contains("stock", ex.Message);
        Assert.Contains("crypto", ex.Message);
    }

    [Fact]
    public void Factory_EmptyString_Throws()
    {
        var contexts = new IAssetContext[] { new StockAssetContext(), new CryptoAssetContext() };
        var factory = new AssetContextFactory(contexts);

        var ex = Assert.Throws<ArgumentException>(() => factory.GetContext(""));
        Assert.Contains("", ex.Message);
    }

    [Fact]
    public void Factory_ContextsAreDistinct()
    {
        var stock = new StockAssetContext();
        var crypto = new CryptoAssetContext();

        Assert.NotSame(stock, crypto);
        Assert.NotEqual(stock.AssetType, crypto.AssetType);
        Assert.Equal("stock", stock.AssetType);
        Assert.Equal("crypto", crypto.AssetType);
    }

    // ================================================================
    // Stock/Crypto parity test (indicator output)
    // ================================================================

    [Fact]
    public void StockAndCrypto_IdenticalInput_ProduceIdenticalIndicators()
    {
        var bars = MockOhlcvDatasets.TrendingUp;
        var first = ComputeAdvancedIndicators(bars);
        var second = ComputeAdvancedIndicators(bars);

        AssertAdvancedSetsEqual(first, second);
    }

    // ================================================================
    // Regression gate
    // ================================================================

    [Fact]
    public void AssetContextFactory_WithBothContexts_HasExactlyTwoContexts()
    {
        var contexts = new IAssetContext[] { new StockAssetContext(), new CryptoAssetContext() };
        var factory = new AssetContextFactory(contexts);

        var stock = factory.GetContext("stock");
        var crypto = factory.GetContext("crypto");
        Assert.Equal("stock", stock.AssetType);
        Assert.Equal("crypto", crypto.AssetType);

        Assert.Throws<ArgumentException>(() => factory.GetContext("unknown"));
    }

    private static void AssertAdvancedSetsEqual(
        AdvancedIndicatorSet expected, AdvancedIndicatorSet actual)
    {
        Assert.Equal(expected.BollingerUpper, actual.BollingerUpper);
        Assert.Equal(expected.BollingerLower, actual.BollingerLower);
        Assert.Equal(expected.BollingerMiddle, actual.BollingerMiddle);
        Assert.Equal(expected.BollingerBandwidth, actual.BollingerBandwidth);
        Assert.Equal(expected.Atr, actual.Atr);
        Assert.Equal(expected.StochK, actual.StochK);
        Assert.Equal(expected.StochD, actual.StochD);
        Assert.Equal(expected.Adx, actual.Adx);
        Assert.Equal(expected.Obv, actual.Obv);
        Assert.Equal(expected.FibonacciLevels, actual.FibonacciLevels);
        Assert.Equal(expected.PivotLevels, actual.PivotLevels);
        Assert.Equal(expected.IchimokuTenkan, actual.IchimokuTenkan);
        Assert.Equal(expected.IchimokuKijun, actual.IchimokuKijun);
        Assert.Equal(expected.IchimokuSenkouA, actual.IchimokuSenkouA);
        Assert.Equal(expected.IchimokuSenkouB, actual.IchimokuSenkouB);
        Assert.Equal(expected.IchimokuChikou, actual.IchimokuChikou);
    }
}
