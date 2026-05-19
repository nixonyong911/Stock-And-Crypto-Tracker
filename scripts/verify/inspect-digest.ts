/**
 * Smart Digest post-facto inspector.
 *
 * Pulls one or more rows from `user_recommendation_log` (a delivery
 * receipt for a sent digest), parses the JSON-serialised `DigestBrief`
 * stored in `message_body`, and prints a human-readable summary that a
 * reviewer can use to debug a specific delivery.
 *
 * Post-15.3 ledger shape: every new row from both writers (Smart Digest
 * and Daily Overview) has NULL denorms (`priority`, `headline`,
 * `message_body`, `timeframe_alignment`). The only meaningful content
 * lives in the artifact tables (`analysis_smart_digest`,
 * `analysis_daily_overview`). A flag-off row produces a valid but
 * content-sparse ledger entry — same NULL shape as a pre-15.1 empty row,
 * distinguished here by `sent_at` against `STEP_15_1_CUTOVER`.
 *
 * If `--replay` is supplied the script also runs the live debug builder
 * (the same code path as `POST /internal/debug-digest`) for the same
 * symbol against the current DB and prints the resulting `truthFlags`
 * — useful for catching upstream regressions that have appeared since
 * the row was written.
 *
 * Usage (from repo root):
 *   npx tsx scripts/verify/inspect-digest.ts --id <uuid>
 *   npx tsx scripts/verify/inspect-digest.ts --user <clerk_user_id> --limit 5
 *   npx tsx scripts/verify/inspect-digest.ts --id <uuid> --replay
 *
 * Required env: DATABASE_URL_JS, DATABASE_SERVICE_ROLE_KEY (Supabase
 * client). For `--replay` also DATABASE_URL.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.DATABASE_URL_JS!,
  process.env.DATABASE_SERVICE_ROLE_KEY!,
);

interface CliArgs {
  id?: string;
  userId?: string;
  limit: number;
  replay: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { limit: 1, replay: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--id" && argv[i + 1]) {
      out.id = argv[i + 1]!;
      i++;
    } else if (a === "--user" && argv[i + 1]) {
      out.userId = argv[i + 1]!;
      i++;
    } else if (a === "--limit" && argv[i + 1]) {
      const n = Number.parseInt(argv[i + 1]!, 10);
      if (Number.isFinite(n) && n > 0) out.limit = Math.min(50, n);
      i++;
    } else if (a === "--replay") {
      out.replay = true;
    }
  }
  return out;
}

interface LogRow {
  id: string;
  clerk_user_id: string;
  sent_at: string;
  recommendation_type: string | null;
  ticker_symbol: string | null;
  headline: string | null;
  message_body: string | null;
  artifact_kind: string | null;
  artifact_id: number | null;
  channel_type: string | null;
  delivery_status: string | null;
  delivery_failure_reason: string | null;
}

interface ParsedBrief {
  shape:
    | "json"
    | "legacy_markdown"
    | "legacy_pre_15_1"
    | "unlinked_post_15_1"
    | "broken_artifact_link"
    | "artifact_linked";
  brief?: Record<string, unknown>;
  raw?: string;
}

/**
 * Step 15.1 cutover happened on 2026-04-01 in production. Used to
 * distinguish two NULL-denorm shapes that look identical:
 *
 *   - `legacy_pre_15_1`    — `sent_at < STEP_15_1_CUTOVER`. Pre-cutover
 *                            empty row from before the delivery-ledger
 *                            pivot; expected legacy shape.
 *   - `unlinked_post_15_1` — `sent_at >= STEP_15_1_CUTOVER`. Post-cutover
 *                            ledger row with no artifact link. This is
 *                            the normal shape for a flag-off path (when
 *                            `*_CANONICAL_ARTIFACT_ENABLED` is off) or
 *                            an unconfigured writer. Not corruption.
 *
 * A genuinely broken link — `artifact_kind`/`artifact_id` set but the
 * artifact row missing — is reported separately as `broken_artifact_link`
 * downstream in the resolve path.
 */
