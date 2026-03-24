const TELEGRAM_API = "https://api.telegram.org";

export async function sendTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ERROR_CHAT_ID;

  if (!token || !chatId) {
    console.warn("TELEGRAM_BOT_TOKEN or TELEGRAM_ERROR_CHAT_ID not set, skipping notification");
    return;
  }

  try {
    const resp = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`Telegram API error ${resp.status}: ${body}`);
    }
  } catch (err) {
    console.error("Failed to send Telegram message:", (err as Error).message);
  }
}
