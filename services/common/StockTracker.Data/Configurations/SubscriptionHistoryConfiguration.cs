using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class SubscriptionHistoryConfiguration : IEntityTypeConfiguration<SubscriptionHistory>
{
    public void Configure(EntityTypeBuilder<SubscriptionHistory> builder)
    {
        builder.ToTable("subscription_history");
        builder.HasKey(e => e.Id);
        
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();
        
        builder.Property(e => e.UserId)
            .HasColumnName("user_id")
            .IsRequired();
        
        builder.Property(e => e.StripeSubscriptionId)
            .HasColumnName("stripe_subscription_id")
            .HasMaxLength(100);
        
        builder.Property(e => e.EventType)
            .HasColumnName("event_type")
            .HasMaxLength(50)
            .IsRequired();
        
        builder.Property(e => e.PreviousStatus)
            .HasColumnName("previous_status")
            .HasMaxLength(50);
        
        builder.Property(e => e.NewStatus)
            .HasColumnName("new_status")
            .HasMaxLength(50);
        
        builder.Property(e => e.Metadata)
            .HasColumnName("metadata")
            .HasColumnType("jsonb")
            .HasDefaultValueSql("'{}'::jsonb");
        
        builder.Property(e => e.StripeEventId)
            .HasColumnName("stripe_event_id")
            .HasMaxLength(100);
        
        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("now()");
        
        // Index for user lookups
        builder.HasIndex(e => e.UserId);
        
        // Index for stripe event deduplication
        builder.HasIndex(e => e.StripeEventId);
    }
}
