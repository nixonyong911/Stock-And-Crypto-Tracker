/**
 * Thin Redis session cache helper for GatewaySession.
 */

import type { Redis } from "ioredis";
import type { GatewaySession } from "./manager.js";

export const SESSION_CACHE_PREFIX = "session:";

export function sessionCacheKey(
  channelType: string,
  platformUserId: string
): string {
  return `${SESSION_CACHE_PREFIX}${channelType}:${platformUserId}`;
}

export async function getSessionFromCache(
  redis: Redis,
  channelType: string,
  platformUserId: string
): Promise<GatewaySession | null> {
  try {
    const key = sessionCacheKey(channelType, platformUserId);
    const raw = await redis.get(key);
    if (raw == null) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      id: String(parsed.id),
      clerkUserId:
        parsed.clerkUserId != null ? String(parsed.clerkUserId) : null,
      channelType: String(parsed.channelType),
      platformUserId: String(parsed.platformUserId),
      platformChatId: String(parsed.platformChatId),
      cliSessionId: String(parsed.cliSessionId),
      tier: String(parsed.tier),
      deviceInfo:
        (parsed.deviceInfo as Record<string, unknown>) ?? null,
      createdAt: new Date(parsed.createdAt as string | number),
      expiresAt: new Date(parsed.expiresAt as string | number),
      lastActiveAt: new Date(parsed.lastActiveAt as string | number),
    };
  } catch {
    return null;
  }
}

export async function writeSessionToCache(
  redis: Redis,
  session: GatewaySession
): Promise<void> {
  try {
    const ttl = Math.floor(
      (session.expiresAt.getTime() - Date.now()) / 1000
    );
    if (ttl <= 0) return;

    const key = sessionCacheKey(session.channelType, session.platformUserId);
    const value = JSON.stringify(session);
    await redis.set(key, value, "EX", ttl);
  } catch {
    // Silently ignore
  }
}

export async function deleteSessionFromCache(
  redis: Redis,
  channelType: string,
  platformUserId: string
): Promise<void> {
  try {
    const key = sessionCacheKey(channelType, platformUserId);
    await redis.del(key);
  } catch {
    // Silently ignore
  }
}
