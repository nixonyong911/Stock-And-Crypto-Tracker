using Dapper;
using DataFetcher.Worker.Domain.Providers.Finnhub.Entities;
using DataFetcher.Worker.Infrastructure.Common;

namespace DataFetcher.Worker.Infrastructure.Providers.Finnhub.Repositories;

/// <summary>
/// Repository implementation for stock fundamentals operations.
/// </summary>
public class FundamentalsRepository : IFundamentalsRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<FundamentalsRepository> _logger;

    public FundamentalsRepository(IDbConnectionFactory connectionFactory, ILogger<FundamentalsRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task UpsertAsync(FundamentalsData data)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO analysis_stock_fundamentals (
                stock_ticker_id, fiscal_year, fiscal_quarter,
                market_cap, pe_ratio, forward_pe, peg_ratio, fcf_yield,
                roe, roic, operating_margin,
                revenue_ttm, revenue_growth_yoy, eps_ttm, eps_growth_yoy,
                debt_to_equity, interest_coverage, beta,
                free_cash_flow, fcf_growth_yoy,
                dividend_yield, dividend_per_share,
                week_52_high, week_52_low, week_52_high_date, week_52_low_date,
                data_source, last_fetched_at, updated_at
            ) VALUES (
                @StockTickerId, @FiscalYear, @FiscalQuarter,
                @MarketCap, @PeRatio, @ForwardPe, @PegRatio, @FcfYield,
                @Roe, @Roic, @OperatingMargin,
                @RevenueTtm, @RevenueGrowthYoy, @EpsTtm, @EpsGrowthYoy,
                @DebtToEquity, @InterestCoverage, @Beta,
                @FreeCashFlow, @FcfGrowthYoy,
                @DividendYield, @DividendPerShare,
                @Week52High, @Week52Low, @Week52HighDate, @Week52LowDate,
                @DataSource, @LastFetchedAt, NOW()
            )
            ON CONFLICT (stock_ticker_id, fiscal_year, fiscal_quarter)
            DO UPDATE SET
                market_cap = EXCLUDED.market_cap,
                pe_ratio = EXCLUDED.pe_ratio,
                forward_pe = EXCLUDED.forward_pe,
                peg_ratio = EXCLUDED.peg_ratio,
                fcf_yield = EXCLUDED.fcf_yield,
                roe = EXCLUDED.roe,
                roic = EXCLUDED.roic,
                operating_margin = EXCLUDED.operating_margin,
                revenue_ttm = EXCLUDED.revenue_ttm,
                revenue_growth_yoy = EXCLUDED.revenue_growth_yoy,
                eps_ttm = EXCLUDED.eps_ttm,
                eps_growth_yoy = EXCLUDED.eps_growth_yoy,
                debt_to_equity = EXCLUDED.debt_to_equity,
                interest_coverage = EXCLUDED.interest_coverage,
                beta = EXCLUDED.beta,
                free_cash_flow = EXCLUDED.free_cash_flow,
                fcf_growth_yoy = EXCLUDED.fcf_growth_yoy,
                dividend_yield = EXCLUDED.dividend_yield,
                dividend_per_share = EXCLUDED.dividend_per_share,
                week_52_high = EXCLUDED.week_52_high,
                week_52_low = EXCLUDED.week_52_low,
                week_52_high_date = EXCLUDED.week_52_high_date,
                week_52_low_date = EXCLUDED.week_52_low_date,
                data_source = EXCLUDED.data_source,
                last_fetched_at = EXCLUDED.last_fetched_at,
                updated_at = NOW()";

        await connection.ExecuteAsync(sql, data);
        _logger.LogDebug("Upserted fundamentals for ticker {TickerId} Q{Quarter} {Year}",
            data.StockTickerId, data.FiscalQuarter, data.FiscalYear);
    }

    /// <inheritdoc />
    public async Task<FundamentalsData?> GetLatestByTickerIdAsync(int stockTickerId)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                id as Id,
                stock_ticker_id as StockTickerId,
                fiscal_year as FiscalYear,
                fiscal_quarter as FiscalQuarter,
                market_cap as MarketCap,
                pe_ratio as PeRatio,
                forward_pe as ForwardPe,
                peg_ratio as PegRatio,
                fcf_yield as FcfYield,
                roe as Roe,
                roic as Roic,
                operating_margin as OperatingMargin,
                revenue_ttm as RevenueTtm,
                revenue_growth_yoy as RevenueGrowthYoy,
                eps_ttm as EpsTtm,
                eps_growth_yoy as EpsGrowthYoy,
                debt_to_equity as DebtToEquity,
                interest_coverage as InterestCoverage,
                beta as Beta,
                free_cash_flow as FreeCashFlow,
                fcf_growth_yoy as FcfGrowthYoy,
                dividend_yield as DividendYield,
                dividend_per_share as DividendPerShare,
                data_source as DataSource,
                last_fetched_at as LastFetchedAt,
                created_at as CreatedAt,
                updated_at as UpdatedAt
            FROM analysis_stock_fundamentals
            WHERE stock_ticker_id = @StockTickerId
            ORDER BY fiscal_year DESC, fiscal_quarter DESC
            LIMIT 1";

        return await connection.QueryFirstOrDefaultAsync<FundamentalsData>(sql, new { StockTickerId = stockTickerId });
    }

    /// <inheritdoc />
    public async Task<FundamentalsData?> GetByTickerAndQuarterAsync(int stockTickerId, int fiscalYear, string fiscalQuarter)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            SELECT
                id as Id,
                stock_ticker_id as StockTickerId,
                fiscal_year as FiscalYear,
                fiscal_quarter as FiscalQuarter,
                market_cap as MarketCap,
                pe_ratio as PeRatio,
                forward_pe as ForwardPe,
                peg_ratio as PegRatio,
                fcf_yield as FcfYield,
                roe as Roe,
                roic as Roic,
                operating_margin as OperatingMargin,
                revenue_ttm as RevenueTtm,
                revenue_growth_yoy as RevenueGrowthYoy,
                eps_ttm as EpsTtm,
                eps_growth_yoy as EpsGrowthYoy,
                debt_to_equity as DebtToEquity,
                interest_coverage as InterestCoverage,
                beta as Beta,
                free_cash_flow as FreeCashFlow,
                fcf_growth_yoy as FcfGrowthYoy,
                dividend_yield as DividendYield,
                dividend_per_share as DividendPerShare,
                data_source as DataSource,
                last_fetched_at as LastFetchedAt,
                created_at as CreatedAt,
                updated_at as UpdatedAt
            FROM analysis_stock_fundamentals
            WHERE stock_ticker_id = @StockTickerId
              AND fiscal_year = @FiscalYear
              AND fiscal_quarter = @FiscalQuarter";

        return await connection.QueryFirstOrDefaultAsync<FundamentalsData>(sql,
            new { StockTickerId = stockTickerId, FiscalYear = fiscalYear, FiscalQuarter = fiscalQuarter });
    }

    /// <inheritdoc />
    public async Task<FundamentalsData?> GetPreviousYearQuarterAsync(int stockTickerId, int fiscalYear, string fiscalQuarter)
    {
        return await GetByTickerAndQuarterAsync(stockTickerId, fiscalYear - 1, fiscalQuarter);
    }

    /// <inheritdoc />
    public async Task DeleteOldRecordsAsync(int stockTickerId, int keepQuarters)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            DELETE FROM analysis_stock_fundamentals
            WHERE stock_ticker_id = @StockTickerId
              AND id NOT IN (
                  SELECT id FROM analysis_stock_fundamentals
                  WHERE stock_ticker_id = @StockTickerId
                  ORDER BY fiscal_year DESC, fiscal_quarter DESC
                  LIMIT @KeepQuarters
              )";

        var deleted = await connection.ExecuteAsync(sql, new { StockTickerId = stockTickerId, KeepQuarters = keepQuarters });
        if (deleted > 0)
        {
            _logger.LogInformation("Deleted {Count} old fundamental records for ticker {TickerId}", deleted, stockTickerId);
        }
    }
}
