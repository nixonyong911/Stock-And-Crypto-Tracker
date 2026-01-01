using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class AnalysisStockCandlestickPatternConfiguration : IEntityTypeConfiguration<AnalysisStockCandlestickPattern>
{
    public void Configure(EntityTypeBuilder<AnalysisStockCandlestickPattern> builder)
    {
        builder.ToTable("analysis_stock_candlestick_pattern");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();

        builder.Property(e => e.StockTickerId)
            .HasColumnName("stock_ticker_id")
            .IsRequired();

        builder.Property(e => e.AnalysisDate)
            .HasColumnName("analysis_date")
            .HasColumnType("date")
            .IsRequired();

        // Daily aggregated OHLCV
        builder.Property(e => e.DailyOpen)
            .HasColumnName("daily_open")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.DailyHigh)
            .HasColumnName("daily_high")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.DailyLow)
            .HasColumnName("daily_low")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.DailyClose)
            .HasColumnName("daily_close")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.DailyVolume)
            .HasColumnName("daily_volume");

        // Candle characteristics
        builder.Property(e => e.BodySize)
            .HasColumnName("body_size")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.RangeSize)
            .HasColumnName("range_size")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.UpperWick)
            .HasColumnName("upper_wick")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.LowerWick)
            .HasColumnName("lower_wick")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.IsBullish)
            .HasColumnName("is_bullish");

        // JSONB patterns array
        builder.Property(e => e.DetectedPatterns)
            .HasColumnName("detected_patterns")
            .HasColumnType("jsonb")
            .IsRequired()
            .HasDefaultValue("[]");

        // Metadata
        builder.Property(e => e.CandlesAggregated)
            .HasColumnName("candles_aggregated")
            .HasDefaultValue(0);

        builder.Property(e => e.AnalysisVersion)
            .HasColumnName("analysis_version")
            .HasMaxLength(20)
            .HasDefaultValue("1.0.0");

        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.Property(e => e.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Unique constraint: one analysis per ticker per date
        builder.HasIndex(e => new { e.StockTickerId, e.AnalysisDate })
            .IsUnique();

        // Performance indexes
        builder.HasIndex(e => e.AnalysisDate);
        builder.HasIndex(e => new { e.StockTickerId, e.AnalysisDate });
        
        // GIN index for JSONB - handled via raw SQL in migration
        // CREATE INDEX idx_analysis_candlestick_patterns ON analysis_stock_candlestick_pattern USING GIN(detected_patterns);

        // Relationships
        builder.HasOne(e => e.StockTicker)
            .WithMany(t => t.CandlestickPatterns)
            .HasForeignKey(e => e.StockTickerId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

