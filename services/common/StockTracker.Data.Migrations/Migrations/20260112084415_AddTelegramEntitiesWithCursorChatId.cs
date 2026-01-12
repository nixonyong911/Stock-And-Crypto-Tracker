using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StockTracker.Data.Migrations.Migrations
{
    /// <inheritdoc />
    public partial class AddTelegramEntitiesWithCursorChatId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // NOTE: telegram_users, telegram_sessions, and telegram_rate_limits tables
            // already exist in the database (created via Supabase).
            // This migration ONLY adds the new cursor_chat_id column.

            migrationBuilder.AddColumn<Guid>(
                name: "cursor_chat_id",
                table: "telegram_sessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_telegram_sessions_cursor_chat_id",
                table: "telegram_sessions",
                column: "cursor_chat_id",
                filter: "cursor_chat_id IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_telegram_sessions_cursor_chat_id",
                table: "telegram_sessions");

            migrationBuilder.DropColumn(
                name: "cursor_chat_id",
                table: "telegram_sessions");
        }
    }
}
