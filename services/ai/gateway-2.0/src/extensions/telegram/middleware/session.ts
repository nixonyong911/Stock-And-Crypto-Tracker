import type { NextFunction } from 'grammy';
import type { TelegramBotContext, TelegramSession } from '../bot.js';
import { parseTier } from '../../../config.js';
import {
  getSessionFromCache,
  writeSessionToCache,
} from '../../../core/session/cache.js';

const DB_RETRY_DELAY_MS = 1_000;

export async function sessionMiddleware(ctx: TelegramBotContext, next: NextFunction): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!userId || !chatId) {
    ctx.activeSession = null;
    return next();
  }

  const platformUserId = String(userId);
  const redis = ctx.gatewayAPI.redis;

  // 1. Try Redis cache first
  try {
    const cached = await getSessionFromCache(redis, 'telegram', platformUserId);
    if (cached) {
      ctx.activeSession = {
        ...cached,
        tier: parseTier(cached.tier),
        displayName: null,
        platformUsername: null,
      };
      return next();
    }
  } catch {
    // Redis failure — fall through to DB
  }

  // 2. Cache miss — query DB with one retry on failure
  const session = await querySessionFromDb(ctx, platformUserId);

  if (session) {
    ctx.activeSession = session;
    writeSessionToCache(redis, session).catch(() => {});
  } else if (session === null && !ctx.sessionLoadFailed) {
    ctx.activeSession = null;
  }

  return next();
}

async function querySessionFromDb(
  ctx: TelegramBotContext,
  platformUserId: string,
): Promise<TelegramSession | null> {
  const query = `SELECT s.id, s.clerk_user_id, s.channel_type, s.platform_user_id, s.platform_chat_id,
            s.cli_session_id, s.tier, s.device_info, s.created_at, s.expires_at, s.last_active_at,
            ca.platform_username, ca.display_name
     FROM gateway_sessions s
     LEFT JOIN channel_accounts ca ON ca.platform_user_id = s.platform_user_id AND ca.channel_type = s.channel_type
     WHERE s.platform_user_id = $1 AND s.channel_type = 'telegram' AND s.expires_at > NOW()
     ORDER BY s.created_at DESC LIMIT 1`;
  const params = [platformUserId];

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await ctx.gatewayAPI.db.query(query, params);

      if (!result.rows[0]) {
        ctx.activeSession = null;
        return null;
      }

      const row = result.rows[0];
      return {
        id: String(row.id),
        clerkUserId: row.clerk_user_id,
        channelType: row.channel_type,
        platformUserId: row.platform_user_id,
        platformChatId: row.platform_chat_id,
        cliSessionId: row.cli_session_id,
        tier: parseTier(row.tier),
        deviceInfo: row.device_info,
        createdAt: new Date(row.created_at),
        expiresAt: new Date(row.expires_at),
        lastActiveAt: new Date(row.last_active_at),
        displayName: row.display_name,
        platformUsername: row.platform_username,
      };
    } catch (err) {
      if (attempt === 0) {
        ctx.gatewayAPI.logger.warn({ err, userId: platformUserId }, 'Session DB query failed, retrying in 1s');
        await new Promise((r) => setTimeout(r, DB_RETRY_DELAY_MS));
      } else {
        ctx.gatewayAPI.logger.error({ err, userId: platformUserId }, 'Session DB query failed after retry');
        ctx.activeSession = null;
        ctx.sessionLoadFailed = true;
        return null;
      }
    }
  }

  return null;
}
