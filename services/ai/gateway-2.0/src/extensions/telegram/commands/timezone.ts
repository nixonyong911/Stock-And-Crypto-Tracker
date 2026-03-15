import { Composer, InlineKeyboard } from "grammy";
import type { TelegramBotContext } from "../bot.js";

const COMMON_TIMEZONES: ReadonlyArray<{ label: string; tz: string }> = [
  { label: "US Eastern", tz: "America/New_York" },
  { label: "US Central", tz: "America/Chicago" },
  { label: "US Pacific", tz: "America/Los_Angeles" },
  { label: "UK / London", tz: "Europe/London" },
  { label: "Europe / Berlin", tz: "Europe/Berlin" },
  { label: "Singapore", tz: "Asia/Singapore" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "Sydney", tz: "Australia/Sydney" },
  { label: "Auckland", tz: "Pacific/Auckland" },
  { label: "UTC", tz: "UTC" },
];

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const composer = new Composer<TelegramBotContext>();

composer.command("timezone", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply("Could not identify user.");
    return;
  }

  const db = ctx.gatewayAPI.db;
  const redis = ctx.gatewayAPI.redis;
  const logger = ctx.gatewayAPI.logger;
  const rawArgs = (ctx.match?.toString() ?? "").trim();

  const accountResult = await db.query(
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

  try {
    if (!rawArgs) {
      const current = await db.query<{ timezone: string }>(
        "SELECT timezone FROM users WHERE clerk_user_id = $1",
        [clerkUserId],
      );
      const tz = current.rows[0]?.timezone ?? "UTC";

      const keyboard = new InlineKeyboard();
      for (let i = 0; i < COMMON_TIMEZONES.length; i += 2) {
        const a = COMMON_TIMEZONES[i]!;
        const b = COMMON_TIMEZONES[i + 1];
        if (b) {
          keyboard.text(a.label, `tz:${a.tz}`).text(b.label, `tz:${b.tz}`).row();
        } else {
          keyboard.text(a.label, `tz:${a.tz}`).row();
        }
      }

      await ctx.reply(
        `**Your timezone:** ${tz}\n\nSelect a timezone below, or set it directly:\n\`/timezone America/New_York\``,
        { parse_mode: "Markdown", reply_markup: keyboard },
      );
      return;
    }

    if (!isValidTimezone(rawArgs)) {
      await ctx.reply(
        `"${rawArgs}" is not a valid timezone.\n\nUse an IANA timezone name like \`America/New_York\` or \`Pacific/Auckland\`.\nType \`/timezone\` to see common options.`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    await db.query(
      "UPDATE users SET timezone = $1, updated_at = NOW() WHERE clerk_user_id = $2",
      [rawArgs, clerkUserId],
    );
    await redis.del(`user:tz:${clerkUserId}`);

    const now = new Date();
    const localTime = now.toLocaleString("en-US", {
      timeZone: rawArgs,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    await ctx.reply(
      `Timezone set to **${rawArgs}**\nYour local time: ${localTime}`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    logger.error({ err, userId }, "Error in /timezone command");
    await ctx.reply("Something went wrong. Please try again later.");
  }
});

composer.callbackQuery(/^tz:(.+)$/, async (ctx) => {
  const match = ctx.callbackQuery.data.match(/^tz:(.+)$/);
  if (!match?.[1]) return;

  const tz = match[1];
  const userId = ctx.from?.id;
  if (!userId) return;

  const db = ctx.gatewayAPI.db;
  const cbRedis = ctx.gatewayAPI.redis;
  const logger = ctx.gatewayAPI.logger;

  try {
    const accountResult = await db.query(
      "SELECT clerk_user_id FROM channel_accounts WHERE platform_user_id = $1 AND channel_type = $2",
      [String(userId), "telegram"],
    );
    const clerkUserId = accountResult.rows[0]?.clerk_user_id as string | undefined;
    if (!clerkUserId) {
      await ctx.answerCallbackQuery({ text: "Account not paired." });
      return;
    }

    await db.query(
      "UPDATE users SET timezone = $1, updated_at = NOW() WHERE clerk_user_id = $2",
      [tz, clerkUserId],
    );
    await cbRedis.del(`user:tz:${clerkUserId}`);

    const now = new Date();
    const localTime = now.toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    await ctx.answerCallbackQuery({ text: `Timezone set to ${tz}` });
    await ctx.editMessageText(
      `Timezone set to **${tz}**\nYour local time: ${localTime}`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    logger.error({ err, userId }, "Error setting timezone via callback");
    await ctx.answerCallbackQuery({ text: "Something went wrong." });
  }
});

export default composer;
