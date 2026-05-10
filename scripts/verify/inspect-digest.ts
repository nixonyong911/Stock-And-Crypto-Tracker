/**
 * Smart Digest post-facto inspector.
 *
 * Pulls one or more rows from `user_recommendation_log` (a delivery
 * receipt for a sent digest), parses the JSON-serialised `DigestBrief`
 * stored in `message_body`, and prints a human-readable summary that a
 * reviewer can use to debug a specific delivery.
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
  symbol: string | null;
  headline: string | null;
  message_body: string | null;
}

interface ParsedBrief {
  shape: "json" | "legacy_markdown" | "empty";
  brief?: Record<string, unknown>;
  raw?: string;
}

function parseMessageBody(body: string | null): ParsedBrief {
  if (!body || body.trim().length === 0) return { shape: "empty" };
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

function printBrief(row: LogRow, parsed: ParsedBrief): void {
  console.log("─".repeat(72));
  console.log(`id            ${row.id}`);
  console.log(`sent_at       ${row.sent_at}`);
  console.log(`user          ${row.clerk_user_id}`);
  console.log(`type          ${row.recommendation_type ?? "(null)"}`);
  console.log(`symbol        ${row.symbol ?? "(null)"}`);
  console.log(`headline      ${row.headline ?? "(null)"}`);
  console.log(`body shape    ${parsed.shape}`);

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
      "id, clerk_user_id, sent_at, recommendation_type, symbol, headline, message_body",
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
    const parsed = parseMessageBody(row.message_body);
    printBrief(row, parsed);
    if (args.replay) {
      await maybeReplay(row.symbol);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
