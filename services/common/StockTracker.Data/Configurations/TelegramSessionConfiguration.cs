using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class TelegramSessionConfiguration : IEntityTypeConfiguration<TelegramSession>
{
    public void Configure(EntityTypeBuilder<TelegramSession> builder)
    {
        builder.ToTable("telegram_sessions");
        builder.HasKey(e => e.Id);
        
        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();
        
        builder.Property(e => e.UserId)
            .HasColumnName("user_id")
            .IsRequired();
        
        builder.Property(e => e.TelegramUserId)
            .HasColumnName("telegram_user_id")
            .IsRequired();
        
        builder.Property(e => e.TelegramChatId)
            .HasColumnName("telegram_chat_id")
            .IsRequired();
        
        builder.Property(e => e.ExpiresAt)
            .HasColumnName("expires_at")
            .HasColumnType("timestamp with time zone")
            .IsRequired();
        
        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("now()");
        
        builder.Property(e => e.LastActiveAt)
            .HasColumnName("last_active_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("now()");
        
        builder.Property(e => e.DeviceInfo)
            .HasColumnName("device_info")
            .HasColumnType("jsonb")
            .HasDefaultValueSql("'{}'::jsonb");
        
        builder.Property(e => e.SessionToken)
            .HasColumnName("session_token")
            .HasDefaultValueSql("gen_random_uuid()");
        
        builder.Property(e => e.CursorChatId)
            .HasColumnName("cursor_chat_id");
        
        // Foreign key relationship
        builder.HasOne(e => e.User)
            .WithMany(u => u.Sessions)
            .HasForeignKey(e => e.UserId)
            .OnDelete(DeleteBehavior.Cascade);
        
        // Index for cursor_chat_id (for --resume lookups)
        builder.HasIndex(e => e.CursorChatId)
            .HasFilter("cursor_chat_id IS NOT NULL");
    }
}
