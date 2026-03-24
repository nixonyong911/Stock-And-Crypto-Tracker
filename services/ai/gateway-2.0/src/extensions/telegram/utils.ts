import type { TelegramBotContext } from "./bot.js";

const MAX_MESSAGE_LENGTH = 4000;

export function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) { chunks.push(remaining); break; }
    let splitIndex = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH / 2) {
      splitIndex = remaining.lastIndexOf(' ', MAX_MESSAGE_LENGTH);
    }
    if (splitIndex === -1 || splitIndex < MAX_MESSAGE_LENGTH / 2) {
      splitIndex = MAX_MESSAGE_LENGTH;
    }
    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }
  return chunks;
}

/**
 * Notify the admin group about an error AND reply to the user.
 *
 * @param hint  Human-readable trigger context, e.g. "/add — Ticker API error"
 */
export async function notifyError(
  ctx: TelegramBotContext,
  error: unknown,
  hint: string,
  userReply = "⚠️ Something went wrong. Please try again.",
): Promise<void> {
  const from = ctx.from;
  const username = from?.username
    ? `@${from.username}`
    : from?.first_name ?? "N/A";
  const userMessage =
    ctx.message?.text ?? ctx.callbackQuery?.data ?? "N/A";

  ctx.gatewayAPI.errorNotifier
    ?.notify(error instanceof Error ? error : new Error(String(error ?? hint)), {
      type: `TelegramBotError: ${hint}`,
      user: username,
      userMessage,
      updateId: ctx.update?.update_id,
    })
    .catch(() => {});

  try {
    await ctx.reply(userReply);
  } catch {
    // Reply itself may fail (e.g. chat deleted)
  }
}
