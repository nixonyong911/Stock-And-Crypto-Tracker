using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace StockTracker.Data.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "data_sources",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    auth_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "api_key"),
                    api_key_encrypted = table.Column<string>(type: "text", nullable: true),
                    api_secret_encrypted = table.Column<string>(type: "text", nullable: true),
                    base_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    rate_limit_per_minute = table.Column<int>(type: "integer", nullable: true),
                    rate_limit_per_day = table.Column<int>(type: "integer", nullable: true),
                    timeout_seconds = table.Column<int>(type: "integer", nullable: false, defaultValue: 30),
                    retry_count = table.Column<int>(type: "integer", nullable: false, defaultValue: 3),
                    custom_headers = table.Column<string>(type: "jsonb", nullable: true),
                    oauth_token_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    oauth_client_id_encrypted = table.Column<string>(type: "text", nullable: true),
                    oauth_client_secret_encrypted = table.Column<string>(type: "text", nullable: true),
                    environment = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "prod"),
                    supports_stocks = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    supports_crypto = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_data_sources", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "universe",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    name = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_universe", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "crypto_tickers",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    universe_id = table.Column<int>(type: "integer", nullable: false),
                    symbol = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    slug = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crypto_tickers", x => x.id);
                    table.ForeignKey(
                        name: "FK_crypto_tickers_universe_universe_id",
                        column: x => x.universe_id,
                        principalTable: "universe",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "stock_tickers",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    universe_id = table.Column<int>(type: "integer", nullable: false),
                    symbol = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    exchange = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    currency = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "USD"),
                    is_active = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_tickers", x => x.id);
                    table.ForeignKey(
                        name: "FK_stock_tickers_universe_universe_id",
                        column: x => x.universe_id,
                        principalTable: "universe",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "crypto_prices",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    crypto_ticker_id = table.Column<int>(type: "integer", nullable: false),
                    data_source_id = table.Column<int>(type: "integer", nullable: false),
                    price_time = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    open_price = table.Column<decimal>(type: "numeric(24,12)", nullable: false),
                    high_price = table.Column<decimal>(type: "numeric(24,12)", nullable: false),
                    low_price = table.Column<decimal>(type: "numeric(24,12)", nullable: false),
                    close_price = table.Column<decimal>(type: "numeric(24,12)", nullable: false),
                    volume = table.Column<decimal>(type: "numeric(24,2)", nullable: false),
                    market_cap = table.Column<decimal>(type: "numeric(24,2)", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_crypto_prices", x => x.id);
                    table.ForeignKey(
                        name: "FK_crypto_prices_crypto_tickers_crypto_ticker_id",
                        column: x => x.crypto_ticker_id,
                        principalTable: "crypto_tickers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_crypto_prices_data_sources_data_source_id",
                        column: x => x.data_source_id,
                        principalTable: "data_sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "stock_prices",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    stock_ticker_id = table.Column<int>(type: "integer", nullable: false),
                    data_source_id = table.Column<int>(type: "integer", nullable: false),
                    price_time = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    open_price = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    high_price = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    low_price = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    close_price = table.Column<decimal>(type: "numeric(18,6)", nullable: false),
                    volume = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "CURRENT_TIMESTAMP")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_prices", x => x.id);
                    table.ForeignKey(
                        name: "FK_stock_prices_data_sources_data_source_id",
                        column: x => x.data_source_id,
                        principalTable: "data_sources",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_stock_prices_stock_tickers_stock_ticker_id",
                        column: x => x.stock_ticker_id,
                        principalTable: "stock_tickers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "universe",
                columns: new[] { "id", "created_at", "is_active", "name", "updated_at" },
                values: new object[,]
                {
                    { 1, new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7343), true, "stock", new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7347) },
                    { 2, new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7348), true, "etf", new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7348) },
                    { 3, new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7349), true, "crypto", new DateTime(2025, 12, 11, 17, 6, 36, 0, DateTimeKind.Utc).AddTicks(7350) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_crypto_prices_crypto_ticker_id_data_source_id_price_time",
                table: "crypto_prices",
                columns: new[] { "crypto_ticker_id", "data_source_id", "price_time" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_crypto_prices_crypto_ticker_id_price_time",
                table: "crypto_prices",
                columns: new[] { "crypto_ticker_id", "price_time" });

            migrationBuilder.CreateIndex(
                name: "IX_crypto_prices_data_source_id",
                table: "crypto_prices",
                column: "data_source_id");

            migrationBuilder.CreateIndex(
                name: "IX_crypto_prices_price_time",
                table: "crypto_prices",
                column: "price_time");

            migrationBuilder.CreateIndex(
                name: "IX_crypto_tickers_is_active",
                table: "crypto_tickers",
                column: "is_active",
                filter: "is_active = true");

            migrationBuilder.CreateIndex(
                name: "IX_crypto_tickers_slug",
                table: "crypto_tickers",
                column: "slug");

            migrationBuilder.CreateIndex(
                name: "IX_crypto_tickers_symbol",
                table: "crypto_tickers",
                column: "symbol",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_crypto_tickers_universe_id",
                table: "crypto_tickers",
                column: "universe_id");

            migrationBuilder.CreateIndex(
                name: "IX_data_sources_name",
                table: "data_sources",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_prices_data_source_id",
                table: "stock_prices",
                column: "data_source_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_prices_price_time",
                table: "stock_prices",
                column: "price_time");

            migrationBuilder.CreateIndex(
                name: "IX_stock_prices_stock_ticker_id_data_source_id_price_time",
                table: "stock_prices",
                columns: new[] { "stock_ticker_id", "data_source_id", "price_time" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_prices_stock_ticker_id_price_time",
                table: "stock_prices",
                columns: new[] { "stock_ticker_id", "price_time" });

            migrationBuilder.CreateIndex(
                name: "IX_stock_tickers_is_active",
                table: "stock_tickers",
                column: "is_active",
                filter: "is_active = true");

            migrationBuilder.CreateIndex(
                name: "IX_stock_tickers_symbol",
                table: "stock_tickers",
                column: "symbol",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_tickers_universe_id",
                table: "stock_tickers",
                column: "universe_id");

            migrationBuilder.CreateIndex(
                name: "IX_universe_name",
                table: "universe",
                column: "name",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "crypto_prices");

            migrationBuilder.DropTable(
                name: "stock_prices");

            migrationBuilder.DropTable(
                name: "crypto_tickers");

            migrationBuilder.DropTable(
                name: "data_sources");

            migrationBuilder.DropTable(
                name: "stock_tickers");

            migrationBuilder.DropTable(
                name: "universe");
        }
    }
}
