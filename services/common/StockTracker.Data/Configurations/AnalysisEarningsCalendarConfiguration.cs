using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class AnalysisEarningsCalendarConfiguration : IEntityTypeConfiguration<AnalysisEarningsCalendar>
{
    public void Configure(EntityTypeBuilder<AnalysisEarningsCalendar> builder)
    {
        builder.ToTable("analysis_earnings_calendar");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();

        builder.Property(e => e.StockTickerId)
            .HasColumnName("stock_ticker_id")
            .IsRequired();

        builder.Property(e => e.EarningsDate)
            .HasColumnName("earnings_date")
            .HasColumnType("date")
            .IsRequired();

        builder.Property(e => e.IsEstimate)
            .HasColumnName("is_estimate")
            .HasDefaultValue(true);

        // ===== Pre-Earnings Estimates =====
        builder.Property(e => e.EpsEstimate)
            .HasColumnName("eps_estimate")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.RevenueEstimate)
            .HasColumnName("revenue_estimate")
            .HasColumnType("decimal(18,2)");

        // ===== Post-Earnings Actuals =====
        builder.Property(e => e.EpsActual)
            .HasColumnName("eps_actual")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.RevenueActual)
            .HasColumnName("revenue_actual")
            .HasColumnType("decimal(18,2)");

        builder.Property(e => e.EpsSurprise)
            .HasColumnName("eps_surprise")
            .HasColumnType("decimal(10,4)");

        builder.Property(e => e.EpsSurprisePercent)
            .HasColumnName("eps_surprise_percent")
            .HasColumnType("decimal(8,4)");

        // ===== Metadata =====
        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.Property(e => e.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Unique constraint: one earnings entry per ticker per date
        builder.HasIndex(e => new { e.StockTickerId, e.EarningsDate })
            .IsUnique()
            .HasDatabaseName("ix_analysis_earnings_calendar_ticker_date_unique");

        // Performance indexes
        builder.HasIndex(e => e.EarningsDate)
            .HasDatabaseName("ix_analysis_earnings_calendar_date");

        builder.HasIndex(e => e.StockTickerId)
            .HasDatabaseName("ix_analysis_earnings_calendar_ticker");

        // Relationships
        builder.HasOne(e => e.StockTicker)
            .WithMany()
            .HasForeignKey(e => e.StockTickerId)
            .OnDelete(DeleteBehavior.Cascade)
            .HasConstraintName("analysis_earnings_calendar_stock_ticker_id_fkey");
    }
}
