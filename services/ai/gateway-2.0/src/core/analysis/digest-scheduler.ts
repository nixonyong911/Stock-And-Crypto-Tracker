import cron from "node-cron";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../../extension/registry.js";
import { broadcastDailyOverview } from "./daily-overview-broadcaster.js";
import { runDailyMemoryMaintenance } from "./memory-curator.js";
import { processUnfilteredNews } from "./news-processor.js";

export interface DigestSchedulerDeps {
  db: Pool;
  redis: Redis;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
  curatorModel?: string;
  telegramNotify?: (message: string) => Promise<void>;
  curatorSequentialBatches?: boolean;
  curatorVerboseLogs?: boolean;
  curatorTelegramErrorMaxChars?: number;
  curatorLlmTimeoutMs?: number;
  curatorMaxStories?: number;
  curatorMaxStoriesPerBatch?: number;
}

export function startDigestScheduler(deps: DigestSchedulerDeps): { stop: () => void } {
  const {
    db, redis, log, curatorModel, telegramNotify,
    curatorSequentialBatches, curatorVerboseLogs, curatorTelegramErrorMaxChars,
    curatorLlmTimeoutMs, curatorMaxStories, curatorMaxStoriesPerBatch,
  } = deps;

  // Pre-market brief: 7:00 AM ET = 12:00 UTC (11:00 UTC during EDT)
  const morningJob = cron.schedule("0 12 * * 1-5", () => {
    log.info("Digest scheduler: triggering morning brief");
    broadcastDailyOverview(deps, "pre_market").catch((err) => {
      log.error({ err }, "Failed to broadcast morning brief");
    });
  }, { timezone: "UTC" });

  // Post-close recap: 5:00 PM ET = 22:00 UTC (21:00 UTC during EDT)
  const eveningJob = cron.schedule("0 22 * * 1-5", () => {
    log.info("Digest scheduler: triggering evening recap");
    broadcastDailyOverview(deps, "post_close").catch((err) => {
      log.error({ err }, "Failed to broadcast evening recap");
    });
  }, { timezone: "UTC" });

  // Daily memory maintenance: 04:00 UTC (off-peak, runs decay + archival + cleanup)
  const memoryMaintenanceJob = cron.schedule("0 4 * * *", () => {
    log.info("Digest scheduler: triggering daily memory maintenance");
    runDailyMemoryMaintenance(db, log).catch((err) => {
      log.error({ err }, "Failed to run daily memory maintenance");
    });
  }, { timezone: "UTC" });

  // News processing: every 6 hours (00:00/06:00/12:00/18:00 UTC)
  const newsProcessingJob = cron.schedule("0 */6 * * *", () => {
    log.info("Digest scheduler: triggering scheduled news processing");
    processUnfilteredNews({
      db, redis, log, curatorModel, telegramNotify,
      curatorSequentialBatches, curatorVerboseLogs, curatorTelegramErrorMaxChars,
      curatorLlmTimeoutMs, curatorMaxStories, curatorMaxStoriesPerBatch,
    }).catch((err) => {
      log.error({ err }, "Failed to run scheduled news processing");
    });
  }, { timezone: "UTC" });

  log.info(
    "Digest scheduler started (morning: 12:00 UTC M-F, evening: 22:00 UTC M-F, " +
    "memory maintenance: 04:00 UTC daily, news processing: every 6h UTC)",
  );

  return {
    stop: () => {
      morningJob.stop();
      eveningJob.stop();
      memoryMaintenanceJob.stop();
      newsProcessingJob.stop();
      log.info("Digest scheduler stopped");
    },
  };
}