const STEP_15_1_CUTOVER = new Date("2026-04-01T00:00:00Z").getTime();

function parseMessageBody(row: LogRow): ParsedBrief {
  const body = row.message_body;
  if (!body || body.trim().length === 0) {
    const isPreCutover = new Date(row.sent_at).getTime() < STEP_15_1_CUTOVER;
    return { shape: isPreCutover ? "legacy_pre_15_1" : "unlinked_post_15_1" };
  }
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      return { shape: "json", brief: JSON.parse(trimmed) as Record<string, unknown> };
    } catch {
      return { shape: "legacy_markdown", raw: trimmed };
    }
  }
  return { shape: "legacy_markdown", raw: trimmed };
}

async function resolveArtifact(
  row: LogRow,
): Promise<Record<string, unknown> | null> {
  if (!row.artifact_kind || !row.artifact_id) return null;
  const table =
    row.artifact_kind === "smart_digest"
      ? "analysis_smart_digest"
      : row.artifact_kind === "daily_overview"
        ? "analysis_daily_overview"
        : null;
  if (!table) return null;
  const { data } = await supabase
    .from(table)
    .select("*")
    .eq("id", row.artifact_id)
    .single();
  return data as Record<string, unknown> | null;
}

function printBrief(row: LogRow, parsed: ParsedBrief): void {
  console.log("─".repeat(72));
  console.log(`id              ${row.id}`);
  console.log(`sent_at         ${row.sent_at}`);
  console.log(`user            ${row.clerk_user_id}`);
  console.log(`type            ${row.recommendation_type ?? "(null)"}`);
  console.log(`ticker_symbol   ${row.ticker_symbol ?? "(null)"}`);
  console.log(`headline        ${row.headline ?? "(null)"}`);
  console.log(`artifact_kind   ${row.artifact_kind ?? "(null)"}`);
  console.log(`artifact_id     ${row.artifact_id ?? "(null)"}`);
  console.log(`channel_type    ${row.channel_type ?? "(null)"}`);
  console.log(`delivery_status ${row.delivery_status ?? "(null)"}`);
  console.log(`failure_reason  ${row.delivery_failure_reason ?? "(null)"}`);
  console.log(`body shape      ${parsed.shape}`);

  if (parsed.shape === "json" && parsed.brief) {
    const b = parsed.brief;
    console.log(`ticker        ${str(b["ticker"])}`);
    console.log(`status        ${JSON.stringify(b["status"]) ?? "(none)"}`);
    console.log(`price         ${str(b["price"])}`);
    console.log(`changePercent ${str(b["changePercent"])}`);
    console.log(`confidence    ${str(b["confidence"])}`);
    console.log(`updatedAt     ${str(b["updatedAt"])}`);
    console.log(`whatHappening ${str(b["whatHappening"])}`);
    console.log(`whatToWatch   ${JSON.stringify(b["whatToWatch"])}`);
    console.log(`context       ${str(b["context"])}`);
    if (Array.isArray(b["truthFlags"])) {
      const flags = b["truthFlags"] as unknown[];
      console.log(`truthFlags    ${flags.length === 0 ? "(none)" : flags.join(", ")}`);
    }
  } else if (parsed.raw) {
    console.log("body (raw):");
    console.log(parsed.raw);
  }
}

