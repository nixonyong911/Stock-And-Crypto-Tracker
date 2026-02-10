import type { NextFunction } from 'grammy';
import type { TelegramBotContext } from '../bot.js';

export async function sessionMiddleware(ctx: TelegramBotContext, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    ctx.activeSession = null;
    return next();
  }

  try {
    // Query unified schema: channel_accounts + gateway_sessions
    const result = await ctx.gatewayAPI.db.query(
      `SELECT s.id, s.clerk_user_id, s.channel_type, s.platform_user_id, s.platform_chat_id,
              s.cli_session_id, s.tier, s.device_info, s.created_at, s.expires_at, s.last_active_at,
              ca.platform_username, ca.display_name
       FROM gateway_sessions s
       LEFT JOIN channel_accounts ca ON ca.platform_user_id = s.platform_user_id AND ca.channel_type = s.channel_type
       WHERE s.platform_user_id = $1 AND s.channel_type = 'telegram' AND s.expires_at > NOW()
       ORDER BY s.created_at DESC LIMIT 1`,
      [String(userId)]
    );

    if (result.rows[0]) {
      const row = result.rows[0];
      ctx.activeSession = {
        id: String(row.id),
        clerkUserId: row.clerk_user_id,
        channelType: row.channel_type,
        platformUserId: row.platform_user_id,
        platformChatId: row.platform_chat_id,
        cliSessionId: row.cli_session_id,
        tier: row.tier,
        deviceInfo: row.device_info,
        createdAt: new Date(row.created_at),
        expiresAt: new Date(row.expires_at),
        lastActiveAt: new Date(row.last_active_at),
        // Extra fields from join
        displayName: row.display_name,
        platformUsername: row.platform_username,
      };
    } else {
      ctx.activeSession = null;
    }
  } catch (err) {
    ctx.gatewayAPI.logger.error({ err, userId }, 'Failed to load session');
    ctx.activeSession = null;
  }

  return next();
}
