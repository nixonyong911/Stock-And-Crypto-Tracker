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
  recommendation_type: string | null;
}

interface ParsedBrief {
  shape: "json" | "legacy_markdown" | "empty";
  changePercent?: number;
}

function parseMessageBody(body: string | null): ParsedBrief {
  if (!body || body.trim().length === 0) return { shape: "empty" };
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as { changePercent?: unknown };
      const cp =
        typeof obj.changePercent === "number" && Number.isFinite(obj.changePercent)
          ? obj.changePercent
          : undefined;
      return { shape: "json", changePercent: cp };
    } catch {
      return { shape: "legacy_markdown" };
    }
  }
  return { shape: "legacy_markdown" };
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
    .select("clerk_user_id, sent_at, message_body, headline, recommendation_type");

  if (!allLogs) {
    check("user_recommendation_log readable", false, "query returned null");
    console.log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }

  const rows = allLogs as LogRow[];

  const dailyCounts = new Map<string, number>();
  for (const log of rows) {
    const day = new Date(log.sent_at).toISOString().slice(0, 10);
    const key = `${log.clerk_user_id}::${day}`;
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }

  const overCap = [...dailyCounts.entries()].filter(([, v]) => v > 6);
  check(
    "No user exceeds 6 entries/day cap",
    overCap.length === 0,
    overCap.length > 0
      ? `${overCap.length} violations, worst: ${Math.max(...overCap.map(([, v]) => v))}`
      : "all within cap"
  );

  const nullFields = rows.filter((l) => !l.message_body || !l.headline);
  check(
    "All entries have message_body and headline",
    nullFields.length === 0,
    `${nullFields.length} missing fields out of ${rows.length}`
  );

  const shapeCounts = { json: 0, legacy_markdown: 0, empty: 0 };
  const absurdChange: Array<{ id: string; pct: number }> = [];
  for (const log of rows) {
    const parsed = parseMessageBody(log.message_body);
    shapeCounts[parsed.shape]++;
    if (parsed.shape === "json" && parsed.changePercent != null && Math.abs(parsed.changePercent) > 25) {
      absurdChange.push({
        id: `${log.clerk_user_id}@${log.sent_at}`,
        pct: parsed.changePercent,
      });
    }
  }

  check(
    "No JSON brief has |changePercent| > 25",
    absurdChange.length === 0,
    absurdChange.length > 0
      ? `${absurdChange.length} absurd, worst: ${absurdChange
          .map((a) => a.pct.toFixed(1))
          .slice(0, 3)
          .join(", ")}`
      : "all within ±25%"
  );

  console.log("\n── message_body shape distribution ──");
  console.log(`  json: ${shapeCounts.json}`);
  console.log(`  legacy_markdown: ${shapeCounts.legacy_markdown}`);
  console.log(`  empty: ${shapeCounts.empty}`);

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
