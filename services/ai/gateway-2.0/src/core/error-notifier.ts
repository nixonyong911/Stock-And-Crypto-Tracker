/**
 * Sends critical error notifications to a Telegram group.
 *
 * Rate-limited to avoid spam (max 5 messages per 60-second window).
 * Failures to send are logged to console only — never recursive.
 */

interface ErrorContext {
  type?: string;
  route?: string;
  method?: string;
  user?: string;
  userMessage?: string;
  updateId?: number;
}

interface ErrorNotifierDeps {
  botToken: string;
  chatId: string;
}

const MAX_MESSAGES_PER_WINDOW = 5;
const WINDOW_MS = 60_000;
const MAX_TELEGRAM_LENGTH = 4096;
const MAX_STACK_LINES = 5;

export class ErrorNotifier {
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly timestamps: number[] = [];

  constructor(deps: ErrorNotifierDeps) {
    this.botToken = deps.botToken;
    this.chatId = deps.chatId;
  }

  async notify(error: unknown, context?: ErrorContext): Promise<void> {
    if (!this.acquireSlot()) return;

    const message = this.formatMessage(error, context);

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: "HTML",
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[ErrorNotifier] Telegram API ${res.status}: ${body}`);
      }
    } catch (err) {
      console.error("[ErrorNotifier] Failed to send notification:", err);
    }
  }

  private acquireSlot(): boolean {
    const now = Date.now();
    while (this.timestamps.length > 0 && this.timestamps[0]! <= now - WINDOW_MS) {
      this.timestamps.shift();
    }
    if (this.timestamps.length >= MAX_MESSAGES_PER_WINDOW) return false;
    this.timestamps.push(now);
    return true;
  }

  private formatMessage(error: unknown, context?: ErrorContext): string {
    const err = error instanceof Error ? error : new Error(String(error));
    const stack = err.stack
      ?.split("\n")
      .slice(1, MAX_STACK_LINES + 1)
      .map((l) => l.trim())
      .join("\n") ?? "N/A";

    const user = context?.user ?? "N/A";
    const userMsg = context?.userMessage
      ? `"${context.userMessage.slice(0, 200)}"`
      : "N/A";
    const type = context?.type ?? "UnknownError";

    const routeInfo = context?.route
      ? `\n<b>Route:</b> ${context.method ?? "?"} ${context.route}`
      : "";

    const text = [
      "<b>--- GATEWAY ERROR ---</b>",
      `<b>User:</b> ${escapeHtml(user)}`,
      `<b>Message Sent:</b> ${escapeHtml(userMsg)}`,
      `<b>Type:</b> ${escapeHtml(type)}${routeInfo}`,
      `<b>Error:</b> ${escapeHtml(err.message)}`,
      `<b>Stack:</b>\n<pre>${escapeHtml(stack)}</pre>`,
      `<b>Time:</b> ${new Date().toISOString()}`,
    ].join("\n");

    return text.length > MAX_TELEGRAM_LENGTH
      ? text.slice(0, MAX_TELEGRAM_LENGTH - 3) + "..."
      : text;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
