using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class StockTickerConfiguration : IEntityTypeConfiguration<StockTicker>
{
    public void Configure(EntityTypeBuilder<StockTicker> builder)
    {
        builder.ToTable("stock_tickers");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();

        builder.Property(e => e.UniverseId)
            .HasColumnName("universe_id")
            .IsRequired();

        builder.Property(e => e.Symbol)
            .HasColumnName("symbol")
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(e => e.Name)
            .HasColumnName("name")
            .HasMaxLength(255);

        builder.Property(e => e.Exchange)
            .HasColumnName("exchange")
            .HasMaxLength(50);

        builder.Property(e => e.Currency)
            .HasColumnName("currency")
            .HasMaxLength(10)
            .HasDefaultValue("USD");

        builder.Property(e => e.IsActive)
            .HasColumnName("is_active")
            .HasDefaultValue(true);

        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.Property(e => e.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Indexes
        builder.HasIndex(e => e.Symbol).IsUnique();
        builder.HasIndex(e => e.IsActive).HasFilter("is_active = true");

        // Relationships
        builder.HasOne(e => e.Universe)
            .WithMany(u => u.StockTickers)
            .HasForeignKey(e => e.UniverseId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

