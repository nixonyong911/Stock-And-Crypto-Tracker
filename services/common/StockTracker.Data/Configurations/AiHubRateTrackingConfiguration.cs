using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class AiHubRateTrackingConfiguration : IEntityTypeConfiguration<AiHubRateTracking>
{
    public void Configure(EntityTypeBuilder<AiHubRateTracking> builder)
    {
        builder.ToTable("ai_hub_rate_tracking");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(e => e.GoogleProjectId)
            .HasColumnName("google_project_id")
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(e => e.ModelFamily)
            .HasColumnName("model_family")
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(e => e.MinuteWindow)
            .HasColumnName("minute_window")
            .HasColumnType("timestamp with time zone")
            .IsRequired();

        builder.Property(e => e.RequestsCount)
            .HasColumnName("requests_count")
            .HasDefaultValue(0);

        builder.Property(e => e.TokensCount)
            .HasColumnName("tokens_count")
            .HasDefaultValue(0);

        builder.Property(e => e.PacificDate)
            .HasColumnName("pacific_date")
            .IsRequired();

        builder.Property(e => e.DailyRequests)
            .HasColumnName("daily_requests")
            .HasDefaultValue(0);

        builder.Property(e => e.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Unique constraint for upsert operations
        builder.HasIndex(e => new { e.GoogleProjectId, e.ModelFamily, e.MinuteWindow })
            .IsUnique();

        // Index for rate limit lookup queries
        builder.HasIndex(e => new { e.GoogleProjectId, e.ModelFamily, e.MinuteWindow })
            .IsDescending(false, false, true);
    }
}












