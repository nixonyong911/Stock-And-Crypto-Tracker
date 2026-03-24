import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { notifyError } from "../utils.js";

const composer = new Composer<TelegramBotContext>();

composer.command(["alert", "track"], async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  const accountResult = await ctx.gatewayAPI.db.query(
    "SELECT clerk_user_id FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2",
    [String(userId), "telegram"],
  );
  const clerkUserId = accountResult.rows[0]?.clerk_user_id as
    | string
    | undefined;

  if (!clerkUserId) {
    await ctx.reply(
      "You need to pair your account first. Visit https://stockandcryptotracker.com/pair to get started.",
      { parse_mode: "Markdown" },
    );
    return;
  }

  if (!ctx.activeSession) {
    if (ctx.sessionLoadFailed) {
      await notifyError(
        ctx,
        new Error("Session middleware failed to load session"),
        "/alert — Session load failed",
        "Something went wrong checking your session. Please try again.",
      );
    } else {
      await ctx.reply("Please login first with /login.", {
        parse_mode: "Markdown",
      });
    }
    return;
  }

  const db = ctx.gatewayAPI.db;
  const logger = ctx.gatewayAPI.logger;
  const rawArgs = (ctx.match?.toString() ?? "").trim().toLowerCase();

  try {
    if (rawArgs === "on") {
      await db.query(
        `INSERT INTO user_digest_preferences (clerk_user_id, is_enabled, updated_at)
         VALUES ($1, true, NOW())
         ON CONFLICT (clerk_user_id) DO UPDATE SET is_enabled = true, updated_at = NOW()`,
        [clerkUserId],
      );
      await ctx.reply(
        "Smart Digest is **enabled**. You'll receive insights when meaningful signals are detected on your watchlist.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    if (rawArgs === "off") {
      await db.query(
        `INSERT INTO user_digest_preferences (clerk_user_id, is_enabled, updated_at)
         VALUES ($1, false, NOW())
         ON CONFLICT (clerk_user_id) DO UPDATE SET is_enabled = false, updated_at = NOW()`,
        [clerkUserId],
      );
      await ctx.reply(
        "Smart Digest is **paused**. Use `/alert on` to resume.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    // No args or unrecognized: show status
    const prefResult = await db.query<{ is_enabled: boolean }>(
      "SELECT is_enabled FROM user_digest_preferences WHERE clerk_user_id = $1",
      [clerkUserId],
    );
    const isEnabled = prefResult.rows[0]?.is_enabled ?? true;

    const watchCount = await db.query<{ cnt: number }>(
      "SELECT count(*)::int AS cnt FROM user_watchlist WHERE clerk_user_id = $1",
      [clerkUserId],
    );
    const tickerCount = watchCount.rows[0]?.cnt ?? 0;

    const statusText = isEnabled ? "Enabled" : "Paused";
    const lines = [
      `**Smart Digest:** ${statusText}`,
      `**Watchlist tickers:** ${tickerCount}`,
      "",
      "Use `/alert on` to enable or `/alert off` to pause.",
      "Add tickers with `/add <symbol>` to receive insights.",
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  } catch (err) {
    logger.error({ err, userId }, "Error in /alert command");
    await notifyError(ctx, err, "/alert — Command failed", "Something went wrong. Please try again later.");
  }
});

export default composer;
