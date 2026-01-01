using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class AiHubLogConfiguration : IEntityTypeConfiguration<AiHubLog>
{
    public void Configure(EntityTypeBuilder<AiHubLog> builder)
    {
        builder.ToTable("ai_hub_logs");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .HasDefaultValueSql("gen_random_uuid()");

        builder.Property(e => e.RequestId)
            .HasColumnName("request_id")
            .IsRequired();

        builder.Property(e => e.ModelId)
            .HasColumnName("model_id")
            .HasMaxLength(150)
            .IsRequired();

        builder.Property(e => e.CallerService)
            .HasColumnName("caller_service")
            .HasMaxLength(100);

        builder.Property(e => e.GoogleProjectId)
            .HasColumnName("google_project_id")
            .HasMaxLength(100);

        builder.Property(e => e.MessagePreview)
            .HasColumnName("message_preview");

        builder.Property(e => e.ResponsePreview)
            .HasColumnName("response_preview");

        builder.Property(e => e.TokensInput)
            .HasColumnName("tokens_input");

        builder.Property(e => e.TokensOutput)
            .HasColumnName("tokens_output");

        builder.Property(e => e.DurationMs)
            .HasColumnName("duration_ms");

        builder.Property(e => e.RetryCount)
            .HasColumnName("retry_count")
            .HasDefaultValue(0);

        builder.Property(e => e.RateLimitType)
            .HasColumnName("rate_limit_type")
            .HasMaxLength(10);

        builder.Property(e => e.Status)
            .HasColumnName("status")
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(e => e.HttpStatusCode)
            .HasColumnName("http_status_code");

        builder.Property(e => e.ErrorMessage)
            .HasColumnName("error_message");

        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Check constraint for valid status values
        builder.HasCheckConstraint(
            "ai_hub_logs_status_check",
            "status IN ('success', 'rate_limited', 'server_error', 'unavailable', 'client_error', 'timeout')"
        );

        // Indexes for common queries
        builder.HasIndex(e => e.CreatedAt)
            .IsDescending();

        builder.HasIndex(e => e.ModelId);

        builder.HasIndex(e => e.Status);

        builder.HasIndex(e => e.GoogleProjectId);
    }
}










