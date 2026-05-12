/**
 * Slice 10: Legacy decontamination of analysis_market_memory.
 *
 * One-shot script that re-sanitizes all active/fading rows using the
 * established Slice 8 sanitizer + Slice 8C/9 primary coherence guard.
 *
 * Modes:
 *   --dry-run   (default) Read-only pass; writes diff.jsonl + summary.md.
 *   --commit    Apply changes in a single transaction; writes diff.jsonl +
 *               summary.md + revert.sql.
 *
 * Safety:
 *   - Master kill switch (MEMORY_CURATOR_SANITIZE_BROAD_TICKERS=false) aborts.
 *   - Sanitizer-invent assertion: no ticker may appear in kept/inferred that
 *     was not in the original affected_tickers.
 *   - Erasure-rate threshold: commit aborts if >10% of rows would have
 *     kept=[] (configurable via --max-erasure-rate).
 *   - revert.sql is written BEFORE COMMIT so it survives downstream failures.
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

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  sanitizeAffectedTickers,
  getActiveBroadSet,
  getSanitizeBroadTickersEnabled,
} from "../src/core/analysis/ticker-sanitizer.js";

const { Pool } = pg;

// ── Types ─────────────────────────────────────────────────────────────

export interface MemoryRow {
  id: number;
  theme_id: string;
  theme: string;
  status: string;
  prompt_version: string | null;
  affected_tickers: string[];
  tickers_inferred: string[];
  primary_ticker: string | null;
  primary_ticker_source: string | null;
  source_batch_ids: string[];
}

export interface StoryRow {
  affected_tickers: string[];
}

export type EvidenceMode =
  | "evidenced"
  | "zero_evidence_all_broad"
  | "zero_evidence_mixed";

export interface DiffEntry {
  theme_id: string;
  id: number;
  theme: string;
  status: string;
  prompt_version: string | null;
  before: {
    affected_tickers: string[];
    tickers_inferred: string[];
    primary_ticker: string | null;
    primary_ticker_source: string | null;
  };
  after: {
    affected_tickers: string[];
    tickers_inferred: string[];
    primary_ticker: string | null;
    primary_ticker_source: string | null;
  };
  action: "apply" | "skip";
  reason: string | null;
  evidence_story_count: number;
  evidence_mode: EvidenceMode;
}

export interface CliArgs {
  commit: boolean;
  themeId: string | null;
  limit: number | null;
  outDir: string;
  maxErasureRate: number;
}

// ── CLI arg parsing ───────────────────────────────────────────────────

export function parseArgs(argv: string[]): CliArgs {
  let commit = false;
  let themeId: string | null = null;
  let limit: number | null = null;
  let outDir = "tmp/slice10-output";
  let maxErasureRate = 0.1;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") {
      commit = true;
    } else if (a === "--dry-run") {
      commit = false;
    } else if (a === "--theme-id" && argv[i + 1]) {
      themeId = argv[i + 1]!;
      i++;
    } else if (a === "--limit" && argv[i + 1]) {
      limit = parseInt(argv[i + 1]!, 10);
      if (Number.isNaN(limit) || limit <= 0) {
        throw new Error(`--limit must be a positive integer, got: ${argv[i + 1]}`);
      }
      i++;
    } else if (a === "--out" && argv[i + 1]) {
      outDir = argv[i + 1]!;
      i++;
    } else if (a === "--max-erasure-rate" && argv[i + 1]) {
      maxErasureRate = parseFloat(argv[i + 1]!);
      if (Number.isNaN(maxErasureRate) || maxErasureRate < 0 || maxErasureRate > 1) {
        throw new Error(`--max-erasure-rate must be between 0 and 1, got: ${argv[i + 1]}`);
      }
      i++;
    }
  }

  return { commit, themeId, limit, outDir, maxErasureRate };
}

// ── Core per-row logic (pure, exported for testing) ───────────────────

export interface RowDecontaminationResult {
  action: "apply" | "skip";
  reason?: string;
  diff?: {
    kept: string[];
    inferred: string[];
    nullPrimary: boolean;
  };
  evidenceMode: EvidenceMode;
}

export function computeRowDecontamination(
  row: Pick<MemoryRow, "affected_tickers" | "primary_ticker" | "primary_ticker_source">,
  stories: ReadonlyArray<{ affected_tickers: ReadonlyArray<string> }>,
): RowDecontaminationResult {
  const storyProj = stories.map((s) => ({ affected_tickers: s.affected_tickers }));
  const san = sanitizeAffectedTickers(row.affected_tickers, storyProj);

  const originalUpper = new Set(
    row.affected_tickers
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toUpperCase()),
  );

  for (const t of san.kept) {
    if (!originalUpper.has(t)) {
      throw new Error(
        `Sanitizer-invent assertion: ticker "${t}" in kept is not in original affected_tickers [${[...originalUpper].join(",")}]`,
      );
    }
  }
  for (const t of san.inferred) {
    if (!originalUpper.has(t)) {
      throw new Error(
        `Sanitizer-invent assertion: ticker "${t}" in inferred is not in original affected_tickers [${[...originalUpper].join(",")}]`,
      );
    }
  }

  const broadSet = getActiveBroadSet();
  const hadNonBroad = row.affected_tickers.some(
    (t) => !broadSet.has(t.toUpperCase()),
  );
  const erasureTriggered = san.kept.length === 0 && hadNonBroad;

  if (erasureTriggered) {
    return { action: "skip", reason: "erasure", evidenceMode: classifyEvidenceMode(stories, originalUpper) };
  }

  const sortedKept = [...san.kept].sort();
  const sortedExisting = [...originalUpper].sort();
  const isIdentity =
    san.inferred.length === 0 &&
    sortedKept.length === sortedExisting.length &&
    sortedKept.every((t, i) => t === sortedExisting[i]);

  if (isIdentity) {
    return { action: "skip", reason: "identity", evidenceMode: classifyEvidenceMode(stories, originalUpper) };
  }

  const nullPrimary =
    row.primary_ticker !== null &&
    !san.kept.includes(row.primary_ticker);

  return {
    action: "apply",
    diff: {
      kept: san.kept,
      inferred: san.inferred,
      nullPrimary,
    },
    evidenceMode: classifyEvidenceMode(stories, originalUpper),
  };
}

function classifyEvidenceMode(
  stories: ReadonlyArray<{ affected_tickers: ReadonlyArray<string> }>,
  originalUpper: ReadonlySet<string>,
): EvidenceMode {
  let hasOverlap = false;
  for (const story of stories) {
    const storyTickers = (story.affected_tickers ?? [])
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.toUpperCase());
    if (storyTickers.some((t) => originalUpper.has(t))) {
      hasOverlap = true;
      break;
    }
  }

  if (hasOverlap) return "evidenced";

  const broadSet = getActiveBroadSet();
  const allBroad = [...originalUpper].every((t) => broadSet.has(t));
  return allBroad ? "zero_evidence_all_broad" : "zero_evidence_mixed";
}

// ── Artefact writers ──────────────────────────────────────────────────

function writeDiffJsonl(outDir: string, entries: DiffEntry[]): void {
  const lines = entries.map((e) => JSON.stringify(e)).join("\n");
  writeFileSync(join(outDir, "diff.jsonl"), lines + "\n", "utf-8");
}

function writeSummary(outDir: string, entries: DiffEntry[], runId: string): void {
  const applied = entries.filter((e) => e.action === "apply");
  const skippedIdentity = entries.filter((e) => e.action === "skip" && e.reason === "identity");
  const skippedErasure = entries.filter((e) => e.action === "skip" && e.reason === "erasure");
  const skippedError = entries.filter((e) => e.action === "skip" && e.reason === "error");

  const primaryNulled = applied.filter(
    (e) => e.after.primary_ticker === null && e.before.primary_ticker !== null,
  );

  const evidenceModes = { evidenced: 0, zero_evidence_all_broad: 0, zero_evidence_mixed: 0 };
  for (const e of entries) evidenceModes[e.evidence_mode]++;

  const keptEmpty = applied.filter((e) => e.after.affected_tickers.length === 0);

  const lines = [
    `# Slice 10 — Decontamination summary`,
    ``,
    `Run ID: ${runId}`,
    `Date: ${new Date().toISOString()}`,
    ``,
    `## Counts`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Total in-scope rows | ${entries.length} |`,
    `| Rows to apply | ${applied.length} (${pct(applied.length, entries.length)}) |`,
    `| Rows skipped (identity) | ${skippedIdentity.length} (${pct(skippedIdentity.length, entries.length)}) |`,
    `| Rows skipped (erasure guard) | ${skippedErasure.length} |`,
    `| Rows skipped (error) | ${skippedError.length} |`,
    `| Rows where primary_ticker nulled | ${primaryNulled.length} |`,
    `| Rows where kept=[] | ${keptEmpty.length} |`,
    ``,
    `## Evidence mode distribution`,
    ``,
    `| Mode | Count |`,
    `|---|---|`,
    `| evidenced | ${evidenceModes.evidenced} |`,
    `| zero_evidence_all_broad | ${evidenceModes.zero_evidence_all_broad} |`,
    `| zero_evidence_mixed | ${evidenceModes.zero_evidence_mixed} |`,
    ``,
    `## Cardinality`,
    ``,
    `Mean existing cardinality: ${mean(entries.map((e) => e.before.affected_tickers.length)).toFixed(2)}`,
    `Mean kept_after (applied rows only): ${applied.length > 0 ? mean(applied.map((e) => e.after.affected_tickers.length)).toFixed(2) : "N/A"}`,
    ``,
  ];

  writeFileSync(join(outDir, "summary.md"), lines.join("\n"), "utf-8");
}

function writeRevertSql(
  outDir: string,
  entries: DiffEntry[],
  runId: string,
): void {
  const applied = entries.filter((e) => e.action === "apply");
  if (applied.length === 0) return;

  const lines: string[] = [
    `-- Slice 10 revert generated at ${new Date().toISOString()}, run_id ${runId}`,
    `BEGIN;`,
  ];

  for (const e of applied) {
    const at = sqlTextArray(e.before.affected_tickers);
    const ti = sqlTextArray(e.before.tickers_inferred);
    const pt = e.before.primary_ticker === null ? "NULL" : sqlQuote(e.before.primary_ticker);
    const pts = e.before.primary_ticker_source === null ? "NULL" : sqlQuote(e.before.primary_ticker_source);

    lines.push(
      `UPDATE analysis_market_memory`,
      `SET affected_tickers       = ${at},`,
      `    tickers_inferred       = ${ti},`,
      `    primary_ticker         = ${pt},`,
      `    primary_ticker_source  = ${pts}`,
      `WHERE theme_id = ${sqlQuote(e.theme_id)} AND id = ${e.id};`,
    );
  }

  lines.push(`COMMIT;`);
  writeFileSync(join(outDir, "revert.sql"), lines.join("\n") + "\n", "utf-8");
}

function sqlTextArray(arr: string[]): string {
  if (arr.length === 0) return "ARRAY[]::text[]";
  const escaped = arr.map((t) => `'${t.replace(/'/g, "''")}'`);
  return `ARRAY[${escaped.join(",")}]::text[]`;
}

function sqlQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ── Main execution engine ─────────────────────────────────────────────

export interface DecontaminateOptions {
  db: pg.Pool;
  args: CliArgs;
  log?: (msg: string) => void;
}

export async function runDecontamination(opts: DecontaminateOptions): Promise<DiffEntry[]> {
  const { db, args, log = console.log } = opts;
  const runId = randomUUID();

  if (!getSanitizeBroadTickersEnabled()) {
    throw new Error(
      "MEMORY_CURATOR_SANITIZE_BROAD_TICKERS is false — cannot decontaminate with a disabled sanitizer. Aborting.",
    );
  }

  mkdirSync(args.outDir, { recursive: true });

  log(`[slice10] Run ID: ${runId}`);
  log(`[slice10] Mode: ${args.commit ? "COMMIT" : "DRY-RUN"}`);
  log(`[slice10] Output: ${args.outDir}`);

  // Phase 1: read all in-scope rows (read-only, outside any write transaction)
  let scopeQuery = `
    SELECT id, theme_id, theme, status, prompt_version,
           affected_tickers, tickers_inferred,
           primary_ticker, primary_ticker_source,
           source_batch_ids
    FROM analysis_market_memory
    WHERE status IN ('active', 'fading')
      AND cardinality(affected_tickers) > 0`;

  const scopeParams: unknown[] = [];
  if (args.themeId) {
    scopeParams.push(args.themeId);
    scopeQuery += ` AND theme_id = $${scopeParams.length}`;
  }
  scopeQuery += ` ORDER BY last_updated ASC`;
  if (args.limit) {
    scopeParams.push(args.limit);
    scopeQuery += ` LIMIT $${scopeParams.length}`;
  }

  const { rows } = await db.query<MemoryRow>(scopeQuery, scopeParams);
  log(`[slice10] In-scope rows: ${rows.length}`);

  // Phase 2: compute diffs (read-only)
  const entries: DiffEntry[] = [];
  for (const row of rows) {
    let stories: StoryRow[] = [];
    if (row.source_batch_ids && row.source_batch_ids.length > 0) {
      const storyResult = await db.query<StoryRow>(
        `SELECT affected_tickers FROM analysis_filtered_news WHERE batch_id = ANY($1::uuid[])`,
        [row.source_batch_ids],
      );
      stories = storyResult.rows;
    }

    let result: RowDecontaminationResult;
    try {
      result = computeRowDecontamination(
        {
          affected_tickers: row.affected_tickers,
          primary_ticker: row.primary_ticker,
          primary_ticker_source: row.primary_ticker_source,
        },
        stories,
      );
    } catch (err) {
      throw new Error(
        `Sanitizer-invent assertion failed on theme_id=${row.theme_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const entry: DiffEntry = {
      theme_id: row.theme_id,
      id: row.id,
      theme: row.theme,
      status: row.status,
      prompt_version: row.prompt_version,
      before: {
        affected_tickers: row.affected_tickers,
        tickers_inferred: row.tickers_inferred ?? [],
        primary_ticker: row.primary_ticker,
        primary_ticker_source: row.primary_ticker_source,
      },
      after:
        result.action === "apply" && result.diff
          ? {
              affected_tickers: result.diff.kept,
              tickers_inferred: result.diff.inferred,
              primary_ticker: result.diff.nullPrimary ? null : row.primary_ticker,
              primary_ticker_source: result.diff.nullPrimary ? null : row.primary_ticker_source,
            }
          : {
              affected_tickers: row.affected_tickers,
              tickers_inferred: row.tickers_inferred ?? [],
              primary_ticker: row.primary_ticker,
              primary_ticker_source: row.primary_ticker_source,
            },
      action: result.action,
      reason: result.reason ?? null,
      evidence_story_count: stories.length,
      evidence_mode: result.evidenceMode,
    };

    entries.push(entry);
  }

  const applied = entries.filter((e) => e.action === "apply");
  const keptEmpty = applied.filter((e) => e.after.affected_tickers.length === 0);

  log(`[slice10] Apply: ${applied.length}, Skip: ${entries.length - applied.length}`);

  // Write diff + summary (always, even in commit mode)
  writeDiffJsonl(args.outDir, entries);
  writeSummary(args.outDir, entries, runId);
  log(`[slice10] Wrote diff.jsonl + summary.md`);

  // Phase 3: commit if requested
  if (!args.commit) {
    log(`[slice10] DRY-RUN complete. No DB writes.`);
    return entries;
  }

  // Erasure-rate threshold check
  if (entries.length > 0) {
    const threshold = Math.max(2, Math.ceil(entries.length * args.maxErasureRate));
    if (keptEmpty.length > threshold) {
      throw new Error(
        `Erasure-rate threshold exceeded: ${keptEmpty.length} rows would have kept=[] ` +
        `(threshold: ${threshold}, rate: ${(keptEmpty.length / entries.length * 100).toFixed(1)}%, ` +
        `max: ${(args.maxErasureRate * 100).toFixed(1)}%). Aborting commit.`,
      );
    }
  }

  if (applied.length === 0) {
    log(`[slice10] No rows to apply. Commit skipped.`);
    return entries;
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    for (const entry of applied) {
      // Row-level lock for safety
      await client.query(
        `SELECT id FROM analysis_market_memory WHERE theme_id = $1 AND id = $2 FOR UPDATE`,
        [entry.theme_id, entry.id],
      );

      const setClauses: string[] = [];
      const params: unknown[] = [entry.theme_id, entry.id];

      params.push(entry.after.affected_tickers);
      setClauses.push(`affected_tickers = $${params.length}`);

      params.push(entry.after.tickers_inferred);
      setClauses.push(`tickers_inferred = $${params.length}`);

      if (
        entry.before.primary_ticker !== null &&
        entry.after.primary_ticker === null
      ) {
        params.push(null);
        setClauses.push(`primary_ticker = $${params.length}`);
        params.push(null);
        setClauses.push(`primary_ticker_source = $${params.length}`);
      }

      await client.query(
        `UPDATE analysis_market_memory SET ${setClauses.join(", ")} WHERE theme_id = $1 AND id = $2`,
        params,
      );
    }

    // Write revert.sql BEFORE COMMIT
    writeRevertSql(args.outDir, entries, runId);
    log(`[slice10] Wrote revert.sql (${applied.length} rows)`);

    await client.query("COMMIT");
    log(`[slice10] COMMIT successful. ${applied.length} rows updated.`);
  } catch (err) {
    await client.query("ROLLBACK");
    log(`[slice10] ROLLBACK — error during commit phase.`);
    throw err;
  } finally {
    client.release();
  }

  return entries;
}

// ── Main entry point ──────────────────────────────────────────────────

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

const isDirectRun =
  process.argv[1]?.endsWith("decontaminate-memory.ts") ||
  process.argv[1]?.endsWith("decontaminate-memory.js");
if (isDirectRun) main();
