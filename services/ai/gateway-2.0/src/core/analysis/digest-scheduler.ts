import cron from "node-cron";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import type { ExtensionRegistry } from "../../extension/registry.js";
import { broadcastDailyOverview } from "./daily-overview-broadcaster.js";

export interface DigestSchedulerDeps {
  db: Pool;
  redis: Redis;
  extensions: ExtensionRegistry;
  log: FastifyBaseLogger;
}

export function startDigestScheduler(deps: DigestSchedulerDeps): { stop: () => void } {
  const { log } = deps;

  // Pre-market brief: 7:00 AM ET = 12:00 UTC (11:00 UTC during EDT)
  // Use 12:00 UTC to cover EST; during EDT it fires at 8 AM ET which is acceptable.
  const morningJob = cron.schedule("0 12 * * 1-5", () => {
    log.info("Digest scheduler: triggering morning brief");
    broadcastDailyOverview(deps, "pre_market").catch((err) => {
      log.error({ err }, "Failed to broadcast morning brief");
    });
  }, { timezone: "UTC" });

  // Post-close recap: 5:00 PM ET = 22:00 UTC (21:00 UTC during EDT)
  // Use 22:00 UTC to cover EST; during EDT it fires at 6 PM ET which is acceptable.
  const eveningJob = cron.schedule("0 22 * * 1-5", () => {
    log.info("Digest scheduler: triggering evening recap");
    broadcastDailyOverview(deps, "post_close").catch((err) => {
      log.error({ err }, "Failed to broadcast evening recap");
    });
  }, { timezone: "UTC" });

  log.info("Digest scheduler started (morning brief: 12:00 UTC Mon-Fri, evening recap: 22:00 UTC Mon-Fri)");

  return {
    stop: () => {
      morningJob.stop();
      eveningJob.stop();
      log.info("Digest scheduler stopped");
    },
  };
}
