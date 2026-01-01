using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace StockTracker.Data.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddCandlestickAnalysisTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "analysis_stock_candlestick_pattern",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    stock_ticker_id = table.Column<int>(type: "integer", nullable: false),
                    analysis_date = table.Column<DateOnly>(type: "date", nullable: false),
                    daily_open = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    daily_high = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    daily_low = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    daily_close = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    daily_volume = table.Column<long>(type: "bigint", nullable: true),
                    body_size = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    range_size = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    upper_wick = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    lower_wick = table.Column<decimal>(type: "numeric(18,6)", nullable: true),
                    is_bullish = table.Column<bool>(type: "boolean", nullable: true),
                    detected_patterns = table.Column<string>(type: "jsonb", nullable: false, defaultValue: "[]"),
                    candles_aggregated = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    analysis_version = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "1.0.0"),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_analysis_stock_candlestick_pattern", x => x.id);
                    table.ForeignKey(
                        name: "FK_analysis_stock_candlestick_pattern_stock_tickers_stock_tick~",
                        column: x => x.stock_ticker_id,
                        principalTable: "stock_tickers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 1, 10, 3, 36, 29, DateTimeKind.Utc).AddTicks(2021), new DateTime(2026, 1, 1, 10, 3, 36, 29, DateTimeKind.Utc).AddTicks(2023) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 1, 10, 3, 36, 29, DateTimeKind.Utc).AddTicks(2024), new DateTime(2026, 1, 1, 10, 3, 36, 29, DateTimeKind.Utc).AddTicks(2025) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 3,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 1, 10, 3, 36, 29, DateTimeKind.Utc).AddTicks(2026), new DateTime(2026, 1, 1, 10, 3, 36, 29, DateTimeKind.Utc).AddTicks(2026) });

            migrationBuilder.CreateIndex(
                name: "IX_analysis_stock_candlestick_pattern_analysis_date",
                table: "analysis_stock_candlestick_pattern",
                column: "analysis_date");

            migrationBuilder.CreateIndex(
                name: "IX_analysis_stock_candlestick_pattern_stock_ticker_id_analysis~",
                table: "analysis_stock_candlestick_pattern",
                columns: new[] { "stock_ticker_id", "analysis_date" },
                unique: true);

            // GIN index for JSONB pattern queries
            migrationBuilder.Sql(
                "CREATE INDEX idx_analysis_candlestick_patterns ON analysis_stock_candlestick_pattern USING GIN(detected_patterns);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop GIN index first
            migrationBuilder.Sql("DROP INDEX IF EXISTS idx_analysis_candlestick_patterns;");

            migrationBuilder.DropTable(
                name: "analysis_stock_candlestick_pattern");

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
        }
    }
}
