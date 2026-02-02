using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class AnalysisStockFundamentalsConfiguration : IEntityTypeConfiguration<AnalysisStockFundamentals>
{
    public void Configure(EntityTypeBuilder<AnalysisStockFundamentals> builder)
    {
        builder.ToTable("analysis_stock_fundamentals");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();

        builder.Property(e => e.StockTickerId)
            .HasColumnName("stock_ticker_id")
            .IsRequired();

        // ===== Valuation Metrics =====
        builder.Property(e => e.MarketCap)
            .HasColumnName("market_cap")
            .HasColumnType("decimal(18,2)");

        builder.Property(e => e.PeRatio)
            .HasColumnName("pe_ratio")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.ForwardPe)
            .HasColumnName("forward_pe")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.PegRatio)
            .HasColumnName("peg_ratio")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.PriceToBook)
            .HasColumnName("price_to_book")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.PriceToSales)
            .HasColumnName("price_to_sales")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.EnterpriseValue)
            .HasColumnName("enterprise_value")
            .HasColumnType("decimal(18,2)");

        // ===== Financial Health =====
        builder.Property(e => e.EpsTtm)
            .HasColumnName("eps_ttm")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.RevenueTtm)
            .HasColumnName("revenue_ttm")
            .HasColumnType("decimal(18,2)");

        builder.Property(e => e.GrossMargin)
            .HasColumnName("gross_margin")
            .HasColumnType("decimal(8,4)");

        builder.Property(e => e.OperatingMargin)
            .HasColumnName("operating_margin")
            .HasColumnType("decimal(8,4)");

        builder.Property(e => e.ProfitMargin)
            .HasColumnName("profit_margin")
            .HasColumnType("decimal(8,4)");

        builder.Property(e => e.DebtToEquity)
            .HasColumnName("debt_to_equity")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.CurrentRatio)
            .HasColumnName("current_ratio")
            .HasColumnType("decimal(10,4)");

        // ===== Price Metrics =====
        builder.Property(e => e.FiftyTwoWeekHigh)
            .HasColumnName("fifty_two_week_high")
            .HasColumnType("decimal(12,4)");

        builder.Property(e => e.FiftyTwoWeekLow)
            .HasColumnName("fifty_two_week_low")
            .HasColumnType("decimal(12,4)");

        builder.Property(e => e.FiftyDayAverage)
            .HasColumnName("fifty_day_average")
            .HasColumnType("decimal(12,4)");

        builder.Property(e => e.TwoHundredDayAverage)
            .HasColumnName("two_hundred_day_average")
            .HasColumnType("decimal(12,4)");

        builder.Property(e => e.Beta)
            .HasColumnName("beta")
            .HasColumnType("decimal(8,4)");

        // ===== Dividend =====
        builder.Property(e => e.DividendYield)
            .HasColumnName("dividend_yield")
            .HasColumnType("decimal(8,4)");

        builder.Property(e => e.DividendRate)
            .HasColumnName("dividend_rate")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.ExDividendDate)
            .HasColumnName("ex_dividend_date")
            .HasColumnType("date");

        builder.Property(e => e.PayoutRatio)
            .HasColumnName("payout_ratio")
            .HasColumnType("decimal(8,4)");

        // ===== Analyst =====
        builder.Property(e => e.TargetMeanPrice)
            .HasColumnName("target_mean_price")
            .HasColumnType("decimal(12,4)");

        builder.Property(e => e.TargetHighPrice)
            .HasColumnName("target_high_price")
            .HasColumnType("decimal(12,4)");

        builder.Property(e => e.TargetLowPrice)
            .HasColumnName("target_low_price")
            .HasColumnType("decimal(12,4)");

        builder.Property(e => e.RecommendationMean)
            .HasColumnName("recommendation_mean")
            .HasColumnType("decimal(4,2)");

        builder.Property(e => e.NumberOfAnalysts)
            .HasColumnName("number_of_analysts");

        // ===== Metadata =====
        builder.Property(e => e.LastFetchedAt)
            .HasColumnName("last_fetched_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired()
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.Property(e => e.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Unique constraint: single row per ticker
        builder.HasIndex(e => e.StockTickerId)
            .IsUnique()
            .HasDatabaseName("ix_analysis_stock_fundamentals_ticker_unique");

        // Relationships
        builder.HasOne(e => e.StockTicker)
            .WithOne()
            .HasForeignKey<AnalysisStockFundamentals>(e => e.StockTickerId)
            .OnDelete(DeleteBehavior.Cascade)
            .HasConstraintName("analysis_stock_fundamentals_stock_ticker_id_fkey");
    }
}
