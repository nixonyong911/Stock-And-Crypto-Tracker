using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StockTracker.Data.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddAiHubTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ai_hub_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    model_id = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    caller_service = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    google_project_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    message_preview = table.Column<string>(type: "text", nullable: true),
                    response_preview = table.Column<string>(type: "text", nullable: true),
                    tokens_input = table.Column<int>(type: "integer", nullable: true),
                    tokens_output = table.Column<int>(type: "integer", nullable: true),
                    duration_ms = table.Column<int>(type: "integer", nullable: true),
                    retry_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    rate_limit_type = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    http_status_code = table.Column<int>(type: "integer", nullable: true),
                    error_message = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_hub_logs", x => x.id);
                    table.CheckConstraint("ai_hub_logs_status_check", "status IN ('success', 'rate_limited', 'server_error', 'unavailable', 'client_error', 'timeout')");
                });

            migrationBuilder.CreateTable(
                name: "ai_hub_rate_tracking",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    google_project_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    model_family = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    minute_window = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    requests_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    tokens_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    pacific_date = table.Column<DateOnly>(type: "date", nullable: false),
                    daily_requests = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ai_hub_rate_tracking", x => x.id);
                });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 25, 16, 10, 41, 573, DateTimeKind.Utc).AddTicks(9980), new DateTime(2025, 12, 25, 16, 10, 41, 573, DateTimeKind.Utc).AddTicks(9982) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 25, 16, 10, 41, 573, DateTimeKind.Utc).AddTicks(9983), new DateTime(2025, 12, 25, 16, 10, 41, 573, DateTimeKind.Utc).AddTicks(9983) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 3,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 25, 16, 10, 41, 573, DateTimeKind.Utc).AddTicks(9984), new DateTime(2025, 12, 25, 16, 10, 41, 573, DateTimeKind.Utc).AddTicks(9985) });

            migrationBuilder.CreateIndex(
                name: "IX_ai_hub_logs_created_at",
                table: "ai_hub_logs",
                column: "created_at",
                descending: new bool[0]);

            migrationBuilder.CreateIndex(
                name: "IX_ai_hub_logs_google_project_id",
                table: "ai_hub_logs",
                column: "google_project_id");

            migrationBuilder.CreateIndex(
                name: "IX_ai_hub_logs_model_id",
                table: "ai_hub_logs",
                column: "model_id");

            migrationBuilder.CreateIndex(
                name: "IX_ai_hub_logs_status",
                table: "ai_hub_logs",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "IX_ai_hub_rate_tracking_google_project_id_model_family_minute_~",
                table: "ai_hub_rate_tracking",
                columns: new[] { "google_project_id", "model_family", "minute_window" },
                unique: true,
                descending: new[] { false, false, true });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ai_hub_logs");

            migrationBuilder.DropTable(
                name: "ai_hub_rate_tracking");

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 18, 11, 25, 48, 938, DateTimeKind.Utc).AddTicks(9090), new DateTime(2025, 12, 18, 11, 25, 48, 938, DateTimeKind.Utc).AddTicks(9092) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 18, 11, 25, 48, 938, DateTimeKind.Utc).AddTicks(9094), new DateTime(2025, 12, 18, 11, 25, 48, 938, DateTimeKind.Utc).AddTicks(9094) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 3,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 18, 11, 25, 48, 938, DateTimeKind.Utc).AddTicks(9095), new DateTime(2025, 12, 18, 11, 25, 48, 938, DateTimeKind.Utc).AddTicks(9095) });
        }
    }
}
