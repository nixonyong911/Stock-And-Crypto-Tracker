/**
 * Slice 10: Legacy decontamination of analysis_market_memory.
 *
 * Thin CLI entry point. Core logic lives in
 * src/core/analysis/decontaminate-helpers.ts (under rootDir for tsc + tests).
 *
 * Usage:
 *   infisical run --env=prod -- npx tsx scripts/decontaminate-memory.ts \
 *     --dry-run --out tmp/validation/2026-05-12/slice10-dry-run-all/
 *
 *   infisical run --env=prod -- npx tsx scripts/decontaminate-memory.ts \
 *     --commit --out tmp/validation/2026-05-12/slice10-commit/
 *
 * Required env: DATABASE_URL (or DATABASE_URL_JS).
 */

import pg from "pg";
import { parseArgs, runDecontamination } from "../src/core/analysis/decontaminate-helpers.js";

const { Pool } = pg;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const connStr = process.env["DATABASE_URL_JS"] || process.env["DATABASE_URL"];
  if (!connStr) {
    console.error("DATABASE_URL or DATABASE_URL_JS is required.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: connStr });

  try {
    const entries = await runDecontamination({ db: pool, args });
    const applied = entries.filter((e) => e.action === "apply");
    console.log(
      `\nDone. ${applied.length}/${entries.length} rows ${args.commit ? "updated" : "would be updated"}.`,
    );
    console.log(`Artefacts: ${args.outDir}`);
  } catch (err) {
    console.error("Fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
