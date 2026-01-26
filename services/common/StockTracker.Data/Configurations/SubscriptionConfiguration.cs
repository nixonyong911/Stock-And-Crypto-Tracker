using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class SubscriptionConfiguration : IEntityTypeConfiguration<Subscription>
{
    public void Configure(EntityTypeBuilder<Subscription> builder)
    {
        builder.ToTable("users_subscriptions");
        builder.HasKey(e => e.Id);
        
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();
        
        builder.Property(e => e.UserId)
            .HasColumnName("user_id")
            .IsRequired();
        
        builder.Property(e => e.StripeSubscriptionId)
            .HasColumnName("stripe_subscription_id")
            .HasMaxLength(100)
            .IsRequired();
        
        builder.Property(e => e.StripePriceId)
            .HasColumnName("stripe_price_id")
            .HasMaxLength(100)
            .IsRequired();
        
        builder.Property(e => e.StripeProductId)
            .HasColumnName("stripe_product_id")
            .HasMaxLength(100)
            .IsRequired();
        
        builder.Property(e => e.Status)
            .HasColumnName("status")
            .HasMaxLength(50)
            .IsRequired();
        
        builder.Property(e => e.Interval)
            .HasColumnName("interval")
            .HasMaxLength(20)
            .IsRequired();
        
        builder.Property(e => e.CurrentPeriodStart)
            .HasColumnName("current_period_start")
            .HasColumnType("timestamp with time zone")
            .IsRequired();
        
        builder.Property(e => e.CurrentPeriodEnd)
            .HasColumnName("current_period_end")
            .HasColumnType("timestamp with time zone")
            .IsRequired();
        
        builder.Property(e => e.CancelAtPeriodEnd)
            .HasColumnName("cancel_at_period_end")
            .HasDefaultValue(false);
        
        builder.Property(e => e.CanceledAt)
            .HasColumnName("canceled_at")
            .HasColumnType("timestamp with time zone");
        
        builder.Property(e => e.TrialStart)
            .HasColumnName("trial_start")
            .HasColumnType("timestamp with time zone");
        
        builder.Property(e => e.TrialEnd)
            .HasColumnName("trial_end")
            .HasColumnType("timestamp with time zone");
        
        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("now()");
        
        builder.Property(e => e.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("now()");
        
        // Unique constraint on stripe_subscription_id
        builder.HasIndex(e => e.StripeSubscriptionId)
            .IsUnique();
        
        // Index for user lookups
        builder.HasIndex(e => e.UserId);
    }
}
