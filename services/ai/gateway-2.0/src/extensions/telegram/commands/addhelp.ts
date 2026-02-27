import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { ADD_HELP_TEXT } from "../../commands/addhelp.js";

const composer = new Composer<TelegramBotContext>();
composer.command(["addhelp", "helpadd"], async (ctx) => {
  await ctx.reply(ADD_HELP_TEXT, { parse_mode: "Markdown" });
});
export default composer;
