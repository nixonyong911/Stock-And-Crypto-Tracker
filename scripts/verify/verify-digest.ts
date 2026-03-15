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

async function main() {
  console.log("=== SmartDigest Verification ===");

  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60_000).toISOString();

  const { data: recentLogs, count: recentCount } = await supabase
    .from("user_recommendation_log")
    .select("*", { count: "exact" })
    .gte("created_at", fortyEightHoursAgo)
    .limit(500);

  check(
    "Recommendation log has entries in last 48 h",
    (recentCount ?? 0) > 0,
    `${recentCount} entries`
  );

  const { data: allLogs } = await supabase
    .from("user_recommendation_log")
    .select("clerk_user_id, created_at, message_body, headline, recommendation_type");

  if (!allLogs) {
    check("user_recommendation_log readable", false, "query returned null");
    console.log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }

  const dailyCounts = new Map<string, number>();
  for (const log of allLogs) {
    const day = new Date(log.created_at).toISOString().slice(0, 10);
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

  const nullFields = allLogs.filter((l) => !l.message_body || !l.headline);
  check(
    "All entries have message_body and headline",
    nullFields.length === 0,
    `${nullFields.length} missing fields out of ${allLogs.length}`
  );

  console.log("\n── Summary by recommendation_type ──");
  const typeCounts = new Map<string, number>();
  for (const log of allLogs) {
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
