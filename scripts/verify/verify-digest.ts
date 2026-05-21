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
  message_body: string | null;
  headline: string | null;
  priority: string | null;
  recommendation_type: string | null;
  artifact_kind: string | null;
  artifact_id: number | null;
  channel_type: string | null;
  delivery_status: string | null;
  delivery_failure_reason: string | null;
}

/**
 * Step 15.2: post-cutover the row "shape" is a tri-bucket, not a body
 * shape. `message_body` is now expected to be NULL on every new row;
 * the artifact link is the canonical content pointer.
 *
 *   - artifact_linked   : artifact_kind set (post-15.1 happy path)
 *   - legacy_message_body : artifact_kind null AND message_body present
 *                           (pre-15.1 row, before delivery-ledger pivot)
 *   - legacy_empty      : both null (pre-15.1 row with empty body, or
 *                           genuine corruption — see below)
 */
type RowShape = "artifact_linked" | "legacy_message_body" | "legacy_empty";

interface ParsedBrief {
  shape: RowShape;
  changePercent?: number;
}

function classifyRow(row: LogRow): ParsedBrief {
  if (row.artifact_kind != null && row.artifact_id != null) {
    return { shape: "artifact_linked" };
  }
  const body = row.message_body;
  if (!body || body.trim().length === 0) {
    return { shape: "legacy_empty" };
  }
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as { changePercent?: unknown };
      const cp =
        typeof obj.changePercent === "number" && Number.isFinite(obj.changePercent)
          ? obj.changePercent
          : undefined;
      return { shape: "legacy_message_body", changePercent: cp };
    } catch {
      return { shape: "legacy_message_body" };
    }
  }
  return { shape: "legacy_message_body" };
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
    .select("clerk_user_id, sent_at, message_body, headline, priority, recommendation_type, artifact_kind, artifact_id, channel_type, delivery_status, delivery_failure_reason");

  if (!allLogs) {
    check("user_recommendation_log readable", false, "query returned null");
    console.log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }

  const rows = allLogs as LogRow[];

  // Step 15.2 (slice H): the per-user 6/day cap applies only to
  // Smart Digest (`recommendation_type != 'daily_overview'`) AND only to
  // successful deliveries. Pre-15.2 the audit also counted daily-overview
  // rows and failed sends, producing false positives.
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
    legacy_message_body: 0,
    legacy_empty: 0,
  };
  const absurdChange: Array<{ id: string; pct: number }> = [];
  for (const log of rows) {
    const parsed = classifyRow(log);
    shapeCounts[parsed.shape]++;
    if (
      parsed.shape === "legacy_message_body" &&
      parsed.changePercent != null &&
      Math.abs(parsed.changePercent) > 25
    ) {
      absurdChange.push({
        id: `${log.clerk_user_id}@${log.sent_at}`,
        pct: parsed.changePercent,
      });
    }
  }

  check(
    "No legacy_message_body brief has |changePercent| > 25",
    absurdChange.length === 0,
    absurdChange.length > 0
      ? `${absurdChange.length} absurd, worst: ${absurdChange
          .map((a) => a.pct.toFixed(1))
          .slice(0, 3)
          .join(", ")}`
      : "all within ±25%"
  );

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

  // Step 15.4: post-15.3 invariant — no recent ledger row should carry
  // legacy denorm values. The prerequisite DB query confirmed this held
  // before the script change landed; this check enforces it on every
  // subsequent run so a regression that reintroduces denorm writes is
  // caught immediately.
  const recentDenormLeaks = recentRows.filter(
    (r) =>
      r.priority != null || r.headline != null || r.message_body != null,
  );
  check(
    "No recent row has non-NULL legacy denorms (last 48 h)",
    recentDenormLeaks.length === 0,
    recentDenormLeaks.length > 0
      ? `${recentDenormLeaks.length} of ${recentRows.length} recent rows have non-NULL denorms`
      : `${recentRows.length} recent rows, all clean`,
  );

  // Step 15.2 (slice H): post-cutover floor — at least 95% of recent rows
  // must be artifact-linked. Slack threshold: skip the floor if there are
  // very few recent rows (avoids noise in low-traffic windows).
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
    `  unlinked: ${unlinkedRecent.length} (pre-15.1 legacy or current flag-off)`,
  );
  console.log(`  total:    ${recentRows.length}`);

  // ── Delivery status distribution (Step 15) ──
  const statusCounts = new Map<string, number>();
  for (const r of recentRows) {
    const s = r.delivery_status ?? "(null)";
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  }
  console.log("\n── delivery_status (last 48 h) ──");
  for (const [status, count] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${status}: ${count}`);
  }

  // ── Step 15.2: failure-reason vocabulary check ─────────────────────
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
  console.log(`  artifact_linked:     ${shapeCounts.artifact_linked}`);
  console.log(`  legacy_message_body: ${shapeCounts.legacy_message_body}`);
  console.log(`  legacy_empty:        ${shapeCounts.legacy_empty}`);

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
