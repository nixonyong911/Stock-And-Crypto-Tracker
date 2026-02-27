import { Composer } from "grammy";
import type { TelegramBotContext } from "../bot.js";
import { COMMAND_MENU } from "../../commands/menu.js";

const composer = new Composer<TelegramBotContext>();
composer.command(["help", "menu"], async (ctx) => {
  await ctx.reply(
    `📚 **Stock Tracker Bot Help**\n\n**Getting started:**\n1. Pair your account at stockandcryptotracker.com/pair\n2. Login with /login\n3. Ask questions about stocks and crypto!\n\n${COMMAND_MENU}\n\n**Tips:**\n• Use /refresh to start a fresh conversation\n• Wait for responses before sending more messages\n• Sessions expire after 7 days`,
    { parse_mode: "Markdown" }
  );
});
export default composer;
