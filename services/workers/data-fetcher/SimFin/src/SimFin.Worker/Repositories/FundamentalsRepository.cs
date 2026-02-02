using Dapper;
using Microsoft.Extensions.Logging;
using SimFin.Worker.Models;

namespace SimFin.Worker.Repositories;

public class FundamentalsRepository : IFundamentalsRepository
{
    private readonly IDbConnectionFactory _connectionFactory;
    private readonly ILogger<FundamentalsRepository> _logger;

    public FundamentalsRepository(
        IDbConnectionFactory connectionFactory,
        ILogger<FundamentalsRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task UpsertFundamentalsAsync(FundamentalsData data)
    {
        try
        {
            using var connection = _connectionFactory.CreateConnection();

        // INSERT ON CONFLICT (stock_ticker_id) DO UPDATE
        // Single row per ticker - always overwrites with latest data
        const string sql = @"
            INSERT INTO analysis_stock_fundamentals (
                stock_ticker_id, market_cap, pe_ratio, price_to_book, price_to_sales,
                enterprise_value, eps_ttm, revenue_ttm, gross_margin, operating_margin, profit_margin,
                debt_to_equity, current_ratio, book_value_per_share, return_on_equity, return_on_assets,
                total_assets, total_liabilities, total_equity, free_cash_flow, shares_outstanding,
                dividend_yield, payout_ratio, fiscal_year, fiscal_period, report_date,
                data_source, last_fetched_at, updated_at
            ) VALUES (
                @StockTickerId, @MarketCap, @PeRatio, @PriceToBook, @PriceToSales,
                @EnterpriseValue, @EpsTtm, @RevenueTtm, @GrossMargin, @OperatingMargin, @ProfitMargin,
                @DebtToEquity, @CurrentRatio, @BookValuePerShare, @ReturnOnEquity, @ReturnOnAssets,
                @TotalAssets, @TotalLiabilities, @TotalEquity, @FreeCashFlow, @SharesOutstanding,
                @DividendYield, @PayoutRatio, @FiscalYear, @FiscalPeriod, @ReportDate,
                @DataSource, @LastFetchedAt, CURRENT_TIMESTAMP
            )
            ON CONFLICT (stock_ticker_id) DO UPDATE SET
                market_cap = EXCLUDED.market_cap,
                pe_ratio = EXCLUDED.pe_ratio,
                price_to_book = EXCLUDED.price_to_book,
                price_to_sales = EXCLUDED.price_to_sales,
                enterprise_value = EXCLUDED.enterprise_value,
                eps_ttm = EXCLUDED.eps_ttm,
                revenue_ttm = EXCLUDED.revenue_ttm,
                gross_margin = EXCLUDED.gross_margin,
                operating_margin = EXCLUDED.operating_margin,
                profit_margin = EXCLUDED.profit_margin,
                debt_to_equity = EXCLUDED.debt_to_equity,
                current_ratio = EXCLUDED.current_ratio,
                book_value_per_share = EXCLUDED.book_value_per_share,
                return_on_equity = EXCLUDED.return_on_equity,
                return_on_assets = EXCLUDED.return_on_assets,
                total_assets = EXCLUDED.total_assets,
                total_liabilities = EXCLUDED.total_liabilities,
                total_equity = EXCLUDED.total_equity,
                free_cash_flow = EXCLUDED.free_cash_flow,
                shares_outstanding = EXCLUDED.shares_outstanding,
                dividend_yield = EXCLUDED.dividend_yield,
                payout_ratio = EXCLUDED.payout_ratio,
                fiscal_year = EXCLUDED.fiscal_year,
                fiscal_period = EXCLUDED.fiscal_period,
                report_date = EXCLUDED.report_date,
                data_source = EXCLUDED.data_source,
                last_fetched_at = EXCLUDED.last_fetched_at,
                updated_at = CURRENT_TIMESTAMP";

        // Convert DateOnly to DateTime for Dapper compatibility
        DateTime? reportDateTime = data.ReportDate.HasValue 
            ? data.ReportDate.Value.ToDateTime(TimeOnly.MinValue) 
            : null;

        await connection.ExecuteAsync(sql, new
        {
            data.StockTickerId,
            data.MarketCap,
            data.PeRatio,
            data.PriceToBook,
            data.PriceToSales,
            data.EnterpriseValue,
            data.EpsTtm,
            data.RevenueTtm,
            data.GrossMargin,
            data.OperatingMargin,
            data.ProfitMargin,
            data.DebtToEquity,
            data.CurrentRatio,
            data.BookValuePerShare,
            data.ReturnOnEquity,
            data.ReturnOnAssets,
            data.TotalAssets,
            data.TotalLiabilities,
            data.TotalEquity,
            data.FreeCashFlow,
            data.SharesOutstanding,
            data.DividendYield,
            data.PayoutRatio,
            data.FiscalYear,
            data.FiscalPeriod,
            ReportDate = reportDateTime,
            data.DataSource,
            data.LastFetchedAt
        });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Database error upserting fundamentals for StockTickerId {StockTickerId}", data.StockTickerId);
            throw;
        }
    }
}
