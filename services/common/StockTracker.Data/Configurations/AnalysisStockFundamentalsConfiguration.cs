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

        builder.Property(e => e.PriceToBook)
            .HasColumnName("price_to_book")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.PriceToSales)
            .HasColumnName("price_to_sales")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.EnterpriseValue)
            .HasColumnName("enterprise_value")
            .HasColumnType("decimal(18,2)");

        // ===== Per Share Data =====
        builder.Property(e => e.EpsTtm)
            .HasColumnName("eps_ttm")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.BookValuePerShare)
            .HasColumnName("book_value_per_share")
            .HasColumnType("decimal(18,4)");

        // ===== Revenue & Profitability =====
        builder.Property(e => e.RevenueTtm)
            .HasColumnName("revenue_ttm")
            .HasColumnType("decimal(18,2)");

        builder.Property(e => e.GrossMargin)
            .HasColumnName("gross_margin")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.OperatingMargin)
            .HasColumnName("operating_margin")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.ProfitMargin)
            .HasColumnName("profit_margin")
            .HasColumnType("decimal(10,4)");

        // ===== Returns =====
        builder.Property(e => e.ReturnOnEquity)
            .HasColumnName("return_on_equity")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.ReturnOnAssets)
            .HasColumnName("return_on_assets")
            .HasColumnType("decimal(10,4)");

        // ===== Financial Health =====
        builder.Property(e => e.DebtToEquity)
            .HasColumnName("debt_to_equity")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.CurrentRatio)
            .HasColumnName("current_ratio")
            .HasColumnType("decimal(10,4)");

        // ===== Dividends =====
        builder.Property(e => e.DividendYield)
            .HasColumnName("dividend_yield")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.PayoutRatio)
            .HasColumnName("payout_ratio")
            .HasColumnType("decimal(10,4)");

        // ===== Balance Sheet Summary =====
        builder.Property(e => e.TotalAssets)
            .HasColumnName("total_assets")
            .HasColumnType("decimal(18,2)");

        builder.Property(e => e.TotalLiabilities)
            .HasColumnName("total_liabilities")
            .HasColumnType("decimal(18,2)");

        builder.Property(e => e.TotalEquity)
            .HasColumnName("total_equity")
            .HasColumnType("decimal(18,2)");

        builder.Property(e => e.FreeCashFlow)
            .HasColumnName("free_cash_flow")
            .HasColumnType("decimal(18,2)");

        builder.Property(e => e.SharesOutstanding)
            .HasColumnName("shares_outstanding")
            .HasColumnType("bigint");

        // ===== Report Metadata =====
        builder.Property(e => e.FiscalYear)
            .HasColumnName("fiscal_year")
            .HasColumnType("integer");

        builder.Property(e => e.FiscalPeriod)
            .HasColumnName("fiscal_period")
            .HasMaxLength(10);

        builder.Property(e => e.ReportDate)
            .HasColumnName("report_date")
            .HasColumnType("date");

        builder.Property(e => e.DataSource)
            .HasColumnName("data_source")
            .HasMaxLength(50)
            .HasDefaultValue("simfin");

        // ===== Timestamps =====
        builder.Property(e => e.LastFetchedAt)
            .HasColumnName("last_fetched_at")
            .HasColumnType("timestamp with time zone")
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
