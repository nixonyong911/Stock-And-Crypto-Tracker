using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class CryptoPriceConfiguration : IEntityTypeConfiguration<CryptoPrice>
{
    public void Configure(EntityTypeBuilder<CryptoPrice> builder)
    {
        builder.ToTable("crypto_prices");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();

        builder.Property(e => e.CryptoTickerId)
            .HasColumnName("crypto_ticker_id")
            .IsRequired();

        builder.Property(e => e.DataSourceId)
            .HasColumnName("data_source_id")
            .IsRequired();

        builder.Property(e => e.PriceTime)
            .HasColumnName("price_time")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        // OHLC prices with 12 decimal precision (crypto needs more precision)
        builder.Property(e => e.OpenPrice)
            .HasColumnName("open_price")
            .HasColumnType("decimal(24,12)");

        builder.Property(e => e.HighPrice)
            .HasColumnName("high_price")
            .HasColumnType("decimal(24,12)");

        builder.Property(e => e.LowPrice)
            .HasColumnName("low_price")
            .HasColumnType("decimal(24,12)");

        builder.Property(e => e.ClosePrice)
            .HasColumnName("close_price")
            .HasColumnType("decimal(24,12)")
            .IsRequired();

        builder.Property(e => e.Volume)
            .HasColumnName("volume")
            .HasColumnType("decimal(24,2)");

        builder.Property(e => e.MarketCap)
            .HasColumnName("market_cap")
            .HasColumnType("decimal(24,2)");

        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Unique constraint: one candle per ticker per source per time
        builder.HasIndex(e => new { e.CryptoTickerId, e.DataSourceId, e.PriceTime })
            .IsUnique();

        // Performance indexes
        builder.HasIndex(e => e.PriceTime);
        builder.HasIndex(e => new { e.CryptoTickerId, e.PriceTime });

        // Relationships
        builder.HasOne(e => e.CryptoTicker)
            .WithMany(t => t.Prices)
            .HasForeignKey(e => e.CryptoTickerId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(e => e.DataSource)
            .WithMany(d => d.CryptoPrices)
            .HasForeignKey(e => e.DataSourceId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

