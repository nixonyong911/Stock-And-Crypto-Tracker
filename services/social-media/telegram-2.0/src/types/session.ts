/**
 * Database row types for Telegram bot
 */

export interface TelegramUserRow {
  id: number;
  telegram_user_id: number;
  display_name: string;
  telegram_username: string | null;
  created_at: Date;
}

export interface TelegramSessionRow {
  id: number;
  user_id: number;
  telegram_user_id: number;
  telegram_chat_id: number;
  expires_at: Date;
  created_at: Date;
  last_active_at: Date;
  device_info: Record<string, unknown>;
  session_token: string;
  cursor_chat_id: string | null;
  // Joined from telegram_users
  display_name?: string;
  telegram_username?: string | null;
}

export interface TelegramRateLimitRow {
  id: number;
  telegram_user_id: number;
  action_type: string;
  attempt_count: number;
  window_start: Date;
}

export interface DeviceInfo {
  language_code?: string | null;
  chat_type?: string | null;
  is_bot?: boolean | null;
}
