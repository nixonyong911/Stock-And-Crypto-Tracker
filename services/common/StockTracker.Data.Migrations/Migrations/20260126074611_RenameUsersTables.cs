using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StockTracker.Data.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class RenameUsersTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop FK constraints
            migrationBuilder.DropForeignKey(
                name: "subscriptions_user_id_fkey",
                table: "subscriptions");

            migrationBuilder.DropForeignKey(
                name: "link_tokens_user_id_fkey",
                table: "link_tokens");

            // Drop primary keys
            migrationBuilder.DropPrimaryKey(
                name: "PK_subscriptions",
                table: "subscriptions");

            migrationBuilder.DropPrimaryKey(
                name: "PK_subscription_history",
                table: "subscription_history");

            migrationBuilder.DropPrimaryKey(
                name: "PK_link_tokens",
                table: "link_tokens");

            // Rename tables
            migrationBuilder.RenameTable(
                name: "subscriptions",
                newName: "users_subscriptions");

            migrationBuilder.RenameTable(
                name: "subscription_history",
                newName: "users_subscription_history");

            migrationBuilder.RenameTable(
                name: "link_tokens",
                newName: "users_link_tokens");

            // Rename indexes for subscriptions
            migrationBuilder.RenameIndex(
                name: "IX_subscriptions_user_id",
                table: "users_subscriptions",
                newName: "IX_users_subscriptions_user_id");

            migrationBuilder.RenameIndex(
                name: "IX_subscriptions_stripe_subscription_id",
                table: "users_subscriptions",
                newName: "IX_users_subscriptions_stripe_subscription_id");

            // Rename indexes for subscription_history
            migrationBuilder.RenameIndex(
                name: "IX_subscription_history_user_id",
                table: "users_subscription_history",
                newName: "IX_users_subscription_history_user_id");

            migrationBuilder.RenameIndex(
                name: "IX_subscription_history_stripe_event_id",
                table: "users_subscription_history",
                newName: "IX_users_subscription_history_stripe_event_id");

            // Add primary keys with new names
            migrationBuilder.AddPrimaryKey(
                name: "PK_users_subscriptions",
                table: "users_subscriptions",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_users_subscription_history",
                table: "users_subscription_history",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_users_link_tokens",
                table: "users_link_tokens",
                column: "id");

            // Re-add FK constraints with new names
            migrationBuilder.AddForeignKey(
                name: "users_subscriptions_user_id_fkey",
                table: "users_subscriptions",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "users_link_tokens_user_id_fkey",
                table: "users_link_tokens",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop FK constraints
            migrationBuilder.DropForeignKey(
                name: "users_subscriptions_user_id_fkey",
                table: "users_subscriptions");

            migrationBuilder.DropForeignKey(
                name: "users_link_tokens_user_id_fkey",
                table: "users_link_tokens");

            // Drop primary keys
            migrationBuilder.DropPrimaryKey(
                name: "PK_users_subscriptions",
                table: "users_subscriptions");

            migrationBuilder.DropPrimaryKey(
                name: "PK_users_subscription_history",
                table: "users_subscription_history");

            migrationBuilder.DropPrimaryKey(
                name: "PK_users_link_tokens",
                table: "users_link_tokens");

            // Rename tables back
            migrationBuilder.RenameTable(
                name: "users_subscriptions",
                newName: "subscriptions");

            migrationBuilder.RenameTable(
                name: "users_subscription_history",
                newName: "subscription_history");

            migrationBuilder.RenameTable(
                name: "users_link_tokens",
                newName: "link_tokens");

            // Rename indexes back
            migrationBuilder.RenameIndex(
                name: "IX_users_subscriptions_user_id",
                table: "subscriptions",
                newName: "IX_subscriptions_user_id");

            migrationBuilder.RenameIndex(
                name: "IX_users_subscriptions_stripe_subscription_id",
                table: "subscriptions",
                newName: "IX_subscriptions_stripe_subscription_id");

            migrationBuilder.RenameIndex(
                name: "IX_users_subscription_history_user_id",
                table: "subscription_history",
                newName: "IX_subscription_history_user_id");

            migrationBuilder.RenameIndex(
                name: "IX_users_subscription_history_stripe_event_id",
                table: "subscription_history",
                newName: "IX_subscription_history_stripe_event_id");

            // Add primary keys with old names
            migrationBuilder.AddPrimaryKey(
                name: "PK_subscriptions",
                table: "subscriptions",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_subscription_history",
                table: "subscription_history",
                column: "id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_link_tokens",
                table: "link_tokens",
                column: "id");

            // Re-add FK constraints with old names
            migrationBuilder.AddForeignKey(
                name: "subscriptions_user_id_fkey",
                table: "subscriptions",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "link_tokens_user_id_fkey",
                table: "link_tokens",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
