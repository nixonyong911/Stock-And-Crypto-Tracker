/**
 * Daily Overview local preview / inspection.
 *
 * Loads an existing canonical overview artifact from `analysis_daily_overview`
 * and prints it to stdout. No Telegram send, no `user_recommendation_log`
 * write, no Redis mutation.
 *
 * Usage (from services/ai/gateway-2.0):
 *
 *   # load latest overview artifact
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-overview.ts --from-artifact latest
 *
 *   # load a specific artifact by overview_id
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-overview.ts --from-artifact <overview_id>
 *
 *   # filter by session type
 *   infisical run --env=dev -- \
 *     npx tsx scripts/preview-overview.ts --from-artifact latest --session pre_market
 *
 * Required env: DATABASE_URL (or DATABASE_URL_JS).
 */

import pg from "pg";
import {
  selectByOverviewId,
  listRecentOverviews,
} from "../src/core/analysis/daily-overview-repository.js";

const { Pool } = pg;

interface CliArgs {
  fromArtifact: string;
  sessionType: "pre_market" | "post_close" | null;
}

function parseArgs(argv: string[]): CliArgs {
  let fromArtifact = "";
  let sessionType: "pre_market" | "post_close" | null = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from-artifact" && argv[i + 1]) {
      fromArtifact = argv[++i]!;
    } else if (arg === "--session" && argv[i + 1]) {
      const val = argv[++i]!;
      if (val === "pre_market" || val === "post_close") {
        sessionType = val;
      } else {
        console.error(`Invalid --session value: ${val}. Use pre_market or post_close.`);
        process.exit(1);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: npx tsx scripts/preview-overview.ts --from-artifact <overview_id|latest> [--session <pre_market|post_close>]`);
      process.exit(0);
    }
  }

  if (!fromArtifact) {
    console.error("--from-artifact <overview_id|latest> is required");
    process.exit(1);
  }

  return { fromArtifact, sessionType };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const dbUrl = process.env["DATABASE_URL_JS"] ?? process.env["DATABASE_URL"];
  if (!dbUrl) {
    console.error("DATABASE_URL or DATABASE_URL_JS must be set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });

  try {
    if (args.fromArtifact === "latest") {
      const rows = await listRecentOverviews(pool, {
        sessionType: args.sessionType ?? undefined,
        limit: 1,
      });
      if (rows.length === 0) {
        console.error("No overview artifacts found");
        process.exit(1);
      }
      console.log(JSON.stringify(rows[0], null, 2));
    } else {
      const artifact = await selectByOverviewId(pool, args.fromArtifact);
      if (!artifact) {
        console.error(`No artifact found for overview_id: ${args.fromArtifact}`);
        process.exit(1);
      }
      console.log(JSON.stringify(artifact, null, 2));
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
