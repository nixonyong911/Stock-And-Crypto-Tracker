using System.Diagnostics;
using Finnhub.Worker.Domain.Models;
using Finnhub.Worker.Repositories;
using StockTracker.Common.Metrics;

namespace Finnhub.Worker.Services;

/// <summary>
/// Service implementation for fetching and processing stock fundamentals.
/// </summary>
public class FundamentalsFetchService : IFundamentalsFetchService
{
    private readonly IFinnhubApiClient _finnhubClient;
    private readonly IFundamentalsRepository _fundamentalsRepo;
    private readonly IStockTickerRepository _tickerRepo;
    private readonly IEarningsRepository _earningsRepo;
    private readonly MetricsCalculationService _calcService;
    private readonly IMetricsClient _metrics;
    private readonly ILogger<FundamentalsFetchService> _logger;
    private const int KeepQuarters = 4;

    public FundamentalsFetchService(
        IFinnhubApiClient finnhubClient,
        IFundamentalsRepository fundamentalsRepo,
        IStockTickerRepository tickerRepo,
        IEarningsRepository earningsRepo,
        MetricsCalculationService calcService,
        IMetricsClient metrics,
        ILogger<FundamentalsFetchService> logger)
    {
        _finnhubClient = finnhubClient;
        _fundamentalsRepo = fundamentalsRepo;
        _tickerRepo = tickerRepo;
        _earningsRepo = earningsRepo;
        _calcService = calcService;
        _metrics = metrics;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task<FundamentalsData?> FetchAndStoreFundamentalsAsync(StockTicker ticker, CancellationToken cancellationToken = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var labels = new Dictionary<string, string> { ["symbol"] = ticker.Symbol };

        try
        {
            _logger.LogInformation("Fetching fundamentals for {Symbol}", ticker.Symbol);

            // Fetch data from Finnhub APIs
            var profile = await _finnhubClient.GetCompanyProfileAsync(ticker.Symbol, cancellationToken);
            var financials = await _finnhubClient.GetBasicFinancialsAsync(ticker.Symbol, cancellationToken);
            var reported = await _finnhubClient.GetFinancialsReportedAsync(ticker.Symbol, "quarterly", cancellationToken);

            if (profile == null && financials == null)
            {
                _logger.LogWarning("No data available for {Symbol}", ticker.Symbol);
                await _metrics.IncrementCounterAsync("fetch_operations_total", 1,
                    new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["status"] = "no_data" });
                return null;
            }

            // Determine fiscal period from latest reported financials
            var latestReport = reported?.Data?.FirstOrDefault();
            var fiscalYear = latestReport?.Year ?? DateTime.UtcNow.Year;
            var fiscalQuarter = latestReport?.Quarter != null 
                ? $"Q{latestReport.Quarter}" 
                : _calcService.GetFiscalQuarter(DateTime.UtcNow.Month);

            // Get previous year data for YoY calculations
            var prevYearData = await _fundamentalsRepo.GetPreviousYearQuarterAsync(ticker.Id, fiscalYear, fiscalQuarter);

            // Extract metrics from Finnhub response
            var metrics = financials?.Metric;

            // Extract values from reported financials
            decimal? freeCashFlow = null;
            decimal? ebit = null;
            decimal? interestExpense = null;
            decimal? revenue = null;
            decimal? eps = null;

            if (latestReport?.Report != null)
            {
                var cf = latestReport.Report.Cf;
                var ic = latestReport.Report.Ic;

                freeCashFlow = _calcService.ExtractFinancialItem(cf,
                    "NetCashProvidedByUsedInOperatingActivities", "OperatingCashFlow") -
                    _calcService.ExtractFinancialItem(cf,
                    "PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures");

                ebit = _calcService.ExtractFinancialItem(ic,
                    "OperatingIncomeLoss", "OperatingIncome");
                interestExpense = _calcService.ExtractFinancialItem(ic,
                    "InterestExpense", "InterestAndDebtExpense");
                revenue = _calcService.ExtractFinancialItem(ic,
                    "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet");
                eps = _calcService.ExtractFinancialItem(ic,
                    "EarningsPerShareDiluted", "EarningsPerShareBasic");
            }

            // Build fundamentals data
            var data = new FundamentalsData
            {
                StockTickerId = ticker.Id,
                FiscalYear = fiscalYear,
                FiscalQuarter = fiscalQuarter,

                // From profile
                MarketCap = profile?.MarketCapitalization,

                // From metrics
                PeRatio = _calcService.ExtractMetric(metrics, "peBasicExclExtraTTM") ??
                          _calcService.ExtractMetric(metrics, "peTTM"),
                ForwardPe = _calcService.ExtractMetric(metrics, "forwardPE"),
                Roe = _calcService.ExtractMetric(metrics, "roeTTM"),
                Roic = _calcService.ExtractMetric(metrics, "roicTTM"),
                OperatingMargin = _calcService.ExtractMetric(metrics, "operatingMarginTTM"),
                DebtToEquity = _calcService.ExtractMetric(metrics, "totalDebt/totalEquityQuarterly"),
                DividendYield = _calcService.ExtractMetric(metrics, "dividendYieldIndicatedAnnual"),
                RevenueTtm = _calcService.ExtractMetric(metrics, "revenuePerShareTTM"),
                EpsTtm = _calcService.ExtractMetric(metrics, "epsBasicExclExtraItemsTTM") ??
                         _calcService.ExtractMetric(metrics, "epsTTM"),

                // From reported financials
                FreeCashFlow = freeCashFlow,

                // Calculated metrics
                InterestCoverage = _calcService.CalculateInterestCoverage(ebit, interestExpense),

                DataSource = "Finnhub",
                LastFetchedAt = DateTime.UtcNow
            };

            // Calculate YoY growth rates if we have previous year data
            if (prevYearData != null)
            {
                data.RevenueGrowthYoy = _calcService.CalculateYoyGrowth(data.RevenueTtm, prevYearData.RevenueTtm);
                data.EpsGrowthYoy = _calcService.CalculateYoyGrowth(data.EpsTtm, prevYearData.EpsTtm);
                data.FcfGrowthYoy = _calcService.CalculateYoyGrowth(data.FreeCashFlow, prevYearData.FreeCashFlow);
            }

            // Calculate derived metrics
            data.FcfYield = _calcService.CalculateFcfYield(data.FreeCashFlow, data.MarketCap);
            data.PegRatio = _calcService.CalculatePegRatio(data.PeRatio, data.EpsGrowthYoy);

            // Store the data
            await _fundamentalsRepo.UpsertAsync(data);
            await _fundamentalsRepo.DeleteOldRecordsAsync(ticker.Id, KeepQuarters);

            stopwatch.Stop();
            await _metrics.IncrementCounterAsync("fetch_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["status"] = "success" });
            await _metrics.IncrementCounterAsync("records_upserted_total", 1, labels);
            await _metrics.ObserveHistogramAsync("fetch_duration_seconds", stopwatch.Elapsed.TotalSeconds, labels);

            _logger.LogInformation("Successfully fetched fundamentals for {Symbol} Q{Quarter} {Year}",
                ticker.Symbol, fiscalQuarter, fiscalYear);

            return data;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Error fetching fundamentals for {Symbol}", ticker.Symbol);
            await _metrics.IncrementCounterAsync("fetch_errors_total", 1,
                new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["error_type"] = ex.GetType().Name });
            throw;
        }
    }

