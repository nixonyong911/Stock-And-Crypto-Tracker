using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace StockTracker.Data.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriptionTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "subscription_history",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    stripe_subscription_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    event_type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    previous_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    new_status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    metadata = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'::jsonb"),
                    stripe_event_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscription_history", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "subscriptions",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    user_id = table.Column<int>(type: "integer", nullable: false),
                    stripe_subscription_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    stripe_price_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    stripe_product_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    interval = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    current_period_start = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    current_period_end = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    cancel_at_period_end = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    canceled_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    trial_start = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    trial_end = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_subscriptions", x => x.id);
                });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 19, 9, 50, 8, 131, DateTimeKind.Utc).AddTicks(5727), new DateTime(2026, 1, 19, 9, 50, 8, 131, DateTimeKind.Utc).AddTicks(5729) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 19, 9, 50, 8, 131, DateTimeKind.Utc).AddTicks(5730), new DateTime(2026, 1, 19, 9, 50, 8, 131, DateTimeKind.Utc).AddTicks(5730) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 3,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 19, 9, 50, 8, 131, DateTimeKind.Utc).AddTicks(5731), new DateTime(2026, 1, 19, 9, 50, 8, 131, DateTimeKind.Utc).AddTicks(5732) });

            migrationBuilder.CreateIndex(
                name: "IX_subscription_history_stripe_event_id",
                table: "subscription_history",
                column: "stripe_event_id");

            migrationBuilder.CreateIndex(
                name: "IX_subscription_history_user_id",
                table: "subscription_history",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_subscriptions_stripe_subscription_id",
                table: "subscriptions",
                column: "stripe_subscription_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_subscriptions_user_id",
                table: "subscriptions",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "subscription_history");

            migrationBuilder.DropTable(
                name: "subscriptions");

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 1,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 12, 8, 44, 14, 753, DateTimeKind.Utc).AddTicks(381), new DateTime(2026, 1, 12, 8, 44, 14, 753, DateTimeKind.Utc).AddTicks(382) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 2,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 12, 8, 44, 14, 753, DateTimeKind.Utc).AddTicks(383), new DateTime(2026, 1, 12, 8, 44, 14, 753, DateTimeKind.Utc).AddTicks(384) });

            migrationBuilder.UpdateData(
                table: "universe",
                keyColumn: "id",
                keyValue: 3,
                columns: new[] { "created_at", "updated_at" },
                values: new object[] { new DateTime(2026, 1, 12, 8, 44, 14, 753, DateTimeKind.Utc).AddTicks(384), new DateTime(2026, 1, 12, 8, 44, 14, 753, DateTimeKind.Utc).AddTicks(385) });
        }
    }
}
