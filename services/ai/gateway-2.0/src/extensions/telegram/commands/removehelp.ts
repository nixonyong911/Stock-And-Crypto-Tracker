import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { REMOVE_HELP_TEXT } from "../../commands/removehelp.js";

const composer = new Composer<TelegramBotContext>();
composer.command(["removehelp", "helpremove"], async (ctx) => {
  await ctx.reply(REMOVE_HELP_TEXT, { parse_mode: "Markdown" });
});
export default composer;
