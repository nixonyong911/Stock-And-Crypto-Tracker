/**
 * One-shot script: renders a sample Smart Digest card and sends it via
 * Telegram to the user paired with a given Clerk user id.
 *
 * Usage (from services/ai/gateway-2.0):
 *   infisical run --env=dev -- npx tsx scripts/send-sample-card.ts
 *
 * Required env: TELEGRAM_BOT_TOKEN, plus DATABASE_URL (or DATABASE_URL_JS)
 * — unless SAMPLE_CHAT_ID is set, in which case the DB lookup is skipped.
 *
 * The recipient is resolved from `channel_accounts` (clerk_user_id →
 * platform_user_id where channel_type = 'telegram'). Override the Clerk
 * user via the SAMPLE_CLERK_USER_ID env var, or bypass the lookup entirely
 * by passing SAMPLE_CHAT_ID directly.
 */

import pg from "pg";
import { renderCard, buildCardCaption, type CardData } from "../src/core/analysis/card-renderer.js";

const DEFAULT_CLERK_USER_ID = "user_3AFKJYB2MSQhD6qwtyU9UAc9nyL";

const { Pool } = pg;

async function resolveTelegramChatId(
  pool: pg.Pool,
  clerkUserId: string,
): Promise<string> {
  try {
    const r = await pool.query<{ platform_user_id: string }>(
      `SELECT platform_user_id
         FROM channel_accounts
        WHERE clerk_user_id = $1
          AND channel_type = 'telegram'
        LIMIT 1`,
      [clerkUserId],
    );
    const id = r.rows[0]?.platform_user_id;
    if (!id) {
      throw new Error(
        `No Telegram pairing found in channel_accounts for clerk user ${clerkUserId}`,
      );
    }
    return id;
  } catch (err) {
    throw new Error(
      `Failed to resolve Telegram chat id for ${clerkUserId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function maskChatId(id: string): string {
  return id.length <= 4 ? "****" : `***${id.slice(-4)}`;
}

async function main(): Promise<void> {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  const overrideChatId = process.env["SAMPLE_CHAT_ID"];
  const databaseUrl =
    process.env["DATABASE_URL"] ?? process.env["DATABASE_URL_JS"];
  const clerkUserId = process.env["SAMPLE_CLERK_USER_ID"] ?? DEFAULT_CLERK_USER_ID;

  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    process.exit(1);
  }

  let chatId: string;
  let pool: pg.Pool | null = null;

  if (overrideChatId) {
    chatId = overrideChatId;
    console.log(
      `Using SAMPLE_CHAT_ID override (${maskChatId(chatId)}); skipping DB lookup`,
    );
  } else {
    if (!databaseUrl) {
      console.error(
        "DATABASE_URL (or DATABASE_URL_JS) not set, and no SAMPLE_CHAT_ID provided",
      );
      process.exit(1);
    }
    pool = new Pool({
      connectionString: databaseUrl,
      max: 2,
      connectionTimeoutMillis: 5_000,
    });
    console.log(`Resolving Telegram chat id for ${clerkUserId}...`);
    chatId = await resolveTelegramChatId(pool, clerkUserId);
    console.log(`Resolved chat id ${maskChatId(chatId)}`);
  }

  try {

    const cardData: CardData = {
      ticker: "AAPL",
      status: { label: "Watch zone", tone: "watch" },
      price: 270.95,
      changePercent: 0.42,
      confidence: "High",
      updatedAt: new Date("2026-05-08T07:32:00-04:00"),
      whatHappening:
        "Pullback into the prior breakout zone after a three-week run. " +
        "Momentum is cooling, but the trend structure is still intact and buyers stepped in at yesterday's close.",
      whatToWatch: { holdAbove: "256.8", breakBelowTarget: "248" },
      context:
        "Stronger services guidance at last week's analyst day; mega-cap tech is catching a bid as rate-cut odds firm.",
    };

    console.log(`Rendering card for ${cardData.ticker} @ $${cardData.price}...`);
    const pngBuffer = await renderCard(cardData);
    console.log(`Card rendered: ${pngBuffer.length} bytes`);

    const caption = buildCardCaption(cardData);
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append(
      "photo",
      new Blob([pngBuffer], { type: "image/png" }),
      "smart-digest.png",
    );
    formData.append("caption", caption);

    console.log(`Sending to Telegram chat ${maskChatId(chatId)}...`);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      body: formData,
    });

    const json = (await res.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };
    if (json.ok) {
      console.log("Card sent successfully!");
      console.log(`Message ID: ${json.result?.message_id}`);
    } else {
      console.error("Telegram API error:", JSON.stringify(json, null, 2));
      process.exit(1);
    }
  } finally {
    if (pool) {
      await pool.end().catch((err) => {
        console.warn("Failed to close pg pool cleanly:", err);
      });
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
