import type { GatewayConfig } from '../../config.js';

export interface TelegramConfig {
  botToken: string;
  webhookUrl: string;
  sessionExpiryDays: number;
}

export function getTelegramConfig(config: GatewayConfig): TelegramConfig {
  if (!config.telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required for Telegram extension');
  }
  if (!config.telegramWebhookURL) {
    throw new Error('TELEGRAM_WEBHOOK_URL is required for Telegram extension');
  }
  return {
    botToken: config.telegramBotToken,
    webhookUrl: config.telegramWebhookURL,
    sessionExpiryDays: config.sessionExpiryDays,
  };
}
