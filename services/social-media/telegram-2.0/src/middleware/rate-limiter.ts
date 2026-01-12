import type { BotContext } from '../types/context.js';
import type { TelegramRateLimitRow } from '../types/session.js';
import { config } from '../config.js';
import { logger } from './logger.js';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMinutes?: number;
}

/**
 * Check rate limit for an action
 */
export async function checkRateLimit(
  ctx: BotContext,
  userId: number,
  action: 'register' | 'login'
): Promise<RateLimitResult> {
  const limits = config.rateLimits[action];
  const windowStart = new Date(Date.now() - limits.windowMinutes * 60 * 1000);

  try {
    const row = await ctx.db.fetchOne<TelegramRateLimitRow>(
      `SELECT * FROM telegram_rate_limits 
       WHERE telegram_user_id = $1 AND action_type = $2`,
      userId,
      action
    );

    if (!row) {
      // First attempt - create record
      await ctx.db.execute(
        `INSERT INTO telegram_rate_limits (telegram_user_id, action_type, attempt_count, window_start)
         VALUES ($1, $2, 1, NOW())`,
        userId,
        action
      );
      return { allowed: true };
    }

    const rowWindowStart = new Date(row.window_start);

    if (rowWindowStart < windowStart) {
      // Window expired - reset
      await ctx.db.execute(
        `UPDATE telegram_rate_limits 
         SET attempt_count = 1, window_start = NOW()
         WHERE telegram_user_id = $1 AND action_type = $2`,
        userId,
        action
      );
      return { allowed: true };
    }

    if (row.attempt_count >= limits.maxAttempts) {
      // Rate limit exceeded
      const timePassed = Date.now() - rowWindowStart.getTime();
      const retryAfter = limits.windowMinutes - Math.floor(timePassed / 60000);
      
      logger.warn({
        user_id: userId,
        action,
        attempt_count: row.attempt_count,
        retry_after_minutes: retryAfter,
      }, 'Rate limit exceeded');

      return { allowed: false, retryAfterMinutes: Math.max(1, retryAfter) };
    }

    // Increment attempt count
    await ctx.db.execute(
      `UPDATE telegram_rate_limits 
       SET attempt_count = attempt_count + 1
       WHERE telegram_user_id = $1 AND action_type = $2`,
      userId,
      action
    );

    return { allowed: true };
  } catch (error) {
    logger.error({
      error: (error as Error).message,
      user_id: userId,
      action,
    }, 'Rate limit check failed');
    
    // Allow on error to not block users
    return { allowed: true };
  }
}
