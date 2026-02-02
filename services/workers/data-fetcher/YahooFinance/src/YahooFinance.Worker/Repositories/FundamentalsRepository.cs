using Dapper;
using YahooFinance.Worker.Models;

namespace YahooFinance.Worker.Repositories;

public class FundamentalsRepository : IFundamentalsRepository
{
    private readonly IDbConnectionFactory _connectionFactory;

    public FundamentalsRepository(IDbConnectionFactory connectionFactory)
    {
        _connectionFactory = connectionFactory;
    }

    public async Task UpsertFundamentalsAsync(FundamentalsData data)
    {
        using var connection = _connectionFactory.CreateConnection();

        // INSERT ON CONFLICT (stock_ticker_id) DO UPDATE
        // Single row per ticker - always overwrites with latest data
        const string sql = @"
            INSERT INTO analysis_stock_fundamentals (
                stock_ticker_id, market_cap, pe_ratio, forward_pe, peg_ratio, price_to_book, price_to_sales,
                enterprise_value, eps_ttm, revenue_ttm, gross_margin, operating_margin, profit_margin,
                debt_to_equity, current_ratio, fifty_two_week_high, fifty_two_week_low, fifty_day_average,
                two_hundred_day_average, beta, dividend_yield, dividend_rate, ex_dividend_date, payout_ratio,
                target_mean_price, target_high_price, target_low_price, recommendation_mean, number_of_analysts,
                last_fetched_at, updated_at
            ) VALUES (
                @StockTickerId, @MarketCap, @PeRatio, @ForwardPe, @PegRatio, @PriceToBook, @PriceToSales,
                @EnterpriseValue, @EpsTtm, @RevenueTtm, @GrossMargin, @OperatingMargin, @ProfitMargin,
                @DebtToEquity, @CurrentRatio, @FiftyTwoWeekHigh, @FiftyTwoWeekLow, @FiftyDayAverage,
                @TwoHundredDayAverage, @Beta, @DividendYield, @DividendRate, @ExDividendDate, @PayoutRatio,
                @TargetMeanPrice, @TargetHighPrice, @TargetLowPrice, @RecommendationMean, @NumberOfAnalysts,
                @LastFetchedAt, CURRENT_TIMESTAMP
            )
            ON CONFLICT (stock_ticker_id) DO UPDATE SET
                market_cap = EXCLUDED.market_cap,
                pe_ratio = EXCLUDED.pe_ratio,
                forward_pe = EXCLUDED.forward_pe,
                peg_ratio = EXCLUDED.peg_ratio,
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
                fifty_two_week_high = EXCLUDED.fifty_two_week_high,
                fifty_two_week_low = EXCLUDED.fifty_two_week_low,
                fifty_day_average = EXCLUDED.fifty_day_average,
                two_hundred_day_average = EXCLUDED.two_hundred_day_average,
                beta = EXCLUDED.beta,
                dividend_yield = EXCLUDED.dividend_yield,
                dividend_rate = EXCLUDED.dividend_rate,
                ex_dividend_date = EXCLUDED.ex_dividend_date,
                payout_ratio = EXCLUDED.payout_ratio,
                target_mean_price = EXCLUDED.target_mean_price,
                target_high_price = EXCLUDED.target_high_price,
                target_low_price = EXCLUDED.target_low_price,
                recommendation_mean = EXCLUDED.recommendation_mean,
                number_of_analysts = EXCLUDED.number_of_analysts,
                last_fetched_at = EXCLUDED.last_fetched_at,
                updated_at = CURRENT_TIMESTAMP";

        // Convert DateOnly to DateTime for Dapper compatibility
        DateTime? exDividendDateTime = data.ExDividendDate.HasValue 
            ? data.ExDividendDate.Value.ToDateTime(TimeOnly.MinValue) 
            : null;

        await connection.ExecuteAsync(sql, new
        {
            data.StockTickerId,
            data.MarketCap,
            data.PeRatio,
            data.ForwardPe,
            data.PegRatio,
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
            data.FiftyTwoWeekHigh,
            data.FiftyTwoWeekLow,
            data.FiftyDayAverage,
            data.TwoHundredDayAverage,
            data.Beta,
            data.DividendYield,
            data.DividendRate,
            ExDividendDate = exDividendDateTime,
            data.PayoutRatio,
            data.TargetMeanPrice,
            data.TargetHighPrice,
            data.TargetLowPrice,
            data.RecommendationMean,
            data.NumberOfAnalysts,
            data.LastFetchedAt
        });
    }

    public async Task UpsertEarningsAsync(EarningsData data)
    {
        using var connection = _connectionFactory.CreateConnection();

        const string sql = @"
            INSERT INTO analysis_earnings_calendar (
                stock_ticker_id, earnings_date, is_estimate,
                eps_estimate, revenue_estimate,
                eps_actual, revenue_actual, eps_surprise, eps_surprise_percent,
                updated_at
            ) VALUES (
                @StockTickerId, @EarningsDate, @IsEstimate,
                @EpsEstimate, @RevenueEstimate,
                @EpsActual, @RevenueActual, @EpsSurprise, @EpsSurprisePercent,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (stock_ticker_id, earnings_date) DO UPDATE SET
                is_estimate = EXCLUDED.is_estimate,
                eps_estimate = EXCLUDED.eps_estimate,
                revenue_estimate = EXCLUDED.revenue_estimate,
                eps_actual = EXCLUDED.eps_actual,
                revenue_actual = EXCLUDED.revenue_actual,
                eps_surprise = EXCLUDED.eps_surprise,
                eps_surprise_percent = EXCLUDED.eps_surprise_percent,
                updated_at = CURRENT_TIMESTAMP";

        // Convert DateOnly to DateTime for Dapper compatibility
        var earningsDateTime = data.EarningsDate.ToDateTime(TimeOnly.MinValue);

        await connection.ExecuteAsync(sql, new
        {
            data.StockTickerId,
            EarningsDate = earningsDateTime,
            data.IsEstimate,
            data.EpsEstimate,
            data.RevenueEstimate,
            data.EpsActual,
            data.RevenueActual,
            data.EpsSurprise,
            data.EpsSurprisePercent
        });
    }
}
