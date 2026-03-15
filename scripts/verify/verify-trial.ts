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
  console.log("=== Trial Enforcement Verification ===");

  const { data: dupPhones } = await supabase.rpc("sql", {
    query: `
      SELECT phone_hash, COUNT(*) as cnt
      FROM trial_claims
      GROUP BY phone_hash
      HAVING COUNT(*) > 1
    `,
  }).catch(() => ({ data: null }));

  if (dupPhones === null) {
    const { data: allClaims } = await supabase
      .from("trial_claims")
      .select("phone_hash");

    if (allClaims) {
      const phoneCounts = new Map<string, number>();
      for (const c of allClaims) {
        phoneCounts.set(c.phone_hash, (phoneCounts.get(c.phone_hash) ?? 0) + 1);
      }
      const dups = [...phoneCounts.entries()].filter(([, v]) => v > 1);
      check("No duplicate phone_hash in trial_claims", dups.length === 0, `${dups.length} duplicates`);
    }
  } else {
    check(
      "No duplicate phone_hash in trial_claims",
      !dupPhones || dupPhones.length === 0,
      `${dupPhones?.length ?? 0} duplicates`
    );
  }

  const { data: allClaims } = await supabase
    .from("trial_claims")
    .select("user_id, stripe_subscription_id, claimed_at, trial_end");

  if (!allClaims) {
    check("trial_claims table readable", false, "query returned null");
    console.log(`\n${failures} CHECK(S) FAILED`);
    process.exit(1);
  }

  const userCounts = new Map<string, number>();
  for (const c of allClaims) {
    userCounts.set(c.user_id, (userCounts.get(c.user_id) ?? 0) + 1);
  }
  const dupUsers = [...userCounts.entries()].filter(([, v]) => v > 1);
  check("No duplicate user_id in trial_claims", dupUsers.length === 0, `${dupUsers.length} duplicates`);

  const nullSubs = allClaims.filter((c) => !c.stripe_subscription_id);
  check(
    "All claims have stripe_subscription_id",
    nullSubs.length === 0,
    `${nullSubs.length} missing`
  );

  const ONE_DAY_MS = 24 * 60 * 60_000;
  const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
  let durationOk = 0;
  let durationChecked = 0;

  for (const c of allClaims) {
    if (!c.claimed_at || !c.trial_end) continue;
    durationChecked++;
    const diff = new Date(c.trial_end).getTime() - new Date(c.claimed_at).getTime();
    if (Math.abs(diff - SEVEN_DAYS_MS) <= ONE_DAY_MS) durationOk++;
  }

  if (durationChecked > 0) {
    check(
      "Trial durations ~7 days (±1 day tolerance)",
      durationOk === durationChecked,
      `${durationOk}/${durationChecked} within tolerance`
    );
  } else {
    check("Trial durations (no data to check)", true, "0 claims with both dates");
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
