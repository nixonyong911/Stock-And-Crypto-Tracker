import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { notifyError } from "../utils.js";

const composer = new Composer<TelegramBotContext>();

composer.command("digest", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  const accountResult = await ctx.gatewayAPI.db.query(
    "SELECT clerk_user_id FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2",
    [String(userId), "telegram"],
  );
  const clerkUserId = accountResult.rows[0]?.clerk_user_id as string | undefined;

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
        "/digest — Session load failed",
        "Something went wrong checking your session. Please try again.",
      );
    } else {
      await ctx.reply("Please login first with /login.", { parse_mode: "Markdown" });
    }
    return;
  }

  const db = ctx.gatewayAPI.db;
  const logger = ctx.gatewayAPI.logger;
  const rawArgs = (ctx.match?.toString() ?? "").trim().toLowerCase();

  try {
    if (rawArgs === "overview on") {
      await db.query(
        `INSERT INTO user_digest_preferences (clerk_user_id, daily_overview_enabled)
         VALUES ($1, true)
         ON CONFLICT (clerk_user_id) DO UPDATE SET daily_overview_enabled = true`,
        [clerkUserId],
      );
      await ctx.reply(
        "Daily market overview is **enabled**. You'll receive morning briefs and evening recaps.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    if (rawArgs === "overview off") {
      await db.query(
        `INSERT INTO user_digest_preferences (clerk_user_id, daily_overview_enabled)
         VALUES ($1, false)
         ON CONFLICT (clerk_user_id) DO UPDATE SET daily_overview_enabled = false`,
        [clerkUserId],
      );
      await ctx.reply(
        "Daily market overview is **paused**. Use `/digest overview on` to resume.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const prefResult = await db.query<{
      is_enabled: boolean;
      daily_overview_enabled: boolean;
    }>(
      `SELECT
         COALESCE(is_enabled, true) AS is_enabled,
         COALESCE(daily_overview_enabled, true) AS daily_overview_enabled
       FROM user_digest_preferences WHERE clerk_user_id = $1`,
      [clerkUserId],
    );
    const prefs = prefResult.rows[0];
    const smartDigestEnabled = prefs?.is_enabled ?? true;
    const overviewEnabled = prefs?.daily_overview_enabled ?? true;

    const lines = [
      "**Digest Preferences**",
      "",
      `**Smart Digest** (per-ticker signals): ${smartDigestEnabled ? "Enabled" : "Paused"}`,
      `**Daily Overview** (market briefs): ${overviewEnabled ? "Enabled" : "Paused"}`,
      "",
      "**Commands:**",
      "`/alert on|off` — Toggle per-ticker Smart Digest",
      "`/digest overview on|off` — Toggle daily market overview",
    ];

    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  } catch (err) {
    logger.error({ err, userId }, "Error in /digest command");
    await notifyError(ctx, err, "/digest — Command failed", "Something went wrong. Please try again later.");
  }
});

export default composer;
