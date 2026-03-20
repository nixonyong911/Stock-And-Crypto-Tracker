import amqplib from "amqplib";
import type { ChannelModel, Channel, ConsumeMessage } from "amqplib";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../extension/registry.js";
import {
  processRecommendations,
  type ProcessRecommendationsDeps,
} from "../http/recommendations.js";

const QUEUE_NAME = "pipeline-analysis-complete";
const RECONNECT_DELAY_MS = 10_000;

export interface PipelineConsumerDeps {
  db: Pool;
  redis: Redis;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
}

interface PipelineMessage {
  assetType?: "stock" | "crypto";
}

export async function startPipelineConsumer(
  deps: PipelineConsumerDeps,
): Promise<{ close: () => Promise<void> }> {
  const { db, redis, extensions, log } = deps;
  const url =
    process.env["RABBITMQ_URL"] ??
    "amqp://stocktracker:guest@rabbitmq:5672";

  let conn: ChannelModel | null = null;
  let ch: Channel | null = null;
  let stopping = false;

  const recDeps: ProcessRecommendationsDeps = { db, redis, extensions, log };

  async function connect(): Promise<void> {
    if (stopping) return;

    try {
      conn = await amqplib.connect(url);
      ch = await conn.createChannel();

      await ch.assertQueue(QUEUE_NAME, { durable: true });
      await ch.prefetch(1);

      log.info({ queue: QUEUE_NAME }, "Pipeline consumer connected to RabbitMQ");

      await ch.consume(QUEUE_NAME, async (msg: ConsumeMessage | null) => {
        if (!msg || !ch) return;

        try {
          const payload: PipelineMessage = JSON.parse(
            msg.content.toString(),
          );
          log.info(
            { assetType: payload.assetType },
            "Processing pipeline.analysis.complete event",
          );

          const result = await processRecommendations(
            recDeps,
            payload.assetType,
          );
          log.info(result, "Pipeline event processed");
        } catch (err) {
          log.error({ err }, "Error processing pipeline message");
        } finally {
          ch?.ack(msg);
        }
      });

      conn.on("error", (err: Error) => {
        log.error({ err }, "RabbitMQ connection error");
      });

      conn.on("close", () => {
        if (!stopping) {
          log.warn("RabbitMQ connection closed, reconnecting…");
          setTimeout(() => void connect(), RECONNECT_DELAY_MS);
        }
      });
    } catch (err) {
      log.error({ err }, "Failed to connect to RabbitMQ, retrying…");
      if (!stopping) {
        setTimeout(() => void connect(), RECONNECT_DELAY_MS);
      }
    }
  }

  await connect();

  return {
    close: async () => {
      stopping = true;
      try {
        await ch?.close();
      } catch { /* already closed */ }
      try {
        await conn?.close();
      } catch { /* already closed */ }
    },
  };
}
