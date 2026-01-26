using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StockTracker.Data.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class RenameLookupTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop foreign keys referencing the old table names
            migrationBuilder.DropForeignKey(
                name: "FK_crypto_prices_data_sources_data_source_id",
                table: "crypto_prices");

            migrationBuilder.DropForeignKey(
                name: "FK_crypto_tickers_universe_universe_id",
                table: "crypto_tickers");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_prices_data_sources_data_source_id",
                table: "stock_prices");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_tickers_universe_universe_id",
                table: "stock_tickers");

            migrationBuilder.DropForeignKey(
                name: "worker_fetch_schedules_data_source_id_fkey",
                table: "worker_fetch_schedules");

            // Drop primary keys
            migrationBuilder.DropPrimaryKey(
                name: "PK_universe",
                table: "universe");

            migrationBuilder.DropPrimaryKey(
                name: "PK_data_sources",
                table: "data_sources");

            // Rename tables
            migrationBuilder.RenameTable(
                name: "universe",
                newName: "lookup_universe");

            migrationBuilder.RenameTable(
                name: "data_sources",
                newName: "lookup_data_sources");

            // Rename indexes
            migrationBuilder.RenameIndex(
                name: "IX_universe_name",
                table: "lookup_universe",
                newName: "IX_lookup_universe_name");

            migrationBuilder.RenameIndex(
                name: "IX_data_sources_name",
                table: "lookup_data_sources",
                newName: "IX_lookup_data_sources_name");

            // Add primary keys with new names
            migrationBuilder.AddPrimaryKey(
                name: "PK_lookup_universe",
                table: "lookup_universe",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_lookup_data_sources",
                table: "lookup_data_sources",
                column: "id");

            // Re-add foreign keys with new names
            migrationBuilder.AddForeignKey(
                name: "FK_crypto_prices_lookup_data_sources_data_source_id",
                table: "crypto_prices",
                column: "data_source_id",
                principalTable: "lookup_data_sources",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_crypto_tickers_lookup_universe_universe_id",
                table: "crypto_tickers",
                column: "universe_id",
                principalTable: "lookup_universe",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_prices_lookup_data_sources_data_source_id",
                table: "stock_prices",
                column: "data_source_id",
                principalTable: "lookup_data_sources",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_tickers_lookup_universe_universe_id",
                table: "stock_tickers",
                column: "universe_id",
                principalTable: "lookup_universe",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_worker_fetch_schedules_lookup_data_sources_data_source_id",
                table: "worker_fetch_schedules",
                column: "data_source_id",
                principalTable: "lookup_data_sources",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop foreign keys
            migrationBuilder.DropForeignKey(
                name: "FK_crypto_prices_lookup_data_sources_data_source_id",
                table: "crypto_prices");

            migrationBuilder.DropForeignKey(
                name: "FK_crypto_tickers_lookup_universe_universe_id",
                table: "crypto_tickers");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_prices_lookup_data_sources_data_source_id",
                table: "stock_prices");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_tickers_lookup_universe_universe_id",
                table: "stock_tickers");

            migrationBuilder.DropForeignKey(
                name: "FK_worker_fetch_schedules_lookup_data_sources_data_source_id",
                table: "worker_fetch_schedules");

            // Drop primary keys
            migrationBuilder.DropPrimaryKey(
                name: "PK_lookup_universe",
                table: "lookup_universe");

            migrationBuilder.DropPrimaryKey(
                name: "PK_lookup_data_sources",
                table: "lookup_data_sources");

            // Rename tables back
            migrationBuilder.RenameTable(
                name: "lookup_universe",
                newName: "universe");

            migrationBuilder.RenameTable(
                name: "lookup_data_sources",
                newName: "data_sources");

            // Rename indexes back
            migrationBuilder.RenameIndex(
                name: "IX_lookup_universe_name",
                table: "universe",
                newName: "IX_universe_name");

            migrationBuilder.RenameIndex(
                name: "IX_lookup_data_sources_name",
                table: "data_sources",
                newName: "IX_data_sources_name");

            // Add primary keys with old names
            migrationBuilder.AddPrimaryKey(
                name: "PK_universe",
                table: "universe",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_data_sources",
                table: "data_sources",
                column: "id");

            // Re-add foreign keys with old names
            migrationBuilder.AddForeignKey(
                name: "FK_crypto_prices_data_sources_data_source_id",
                table: "crypto_prices",
                column: "data_source_id",
                principalTable: "data_sources",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_crypto_tickers_universe_universe_id",
                table: "crypto_tickers",
                column: "universe_id",
                principalTable: "universe",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_prices_data_sources_data_source_id",
                table: "stock_prices",
                column: "data_source_id",
                principalTable: "data_sources",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_tickers_universe_universe_id",
                table: "stock_tickers",
                column: "universe_id",
                principalTable: "universe",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "worker_fetch_schedules_data_source_id_fkey",
                table: "worker_fetch_schedules",
                column: "data_source_id",
                principalTable: "data_sources",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
