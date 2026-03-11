using System.Diagnostics;
using DataFetcher.Worker.Domain.Common.Entities;
using DataFetcher.Worker.Domain.Providers.Finnhub.Entities;
using DataFetcher.Worker.Infrastructure.Common.Repositories;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub;
using DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;
using StockTracker.Common.Metrics;

namespace DataFetcher.Worker.Application.Providers.Finnhub;

/// <summary>
/// Service implementation for fetching and processing stock fundamentals from Finnhub.
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
    private const string MetricsPrefix = "data_fetcher_2_finnhub";

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
                await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_operations_total", 1,
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

            if (latestReport?.Report != null)
            {
                var cf = latestReport.Report.Cf;
                var ic = latestReport.Report.Ic;

                var operatingCashFlow = _calcService.ExtractFinancialItem(cf,
                    "NetCashProvidedByUsedInOperatingActivities",
                    "OperatingCashFlow",
                    "CashFlowsFromOperatingActivities");
                var capex = _calcService.ExtractFinancialItem(cf,
                    "PaymentsToAcquirePropertyPlantAndEquipment",
                    "CapitalExpenditures",
                    "PurchaseOfPropertyPlantAndEquipment");

                if (operatingCashFlow.HasValue)
                {
                    freeCashFlow = operatingCashFlow - (capex ?? 0);
                }

                ebit = _calcService.ExtractFinancialItem(ic,
                    "OperatingIncomeLoss",
                    "OperatingIncome",
                    "IncomeLossFromContinuingOperationsBeforeIncomeTaxes");
                interestExpense = _calcService.ExtractFinancialItem(ic,
                    "InterestExpense",
                    "InterestAndDebtExpense",
                    "InterestPaid");
            }

            // Use Finnhub's direct FCF metric as fallback
            if (!freeCashFlow.HasValue)
            {
                freeCashFlow = _calcService.ExtractMetric(metrics, "freeCashFlowTTM") ??
                               _calcService.ExtractMetric(metrics, "freeCashFlowPerShareTTM");
            }

            var roic = _calcService.ExtractMetric(metrics, "roicTTM") ??
                       _calcService.ExtractMetric(metrics, "returnOnInvestedCapitalTTM") ??
                       _calcService.ExtractMetric(metrics, "roicAnnual");

            var interestCoverage = _calcService.CalculateInterestCoverage(ebit, interestExpense);
            if (!interestCoverage.HasValue)
            {
                interestCoverage = _calcService.ExtractMetric(metrics, "interestCoverageTTM") ??
                                   _calcService.ExtractMetric(metrics, "interestCoverageAnnual");
            }

            // Build fundamentals data
            var data = new FundamentalsData
            {
                StockTickerId = ticker.Id,
                FiscalYear = fiscalYear,
                FiscalQuarter = fiscalQuarter,
                MarketCap = profile?.MarketCapitalization,
                PeRatio = _calcService.ExtractMetric(metrics, "peBasicExclExtraTTM") ??
                          _calcService.ExtractMetric(metrics, "peTTM") ??
                          _calcService.ExtractMetric(metrics, "peAnnual"),
                ForwardPe = _calcService.ExtractMetric(metrics, "forwardPE") ??
                            _calcService.ExtractMetric(metrics, "peFY1"),
                Roe = _calcService.ExtractMetric(metrics, "roeTTM") ??
                      _calcService.ExtractMetric(metrics, "roeAnnual"),
                Roic = roic,
                OperatingMargin = _calcService.ExtractMetric(metrics, "operatingMarginTTM") ??
                                  _calcService.ExtractMetric(metrics, "operatingMarginAnnual"),
                DebtToEquity = _calcService.ExtractMetric(metrics, "totalDebt/totalEquityQuarterly") ??
                               _calcService.ExtractMetric(metrics, "totalDebt/totalEquityAnnual"),
                Beta = _calcService.ExtractMetric(metrics, "beta"),
                DividendYield = _calcService.ExtractMetric(metrics, "dividendYieldIndicatedAnnual") ??
                                _calcService.ExtractMetric(metrics, "dividendYield5Y"),
                DividendPerShare = _calcService.ExtractMetric(metrics, "dividendPerShareAnnual") ??
                                   _calcService.ExtractMetric(metrics, "dividendPerShareTTM"),
                RevenueTtm = _calcService.ExtractMetric(metrics, "revenuePerShareTTM") ??
                             _calcService.ExtractMetric(metrics, "revenuePerShareAnnual"),
                EpsTtm = _calcService.ExtractMetric(metrics, "epsBasicExclExtraItemsTTM") ??
                         _calcService.ExtractMetric(metrics, "epsTTM") ??
                         _calcService.ExtractMetric(metrics, "epsAnnual"),
                FreeCashFlow = freeCashFlow,
                InterestCoverage = interestCoverage,
                DataSource = "Finnhub",
                LastFetchedAt = DateTime.UtcNow
            };

            // Calculate YoY growth rates
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
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_operations_total", 1,
                new Dictionary<string, string> { ["symbol"] = ticker.Symbol, ["status"] = "success" });
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_records_upserted_total", 1, labels);
            await _metrics.ObserveHistogramAsync($"{MetricsPrefix}_fetch_duration_seconds", stopwatch.Elapsed.TotalSeconds, labels);

            _logger.LogInformation("Successfully fetched fundamentals for {Symbol} Q{Quarter} {Year}",
                ticker.Symbol, fiscalQuarter, fiscalYear);

            return data;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex, "Error fetching fundamentals for {Symbol}", ticker.Symbol);
            await _metrics.IncrementCounterAsync($"{MetricsPrefix}_fetch_errors_total", 1,
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
