/**
 * One-shot: for each ticker on a Clerk user's watchlist, run the *real*
 * Smart Digest pipeline (detectSignalsForTicker -> generateDigestBrief ->
 * renderCard) and DM the resulting PNG to that user's paired Telegram chat.
 *
 * This mirrors `/internal/force-send-digest` exactly (strict brief mode,
 * skip symbols with no signals) so the cards match what production would
 * produce — but runs the *local* gateway code so the new card design is
 * exercised before deploy.
 *
 * Usage (from services/ai/gateway-2.0):
 *   DATABASE_URL=... TELEGRAM_BOT_TOKEN=... \
 *     npx tsx scripts/send-nixon-digests.ts
 *
 * Env:
 *   TELEGRAM_BOT_TOKEN   (required) prod bot token
 *   DATABASE_URL         (required) points at the prod DB (e.g. via SSH tunnel)
 *   TARGET_CLERK_USER_ID (optional) defaults to nixonyong911
 */

import pg from "pg";
import {
  detectSignalsForTicker,
  buildNeutralPreviewSignal,
} from "../src/core/analysis/recommendation-engine.js";
import { generateDigestBrief } from "../src/core/analysis/digest-brief-generator.js";
import { renderCard, buildCardCaption } from "../src/core/analysis/card-renderer.js";

const { Pool } = pg;

const DEFAULT_CLERK_USER_ID = "user_3AeSTSagzcKoL1GvqaAvWtYvyPA"; // nixonyong911

interface WatchRow {
  ticker_symbol: string;
  asset_type: string;
}

function maskChatId(id: string): string {
  return id.length <= 4 ? "****" : `***${id.slice(-4)}`;
}

async function resolveChatId(pool: pg.Pool, clerkUserId: string): Promise<string> {
  const r = await pool.query<{ platform_user_id: string }>(
    `SELECT platform_user_id
       FROM channel_accounts
      WHERE clerk_user_id = $1 AND channel_type = 'telegram'
      LIMIT 1`,
    [clerkUserId],
  );
  const id = r.rows[0]?.platform_user_id;
  if (!id) throw new Error(`No Telegram pairing for ${clerkUserId}`);
  return id;
}

async function loadWatchlist(pool: pg.Pool, clerkUserId: string): Promise<WatchRow[]> {
  const r = await pool.query<WatchRow>(
    `SELECT ticker_symbol, asset_type
       FROM user_watchlist
      WHERE clerk_user_id = $1
      ORDER BY id`,
    [clerkUserId],
  );
  return r.rows;
}

async function sendCard(
  botToken: string,
  chatId: string,
  brief: Parameters<typeof buildCardCaption>[0],
  filename: string,
): Promise<number> {
  const pngBuffer = await renderCard(brief);
  const caption = buildCardCaption(brief);

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append(
    "photo",
    new Blob([new Uint8Array(pngBuffer)], { type: "image/png" }),
    filename,
  );
  formData.append("caption", caption);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: formData,
  });
  const json = (await res.json()) as {
    ok: boolean;
    result?: { message_id: number };
    description?: string;
  };
  if (!json.ok) throw new Error(`Telegram sendPhoto failed: ${JSON.stringify(json)}`);
  return json.result?.message_id ?? -1;
}

async function main(): Promise<void> {
  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  const databaseUrl = process.env["DATABASE_URL"] ?? process.env["DATABASE_URL_JS"];
  const clerkUserId = process.env["TARGET_CLERK_USER_ID"] ?? DEFAULT_CLERK_USER_ID;
  // PREVIEW_ALL=1 forces a representative card for *every* watchlist ticker,
  // synthesizing a neutral "levels snapshot" signal when none fired — for
  // visual review only. Default (unset) matches production: skip no-signal.
  const previewAll = process.env["PREVIEW_ALL"] === "1";

  if (!botToken) {
    console.error("TELEGRAM_BOT_TOKEN not set");
    process.exit(1);
  }
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 3,
    connectionTimeoutMillis: 8_000,
  });

  try {
    const chatId = await resolveChatId(pool, clerkUserId);
    console.log(`Recipient: ${clerkUserId} -> chat ${maskChatId(chatId)}`);

    const watch = await loadWatchlist(pool, clerkUserId);
    console.log(`Watchlist (${watch.length}): ${watch.map((w) => `${w.ticker_symbol}[${w.asset_type}]`).join(", ")}\n`);

    const sent: string[] = [];
    const skipped: string[] = [];

    for (let i = 0; i < watch.length; i++) {
      const w = watch[i]!;
      const symbol = w.ticker_symbol.toUpperCase();
      const assetType = w.asset_type === "crypto" ? "crypto" : "stock";
      const tag = `[${i + 1}/${watch.length}] ${symbol} (${assetType})`;

      try {
        const {
          signals,
          macroContext,
          newsOneLinerMap,
          memoryTextMap,
          analysisDateMap,
          analystMixMap,
          cardExtrasMap,
          contexts,
        } = await detectSignalsForTicker(pool, symbol, assetType);

        let effectiveSignals = signals;
        if (effectiveSignals.length === 0) {
          if (!previewAll) {
            console.log(`${tag} — no signals, skipping (matches prod)`);
            skipped.push(`${symbol} (no signals)`);
            continue;
          }
          const ctx =
            contexts?.find((c) => c.symbol.toUpperCase() === symbol) ??
            contexts?.[0];
          if (!ctx) {
            console.log(`${tag} — no signals & no context, skipping`);
            skipped.push(`${symbol} (no data)`);
            continue;
          }
          effectiveSignals = [buildNeutralPreviewSignal(ctx)];
          console.log(`${tag} — no signals, synthesizing neutral preview card`);
        }

        const brief = generateDigestBrief({
          signals: effectiveSignals,
          symbol,
          macroContext,
          newsOneLinerMap,
          memoryTextMap,
          analysisDateMap,
          analystMixMap,
          cardExtrasMap,
          mode: "strict",
        });

        const msgId = await sendCard(
          botToken,
          chatId,
          brief,
          `digest-${symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}.png`,
        );
        console.log(
          `${tag} — sent (msg ${msgId}) | ${brief.companyName ?? brief.ticker} ` +
            `$${brief.price} ${brief.changePercent >= 0 ? "+" : ""}${brief.changePercent.toFixed(2)}% ` +
            `| ${brief.stance5?.label ?? brief.status.label} | levels=${brief.levelsBar ? "yes" : "no"}`,
        );
        sent.push(symbol);
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`${tag} — ERROR: ${err instanceof Error ? err.message : String(err)}`);
        skipped.push(`${symbol} (error)`);
      }
    }

    console.log(`\nDone. Sent ${sent.length}: ${sent.join(", ") || "(none)"}`);
    if (skipped.length) console.log(`Skipped ${skipped.length}: ${skipped.join(", ")}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