    /// <inheritdoc />
    public async Task<int> FetchAndStoreAllFundamentalsAsync(CancellationToken cancellationToken = default)
    {
        var tickers = await _tickerRepo.GetActiveTickersAsync();
        var count = 0;

        foreach (var ticker in tickers)
        {
            if (cancellationToken.IsCancellationRequested) break;

            try
            {
                var result = await FetchAndStoreFundamentalsAsync(ticker, cancellationToken);
                if (result != null) count++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch fundamentals for {Symbol}, continuing with next ticker", ticker.Symbol);
            }
        }

        _logger.LogInformation("Fetched fundamentals for {Count} tickers", count);
        return count;
    }

    /// <inheritdoc />
    public async Task<int> FetchFundamentalsForRecentEarningsAsync(int withinDays = 2, CancellationToken cancellationToken = default)
    {
        var tickerIds = await _earningsRepo.GetTickersWithRecentEarningsAsync(withinDays);
        var count = 0;

        foreach (var tickerId in tickerIds)
        {
            if (cancellationToken.IsCancellationRequested) break;

            var ticker = await _tickerRepo.GetByIdAsync(tickerId);
            if (ticker == null) continue;

            try
            {
                var result = await FetchAndStoreFundamentalsAsync(ticker, cancellationToken);
                if (result != null) count++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to fetch fundamentals for ticker {TickerId}, continuing with next", tickerId);
            }
        }

        _logger.LogInformation("Fetched fundamentals for {Count} tickers with recent earnings", count);
        return count;
    }
}
