using Dapper;
using DataFetcher.Worker.Application.Providers.Etoro;
using DataFetcher.Worker.Infrastructure.Common;
using Microsoft.AspNetCore.Mvc;

namespace DataFetcher.Worker.Presentation.Controllers;

[ApiController]
[Route("api/etoro")]
[Produces("application/json")]
[ApiExplorerSettings(GroupName = "alpaca")]
public class EtoroController : ControllerBase
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<EtoroController> _logger;

    public EtoroController(IServiceProvider serviceProvider, ILogger<EtoroController> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    [HttpPost("seed-instrument-ids")]
    public async Task<IActionResult> SeedInstrumentIds(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<IDbConnectionFactory>();
            var etoroClient = scope.ServiceProvider.GetRequiredService<IEtoroMarketDataClient>();

            using var connection = db.CreateConnection();

            var stocks = (await connection.QueryAsync<(int Id, string Symbol)>(
                "SELECT id, symbol FROM stock_tickers WHERE is_active = true AND etoro_instrument_id IS NULL"
            )).ToList();

            var cryptos = (await connection.QueryAsync<(int Id, string Symbol)>(
                "SELECT id, symbol FROM crypto_tickers WHERE is_active = true AND etoro_instrument_id IS NULL"
            )).ToList();

            _logger.LogInformation("Seeding eToro instrumentIds for {StockCount} stocks and {CryptoCount} cryptos",
                stocks.Count, cryptos.Count);

            var results = new List<object>();
            var found = 0;
            var notFound = 0;
            var errors = 0;

            foreach (var ticker in stocks)
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    var instruments = await etoroClient.SearchInstrumentAsync(ticker.Symbol, "internalSymbolFull", cancellationToken);
                    var match = instruments.FirstOrDefault(i =>
                        i.InternalAssetClassName.Equals("Stocks", StringComparison.OrdinalIgnoreCase) ||
                        i.InternalAssetClassName.Equals("ETF", StringComparison.OrdinalIgnoreCase));

                    if (match != null)
                    {
                        await connection.ExecuteAsync(
                            "UPDATE stock_tickers SET etoro_instrument_id = @InstrumentId, updated_at = @Now WHERE id = @Id",
                            new { InstrumentId = match.InstrumentId, Now = DateTime.UtcNow, Id = ticker.Id });
                        found++;
                        results.Add(new { symbol = ticker.Symbol, instrumentId = match.InstrumentId, status = "found" });
                        _logger.LogInformation("Seeded {Symbol} -> instrumentId={InstrumentId}", ticker.Symbol, match.InstrumentId);
                    }
                    else
                    {
                        notFound++;
                        results.Add(new { symbol = ticker.Symbol, instrumentId = (int?)null, status = "not_found" });
                    }

                    await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
                }
                catch (Exception ex)
                {
                    errors++;
                    results.Add(new { symbol = ticker.Symbol, instrumentId = (int?)null, status = "error", error = ex.Message });
                    _logger.LogWarning(ex, "Error seeding eToro instrumentId for {Symbol}", ticker.Symbol);
                }
            }

            foreach (var ticker in cryptos)
            {
                cancellationToken.ThrowIfCancellationRequested();
                try
                {
                    var cryptoSymbol = ticker.Symbol.Split('/')[0];
                    var instruments = await etoroClient.SearchInstrumentAsync(cryptoSymbol, "internalSymbolFull", cancellationToken);
                    var match = instruments.FirstOrDefault(i =>
                        i.InternalAssetClassName.Equals("Crypto", StringComparison.OrdinalIgnoreCase));

                    if (match != null)
                    {
                        await connection.ExecuteAsync(
                            "UPDATE crypto_tickers SET etoro_instrument_id = @InstrumentId, updated_at = @Now WHERE id = @Id",
                            new { InstrumentId = match.InstrumentId, Now = DateTime.UtcNow, Id = ticker.Id });
                        found++;
                        results.Add(new { symbol = ticker.Symbol, instrumentId = match.InstrumentId, status = "found" });
                        _logger.LogInformation("Seeded {Symbol} -> instrumentId={InstrumentId}", ticker.Symbol, match.InstrumentId);
                    }
                    else
                    {
                        notFound++;
                        results.Add(new { symbol = ticker.Symbol, instrumentId = (int?)null, status = "not_found" });
                    }

                    await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);
                }
                catch (Exception ex)
                {
                    errors++;
                    results.Add(new { symbol = ticker.Symbol, instrumentId = (int?)null, status = "error", error = ex.Message });
                    _logger.LogWarning(ex, "Error seeding eToro instrumentId for {Symbol}", ticker.Symbol);
                }
            }

            return Ok(new
            {
                message = $"Seeding complete: {found} found, {notFound} not found, {errors} errors",
                found,
                notFound,
                errors,
                total = stocks.Count + cryptos.Count,
                details = results
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in SeedInstrumentIds");
            return StatusCode(500, new { message = "Failed to seed instrument IDs", error = ex.Message });
        }
    }

    [HttpGet("status")]
    public IActionResult GetStatus()
    {
        return Ok(new { provider = "eToro", status = "running", timestamp = DateTime.UtcNow });
    }
}
