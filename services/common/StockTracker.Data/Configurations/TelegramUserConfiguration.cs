using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class TelegramUserConfiguration : IEntityTypeConfiguration<TelegramUser>
{
    public void Configure(EntityTypeBuilder<TelegramUser> builder)
    {
        builder.ToTable("telegram_users");
        builder.HasKey(e => e.Id);
        
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();
        
        builder.Property(e => e.TelegramUserId)
            .HasColumnName("telegram_user_id")
            .IsRequired();
        
        builder.Property(e => e.DisplayName)
            .HasColumnName("display_name")
            .HasMaxLength(255)
            .IsRequired();
        
        builder.Property(e => e.TelegramUsername)
            .HasColumnName("telegram_username")
            .HasMaxLength(32);
        
        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("now()");
        
        // Unique constraint on telegram_user_id
        builder.HasIndex(e => e.TelegramUserId)
            .IsUnique();
    }
}
