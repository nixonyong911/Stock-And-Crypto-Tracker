import { Bot, type Context } from "grammy";
import type { GatewayAPI, GatewaySession } from "../../extension/types.js";
import type { TelegramConfig } from "./config.js";
import type { UserMessageQueue } from "./queue.js";

/** Extended session with display info from JOIN */
export interface TelegramSession extends GatewaySession {
  displayName: string | null;
  platformUsername: string | null;
}

/** Extended bot context with gateway integration */
export interface TelegramBotContext extends Context {
  gatewayAPI: GatewayAPI;
  telegramConfig: TelegramConfig;
  activeSession: TelegramSession | null;
  messageQueue: UserMessageQueue;
  /** Redis key used by dedup middleware; messages handler updates it on completion/failure. */
  dedupKey: string | null;
  sessionLoadFailed: boolean;
}

/** Create a new grammY bot instance */
export function createBot(token: string): Bot<TelegramBotContext> {
  return new Bot<TelegramBotContext>(token);
}