function str(v: unknown): string {
  if (v === undefined || v === null) return "(none)";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

async function maybeReplay(symbol: string | null): Promise<void> {
  if (!symbol) {
    console.log("[replay] skipped — row has no symbol");
    return;
  }
  let buildDigestDebugReport;
  try {
    ({ buildDigestDebugReport } = await import(
      "../../services/ai/gateway-2.0/src/core/analysis/digest-debug.js"
    ));
  } catch (err) {
    console.log(
      `[replay] failed to import digest-debug builder: ${err instanceof Error ? err.message : err}`,
    );
    return;
  }

  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.log("[replay] skipped — DATABASE_URL not set");
    return;
  }
  const pgModule = await import("pg");
  const { Pool } = pgModule.default ?? pgModule;
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5_000,
  });

  const log = {
    info: () => {},
    warn: (...args: unknown[]) => console.error("[warn]", ...args),
    error: (...args: unknown[]) => console.error("[error]", ...args),
    debug: () => {},
    trace: () => {},
    fatal: (...args: unknown[]) => console.error("[fatal]", ...args),
    child: () => log,
    level: "info",
  };

  try {
    const assetType: "stock" | "crypto" = symbol.includes("/") ? "crypto" : "stock";
    const report = await buildDigestDebugReport(
      { db: pool, log: log as never },
      { symbol, assetType, mode: "strict" },
    );
    const flags = report.truth.truthFlags ?? [];
    console.log("\n[replay] live truth-layer for the same symbol:");
    console.log(`  whatHappening : ${report.brief.whatHappening}`);
    console.log(`  truthFlags    : ${flags.length === 0 ? "(none)" : flags.join(", ")}`);
    console.log(`  primary       : ${report.primary?.type ?? "(none)"}`);
    console.log(`  context source: ${report.derived.contextSource}`);
  } catch (err) {
    console.log(
      `[replay] live builder failed: ${err instanceof Error ? err.message : err}`,
    );
  } finally {
    await pool.end().catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.id && !args.userId) {
    console.error(
      "Missing required argument. Provide --id <uuid> or --user <clerk_user_id> [--limit N].",
    );
    process.exit(2);
  }

  let query = supabase
    .from("user_recommendation_log")
    .select(
      "id, clerk_user_id, sent_at, recommendation_type, ticker_symbol, headline, message_body, artifact_kind, artifact_id, channel_type, delivery_status, delivery_failure_reason",
    )
    .order("sent_at", { ascending: false })
    .limit(args.limit);

  if (args.id) query = query.eq("id", args.id);
  if (args.userId) query = query.eq("clerk_user_id", args.userId);

  const { data, error } = await query;
  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }
  const rows = (data ?? []) as LogRow[];
  if (rows.length === 0) {
    console.log("No matching rows.");
    return;
  }

  for (const row of rows) {
    let parsed: ParsedBrief;
    if (row.artifact_kind && row.artifact_id) {
      const artifact = await resolveArtifact(row);
      if (artifact) {
        parsed = { shape: "artifact_linked", brief: artifact };
        console.log(`\n[artifact] Resolved ${row.artifact_kind} #${row.artifact_id}:`);
        console.log(`  status: ${str(artifact["status"])}`);
        if (row.artifact_kind === "smart_digest") {
          console.log(`  symbol: ${str(artifact["symbol"])}`);
          console.log(`  payload keys: ${artifact["payload"] ? Object.keys(artifact["payload"] as object).join(", ") : "(null)"}`);
        } else {
          console.log(`  narrative: ${str(artifact["narrative"])?.slice(0, 200)}`);
          console.log(`  top_stories: ${JSON.stringify(artifact["top_stories"])?.slice(0, 200)}`);
        }
      } else {
        // Step 15.2: this is a real anomaly — the row claims an
        // artifact link but the artifact has been deleted, invalidated,
        // or never existed. Distinct from "no artifact_kind set".
        parsed = { shape: "broken_artifact_link" };
        console.log(
          `\n[artifact] WARN: link broken — ${row.artifact_kind} #${row.artifact_id} ` +
            `not found in artifact table (deleted, invalidated, or never persisted)`,
        );
      }
    } else {
      parsed = parseMessageBody(row);
    }
    printBrief(row, parsed);
    if (args.replay) {
      await maybeReplay(row.ticker_symbol);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
