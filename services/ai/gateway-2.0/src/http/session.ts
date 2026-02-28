import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import type { SessionManager } from "../core/session/manager.js";
import { deleteSessionFromCache } from "../core/session/cache.js";

export function registerSessionRoutes(
  app: FastifyInstance,
  session: SessionManager,
  deps: { redis: Redis; db: Pool }
): void {
  // POST /api/v1/sessions
  app.post<{
    Body: {
      user_id: string;
      platform_chat_id: string;
      channel_type: string;
      clerk_user_id?: string;
    };
  }>("/api/v1/sessions", async (request, reply) => {
    const { user_id, platform_chat_id, channel_type, clerk_user_id } =
      request.body ?? {};
    if (!user_id || !channel_type)
      return reply
        .status(400)
        .send({ error: "user_id and channel_type are required" });

    try {
      const sess = await session.createSession({
        platformUserId: user_id,
        platformChatId: platform_chat_id ?? user_id,
        channelType: channel_type,
        clerkUserId: clerk_user_id,
      });
      return reply.status(201).send(sess);
    } catch (err) {
      app.log.error({ err, userId: user_id }, "Failed to create session");
      return reply.status(500).send({ error: "Failed to create session" });
    }
  });

  // GET /api/v1/sessions/:userId
  app.get<{
    Params: { userId: string };
    Querystring: { channel_type?: string };
  }>("/api/v1/sessions/:userId", async (request, reply) => {
    const channelType = request.query.channel_type ?? "telegram";
    const sess = await session.getActiveSession(
      request.params.userId,
      channelType
    );
    if (!sess)
      return reply.status(404).send({ error: "No active session found" });
    return reply.send(sess);
  });

  // DELETE /api/v1/sessions/:sessionId
  app.delete<{ Params: { sessionId: string } }>(
    "/api/v1/sessions/:sessionId",
    async (request, reply) => {
      try {
        await session.expireSession(request.params.sessionId);
        return reply.send({ status: "expired" });
      } catch (err) {
        app.log.error({ err }, "Failed to expire session");
        return reply.status(500).send({ error: "Failed to expire session" });
      }
    }
  );

  // POST /api/v1/sessions/invalidate-cache
  // Called by Supabase pg_net trigger when users.tier changes.
  app.post<{ Body: { clerk_user_id: string } }>(
    "/api/v1/sessions/invalidate-cache",
    async (request, reply) => {
      const clerkUserId = (request.body as Record<string, unknown>)
        ?.clerk_user_id;
      if (!clerkUserId || typeof clerkUserId !== "string") {
        return reply
          .status(400)
          .send({ error: "clerk_user_id is required" });
      }

      try {
        const result = await deps.db.query(
          "SELECT platform_user_id, channel_type FROM channel_accounts WHERE clerk_user_id = $1",
          [clerkUserId]
        );

        let invalidated = 0;
        for (const row of result.rows) {
          await deleteSessionFromCache(
            deps.redis,
            row.channel_type,
            row.platform_user_id
          );
          invalidated++;
        }

        app.log.info(
          { clerkUserId, invalidated },
          "Session cache invalidated for tier change"
        );
        return reply.send({ invalidated });
      } catch (err) {
        app.log.error(
          { err, clerkUserId },
          "Failed to invalidate session cache"
        );
        return reply
          .status(500)
          .send({ error: "Failed to invalidate session cache" });
      }
    }
  );
}
