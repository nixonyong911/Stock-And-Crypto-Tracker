using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class TelegramRateLimitConfiguration : IEntityTypeConfiguration<TelegramRateLimit>
{
    public void Configure(EntityTypeBuilder<TelegramRateLimit> builder)
    {
        builder.ToTable("telegram_rate_limits");
        builder.HasKey(e => e.Id);
        
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();
        
        builder.Property(e => e.TelegramUserId)
            .HasColumnName("telegram_user_id")
            .IsRequired();
        
        builder.Property(e => e.ActionType)
            .HasColumnName("action_type")
            .HasMaxLength(20)
            .IsRequired();
        
        builder.Property(e => e.AttemptCount)
            .HasColumnName("attempt_count")
            .HasDefaultValue(1);
        
        builder.Property(e => e.WindowStart)
            .HasColumnName("window_start")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("now()");
        
        // Unique constraint on (telegram_user_id, action_type)
        builder.HasIndex(e => new { e.TelegramUserId, e.ActionType })
            .IsUnique();
    }
}
