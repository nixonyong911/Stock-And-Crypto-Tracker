/**
 * One-shot script: renders a morning brief card with real data
 * and sends it to nixonyong911 (Telegram chat ID 6684507583).
 *
 * Usage: infisical run --env=prod -- npx tsx scripts/send-sample-card.ts
 *   (run from services/ai/gateway-2.0)
 */

import { renderCard, buildCardCaption, type CardData } from "../src/core/analysis/card-renderer.js";

const TELEGRAM_CHAT_ID = "6684507583";

async function main() {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    process.exit(1);
  }

  const cardData: CardData = {
    ticker: "AAPL",
    price: 212.48,
    changePercent: 1.4,
    change5dPercent: 4.9,
    signalLabel: "MOMENTUM CONTINUATION",
    signalSentiment: "bullish",
    headline: "Services revenue outlook revised upward.",
    narrative:
      `Price is **holding above the recent breakout zone** while services guidance ` +
      `remains stronger than expected. Follow-through looks constructive, but ` +
      `watch whether volume stays supportive through the next session.`,
    confidence: "Medium",
    risk: "Moderate",
    watchNext: "Volume follow-through \u00B7 sector reaction",
    timestamp: new Date("2026-04-21T07:30:00"),
  };

  console.log(`Rendering card for ${cardData.ticker} @ $${cardData.price}...`);
  const pngBuffer = await renderCard(cardData);
  console.log(`Card rendered: ${pngBuffer.length} bytes`);

  const caption = buildCardCaption(cardData);
  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID);
  formData.append("photo", new Blob([pngBuffer], { type: "image/png" }), "morning-brief.png");
  formData.append("caption", caption);

  console.log(`Sending to Telegram chat ${TELEGRAM_CHAT_ID}...`);
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: formData,
  });

  const json = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
  if (json.ok) {
    console.log("Card sent successfully!");
    console.log(`Message ID: ${json.result?.message_id}`);
  } else {
    console.error("Telegram API error:", JSON.stringify(json, null, 2));
    process.exit(1);
  }
}

main();
