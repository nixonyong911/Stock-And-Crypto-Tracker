import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.DATABASE_URL_JS!,
  process.env.DATABASE_SERVICE_ROLE_KEY!
);

let failures = 0;

function check(name: string, passed: boolean, detail?: string) {
  if (passed) {
    console.log(`  PASS  ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

interface LogRow {
  clerk_user_id: string;
  sent_at: string;
  recommendation_type: string | null;
  artifact_kind: string | null;
  artifact_id: number | null;
  channel_type: string | null;
  delivery_status: string | null;
  delivery_failure_reason: string | null;
}

/**
 * Step 16.2.a: row shape is a two-bucket classification.
 *
 *   - artifact_linked : artifact_kind IS NOT NULL (post-15.1 happy path)
 *   - unlinked        : artifact_kind IS NULL (pre-15.1 legacy row)
 */
type RowShape = "artifact_linked" | "unlinked";

function classifyRowShape(row: LogRow): RowShape {
  return row.artifact_kind != null && row.artifact_id != null
    ? "artifact_linked"
    : "unlinked";
}

async function main() {
  console.log("=== SmartDigest Verification ===");

  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60_000).toISOString();

  const { data: recentLogs, count: recentCount } = await supabase
    .from("user_recommendation_log")
    .select("*", { count: "exact" })
    .gte("sent_at", fortyEightHoursAgo)
    .limit(500);

  check(
    "Recommendation log has entries in last 48 h",
    (recentCount ?? 0) > 0,
    `${recentCount} entries`
  );

  void recentLogs;

  const { data: allLogs } = await supabase
    .from("user_recommendation_log")
    .select("clerk_user_id, sent_at, recommendation_type, artifact_kind, artifact_id, channel_type, delivery_status, delivery_failure_reason");

  if (!allLogs) {
    check("user_recommendation_log readable", false, "query returned null");
    console.log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }

  const rows = allLogs as LogRow[];

  // The per-user 6/day cap applies only to Smart Digest
  // (`recommendation_type != 'daily_overview'`) AND only to successful
  // deliveries. Pre-15.2 the audit also counted daily-overview rows and
  // failed sends, producing false positives.
  const dailyCounts = new Map<string, number>();
  for (const log of rows) {
    if (log.recommendation_type === "daily_overview") continue;
    if (log.delivery_status !== "sent") continue;
    const day = new Date(log.sent_at).toISOString().slice(0, 10);
    const key = `${log.clerk_user_id}::${day}`;
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }

  const overCap = [...dailyCounts.entries()].filter(([, v]) => v > 6);
  check(
    "No user exceeds 6 sent Smart Digest entries/day cap",
    overCap.length === 0,
    overCap.length > 0
      ? `${overCap.length} violation(s): ${overCap.map(([k, v]) => `${k} (${v})`).join(", ")}` +
        ` — check /internal/force-send-digest usage before assuming a runtime cap bug`
      : "all within cap",
  );

  const shapeCounts: Record<RowShape, number> = {
    artifact_linked: 0,
    unlinked: 0,
  };
  for (const log of rows) {
    shapeCounts[classifyRowShape(log)]++;
  }

  // ── Artifact linkage checks (Step 15) ──
  const recentRows = rows.filter(
    (r) => new Date(r.sent_at).getTime() > now.getTime() - 48 * 60 * 60_000,
  );
  const linkedRecent = recentRows.filter(
    (r) => r.artifact_kind != null && r.artifact_id != null,
  );
  const unlinkedRecent = recentRows.filter(
    (r) => r.artifact_kind == null && r.artifact_id == null,
  );
  const inconsistent = recentRows.filter(
    (r) =>
      (r.artifact_kind == null) !== (r.artifact_id == null),
  );

  check(
    "No inconsistent artifact pair (kind without id or vice versa)",
    inconsistent.length === 0,
    `${inconsistent.length} inconsistent out of ${recentRows.length} recent rows`,
  );

  // Post-cutover floor — at least 95% of recent rows must be
  // artifact-linked. Slack threshold: skip the floor if there are very
  // few recent rows (avoids noise in low-traffic windows).
  const RECENT_LINKAGE_FLOOR_PCT = 0.95;
  if (recentRows.length >= 20) {
    const linkedPct = linkedRecent.length / recentRows.length;
    check(
      `≥${(RECENT_LINKAGE_FLOOR_PCT * 100).toFixed(0)}% of last-48h rows are artifact-linked`,
      linkedPct >= RECENT_LINKAGE_FLOOR_PCT,
      `${(linkedPct * 100).toFixed(1)}% linked (${linkedRecent.length}/${recentRows.length})`,
    );
  } else {
    console.log(
      `  SKIP  Recent linkage floor (${recentRows.length} rows in last 48 h, need ≥20)`,
    );
  }

  console.log("\n── Artifact linkage (last 48 h) ──");
  console.log(`  linked:   ${linkedRecent.length}`);
  console.log(
    `  unlinked: ${unlinkedRecent.length} (pre-15.1 legacy)`,
  );
  console.log(`  total:    ${recentRows.length}`);

  // ── Delivery status distribution ──
  const statusCounts = new Map<string, number>();
  for (const r of recentRows) {
    const s = r.delivery_status ?? "(null)";
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  }
  console.log("\n── delivery_status (last 48 h) ──");
  for (const [status, count] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
  }

  // ── Failure-reason vocabulary check ──
  // Every non-null delivery_failure_reason must be a member of the
  // unified DeliveryFailureReason union from delivery-failure.ts.
  const ALLOWED_FAILURE_REASONS = new Set([
    "telegram_unavailable",
    "render_failed",
    "send_failed",
    "send_error",
  ]);
  const unknownReasons = new Map<string, number>();
  for (const r of recentRows) {
    const reason = r.delivery_failure_reason;
    if (reason && !ALLOWED_FAILURE_REASONS.has(reason)) {
      unknownReasons.set(reason, (unknownReasons.get(reason) ?? 0) + 1);
    }
  }
  check(
    "All recent delivery_failure_reason values are in unified union",
    unknownReasons.size === 0,
    unknownReasons.size > 0
      ? `${unknownReasons.size} unknown reason(s): ${[...unknownReasons.entries()]
          .map(([k, v]) => `${k}(${v})`)
          .join(", ")}`
      : "all in {telegram_unavailable, render_failed, send_failed, send_error}",
  );

  console.log("\n── Row-shape distribution ──");
  console.log(`  artifact_linked: ${shapeCounts.artifact_linked}`);
  console.log(`  unlinked:        ${shapeCounts.unlinked}`);

  console.log("\n── Summary by recommendation_type ──");
  const typeCounts = new Map<string, number>();
  for (const log of rows) {
    const t = log.recommendation_type ?? "(null)";
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  for (const [type, count] of [...typeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
