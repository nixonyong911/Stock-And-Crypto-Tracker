using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using StockTracker.Data.Entities;

namespace StockTracker.Data.Configurations;

public class FetchScheduleConfiguration : IEntityTypeConfiguration<FetchSchedule>
{
    public void Configure(EntityTypeBuilder<FetchSchedule> builder)
    {
        builder.ToTable("fetch_schedules");

        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id)
            .HasColumnName("id")
            .UseIdentityAlwaysColumn();

        builder.Property(e => e.DataSourceId)
            .HasColumnName("data_source_id")
            .IsRequired();

        builder.Property(e => e.Name)
            .HasColumnName("name")
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(e => e.Description)
            .HasColumnName("description")
            .HasColumnType("text");

        // Scheduling
        builder.Property(e => e.ScheduleTimeUtc)
            .HasColumnName("schedule_time_utc")
            .HasColumnType("time")
            .HasDefaultValue(new TimeOnly(22, 0));

        builder.Property(e => e.IsEnabled)
            .HasColumnName("is_enabled")
            .HasDefaultValue(true);

        // Fetch parameters (JSONB)
        builder.Property(e => e.FetchConfig)
            .HasColumnName("fetch_config")
            .HasColumnType("jsonb")
            .HasDefaultValue("{}");

        // Run tracking
        builder.Property(e => e.LastRunAt)
            .HasColumnName("last_run_at")
            .HasColumnType("timestamp with time zone");

        builder.Property(e => e.LastRunStatus)
            .HasColumnName("last_run_status")
            .HasMaxLength(50);

        builder.Property(e => e.LastRunMessage)
            .HasColumnName("last_run_message")
            .HasColumnType("text");

        // Standard fields
        builder.Property(e => e.CreatedAt)
            .HasColumnName("created_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        builder.Property(e => e.UpdatedAt)
            .HasColumnName("updated_at")
            .HasColumnType("timestamp with time zone")
            .HasDefaultValueSql("CURRENT_TIMESTAMP");

        // Relationships
        builder.HasOne(e => e.DataSource)
            .WithMany()
            .HasForeignKey(e => e.DataSourceId)
            .HasConstraintName("FK_fetch_schedules_data_sources_data_source_id")
            .OnDelete(DeleteBehavior.Cascade);

        // Indexes
        builder.HasIndex(e => e.DataSourceId)
            .HasDatabaseName("ix_fetch_schedules_data_source_id");
    }
}














