using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class DataSourceConfiguration : IEntityTypeConfiguration<DataSource>
{
    public void Configure(EntityTypeBuilder<DataSource> builder)
    {
        builder.ToTable("data_sources");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();

        builder.Property(e => e.Name)
            .HasColumnName("name")
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(e => e.Description)
            .HasColumnName("description")
            .HasColumnType("text");

        // Authentication
        builder.Property(e => e.AuthType)
            .HasColumnName("auth_type")
            .HasMaxLength(50)
            .HasDefaultValue("api_key");

        builder.Property(e => e.ApiKeyEncrypted)
            .HasColumnName("api_key_encrypted")
            .HasColumnType("text");

        builder.Property(e => e.ApiSecretEncrypted)
            .HasColumnName("api_secret_encrypted")
            .HasColumnType("text");

        // Connection
        builder.Property(e => e.BaseUrl)
            .HasColumnName("base_url")
            .HasMaxLength(500);

        builder.Property(e => e.RateLimitPerMinute)
            .HasColumnName("rate_limit_per_minute");

        builder.Property(e => e.RateLimitPerDay)
            .HasColumnName("rate_limit_per_day");

        builder.Property(e => e.TimeoutSeconds)
            .HasColumnName("timeout_seconds")
            .HasDefaultValue(30);

        builder.Property(e => e.RetryCount)
            .HasColumnName("retry_count")
            .HasDefaultValue(3);

        builder.Property(e => e.CustomHeaders)
            .HasColumnName("custom_headers")
            .HasColumnType("jsonb");

        // OAuth
        builder.Property(e => e.OAuthTokenUrl)
            .HasColumnName("oauth_token_url")
            .HasMaxLength(500);

        builder.Property(e => e.OAuthClientIdEncrypted)
            .HasColumnName("oauth_client_id_encrypted")
            .HasColumnType("text");

        builder.Property(e => e.OAuthClientSecretEncrypted)
            .HasColumnName("oauth_client_secret_encrypted")
            .HasColumnType("text");

        // Metadata
        builder.Property(e => e.Environment)
            .HasColumnName("environment")
            .HasMaxLength(20)
            .HasDefaultValue("prod");

        builder.Property(e => e.SupportsStocks)
            .HasColumnName("supports_stocks")
            .HasDefaultValue(false);

        builder.Property(e => e.SupportsCrypto)
            .HasColumnName("supports_crypto")
            .HasDefaultValue(false);

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
        builder.HasIndex(e => e.Name).IsUnique();
    }
}

