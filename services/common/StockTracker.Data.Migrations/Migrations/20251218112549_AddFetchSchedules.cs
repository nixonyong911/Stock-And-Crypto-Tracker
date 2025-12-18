using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace StockTracker.Data.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddFetchSchedules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "fetch_schedules",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    data_source_id = table.Column<int>(type: "integer", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    schedule_time_utc = table.Column<TimeOnly>(type: "time", nullable: false, defaultValue: new TimeOnly(22, 0, 0)),
                    is_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    fetch_config = table.Column<string>(type: "jsonb", nullable: false, defaultValue: "{}"),
                    last_run_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    last_run_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    last_run_message = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fetch_schedules", x => x.id);
                    table.ForeignKey(
                        name: "FK_fetch_schedules_data_sources_data_source_id",
                        column: x => x.data_source_id,
                        principalTable: "data_sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

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

            migrationBuilder.CreateIndex(
                name: "ix_fetch_schedules_data_source_id",
                table: "fetch_schedules",
                column: "data_source_id");

            // Seed TwelveData schedule
            migrationBuilder.InsertData(
                table: "fetch_schedules",
                columns: new[] { "data_source_id", "name", "description", "schedule_time_utc", "is_enabled", "fetch_config" },
                values: new object[]
                {
                    1, // TwelveData data_source_id
                    "TwelveData Daily Stocks",
                    "Daily fetch of NASDAQ stock candles after market close",
                    new TimeOnly(22, 0, 0), // 10 PM UTC (5 PM ET)
                    true,
                    "{\"fetch_date\":\"yesterday\",\"interval\":\"15min\",\"output_size\":30,\"exchange\":\"NASDAQ\",\"timezone\":\"America/New_York\",\"rate_limit_delay_seconds\":8}"
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "fetch_schedules");

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7343), new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7347) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7348), new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7348) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 3,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7349), new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7350) });
        }
    }
}
