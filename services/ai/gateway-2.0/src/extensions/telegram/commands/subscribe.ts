import { Composer, InlineKeyboard } from "grammy";
import type { TelegramBotContext } from "../bot.js";

const PRICING_URL = "https://stockandcryptotracker.com/pricing";

const composer = new Composer<TelegramBotContext>();

composer.command("subscribe", async (ctx) => {
  const keyboard = new InlineKeyboard().url(
    "View Plans & Pricing",
    PRICING_URL
  );

  await ctx.reply(
    "Ready to upgrade? Choose your plan on our website:\n\n" +
      "**Free Trial** — 7 days of Pro, no credit card needed\n" +
      "**Subscribe** — Monthly or annual Pro plans",
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    }
  );
});

export default composer;
