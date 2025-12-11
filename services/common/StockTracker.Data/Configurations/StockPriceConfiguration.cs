using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class StockPriceConfiguration : IEntityTypeConfiguration<StockPrice>
{
    public void Configure(EntityTypeBuilder<StockPrice> builder)
    {
        builder.ToTable("stock_prices");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();

        builder.Property(e => e.StockTickerId)
            .HasColumnName("stock_ticker_id")
            .IsRequired();

        builder.Property(e => e.DataSourceId)
            .HasColumnName("data_source_id")
            .IsRequired();

        builder.Property(e => e.PriceTime)
            .HasColumnName("price_time")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        // OHLC prices with 6 decimal precision
        builder.Property(e => e.OpenPrice)
            .HasColumnName("open_price")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.HighPrice)
            .HasColumnName("high_price")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.LowPrice)
            .HasColumnName("low_price")
            .HasColumnType("decimal(18,6)");

        builder.Property(e => e.ClosePrice)
            .HasColumnName("close_price")
            .HasColumnType("decimal(18,6)")
            .IsRequired();

        builder.Property(e => e.Volume)
            .HasColumnName("volume");

        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Unique constraint: one candle per ticker per source per time
        builder.HasIndex(e => new { e.StockTickerId, e.DataSourceId, e.PriceTime })
            .IsUnique();

        // Performance indexes
        builder.HasIndex(e => e.PriceTime);
        builder.HasIndex(e => new { e.StockTickerId, e.PriceTime });

        // Relationships
        builder.HasOne(e => e.StockTicker)
            .WithMany(t => t.Prices)
            .HasForeignKey(e => e.StockTickerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.DataSource)
            .WithMany(d => d.StockPrices)
            .HasForeignKey(e => e.DataSourceId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

