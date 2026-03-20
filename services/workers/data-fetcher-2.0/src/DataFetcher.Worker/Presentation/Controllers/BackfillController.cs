using DataFetcher.Worker.Application.Providers.Indicators;
using DataFetcher.Worker.Infrastructure.Common;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace DataFetcher.Worker.Presentation.Controllers;

[ApiController]
[Route("api/backfill")]
public class BackfillController : ControllerBase
{
    private readonly IIndicatorRegistry _registry;
    private readonly IStockTickerRepository _stockTickerRepo;
    private readonly ICryptoTickerRepository _cryptoTickerRepo;
    private readonly IDbConnectionFactory _dbFactory;
    private readonly ILogger<BackfillController> _logger;

    public BackfillController(
        IIndicatorRegistry registry,
        IStockTickerRepository stockTickerRepo,
        ICryptoTickerRepository cryptoTickerRepo,
        IDbConnectionFactory dbFactory,
        ILogger<BackfillController> logger)
    {
        _registry = registry;
        _stockTickerRepo = stockTickerRepo;
        _cryptoTickerRepo = cryptoTickerRepo;
        _dbFactory = dbFactory;
        _logger = logger;
    }

    [HttpPost("enforce-all")]
    public async Task<IActionResult> EnforceBackfillAll(CancellationToken ct)
    {
        var triggered = 0;
        var alreadyComplete = 0;
        var failed = 0;
        var details = new List<object>();

        var stockTickers = (await _stockTickerRepo.GetActiveTickersAsync()).ToList();
        var cryptoTickers = (await _cryptoTickerRepo.GetActiveTickersAsync()).ToList();

        foreach (var indicator in _registry.GetAllDefinitions())
        {
            var tickers = new List<(int Id, string Symbol, string AssetType)>();

            if (indicator.AppliesTo("stock"))
                tickers.AddRange(stockTickers.Select(t => (t.Id, t.Symbol, "stock")));
            if (indicator.AppliesTo("crypto"))
                tickers.AddRange(cryptoTickers.Select(t => (t.Id, t.Symbol, "crypto")));

            foreach (var (tickerId, symbol, assetType) in tickers)
            {
                try
                {
                    ct.ThrowIfCancellationRequested();

                    using var conn = _dbFactory.CreateConnection();
                    var table = indicator.TargetTable(assetType);
                    var idCol = assetType == "crypto" ? "crypto_ticker_id" : "stock_ticker_id";
                    var priceTable = assetType == "crypto" ? "crypto_prices" : "stock_prices";

                    var expectedDays = await conn.QueryFirstOrDefaultAsync<int>(
                        $"SELECT COUNT(DISTINCT price_time::date) FROM {priceTable} WHERE {idCol} = @Id",
                        new { Id = tickerId });

                    var actualDays = await conn.QueryFirstOrDefaultAsync<int>(
                        $"SELECT COUNT(DISTINCT indicator_time::date) FROM {table} WHERE {idCol} = @Id",
                        new { Id = tickerId });

                    if (expectedDays == 0) continue;

                    var gapPct = 1.0 - ((double)actualDays / expectedDays);

                    if (gapPct > 0.05)
                    {
                        var from = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-365));
                        var to = DateOnly.FromDateTime(DateTime.UtcNow);
                        await indicator.BackfillAsync(tickerId, symbol, from, to, ct);
                        triggered++;
                        details.Add(new { symbol, indicator = indicator.IndicatorName, gapPct = Math.Round(gapPct * 100, 1), action = "backfilled" });
                    }
                    else
                    {
                        alreadyComplete++;
                    }
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    failed++;
                    _logger.LogWarning(ex, "Backfill enforcement failed for {Symbol}/{Indicator}",
                        symbol, indicator.IndicatorName);
                    details.Add(new { symbol, indicator = indicator.IndicatorName, error = ex.Message });
                }
            }
        }

        return Ok(new { triggered, alreadyComplete, failed, details });
    }

    [HttpPost("enforce/{tickerId:int}")]
    public async Task<IActionResult> EnforceBackfillTicker(int tickerId, [FromQuery] string assetType = "stock", CancellationToken ct = default)
    {
        var isCrypto = string.Equals(assetType, "crypto", StringComparison.OrdinalIgnoreCase);
        string symbol;
        if (isCrypto)
        {
            var ticker = await _cryptoTickerRepo.GetByIdAsync(tickerId);
            symbol = ticker?.Symbol ?? "UNKNOWN/USD";
        }
        else
        {
            var ticker = await _stockTickerRepo.GetByIdAsync(tickerId);
            symbol = ticker?.Symbol ?? "UNKNOWN";
        }

        var results = new List<object>();
        var indicators = _registry.GetForAssetType(assetType);

        foreach (var indicator in indicators)
        {
            try
            {
                var from = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-365));
                var to = DateOnly.FromDateTime(DateTime.UtcNow);
                var result = await indicator.BackfillAsync(tickerId, symbol, from, to, ct);
                results.Add(new { indicator = indicator.IndicatorName, result.DaysComputed, result.DaysSkipped, result.Error });
            }
            catch (Exception ex)
            {
                results.Add(new { indicator = indicator.IndicatorName, error = ex.Message });
            }
        }

        return Ok(new { tickerId, assetType, symbol, results });
    }
}
