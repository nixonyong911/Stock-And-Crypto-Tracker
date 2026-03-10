import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

const VALID_STATUSES = new Set(["registered", "subscribed", "churned"]);
const CODE_PATTERN = /^[A-Z0-9]{8}$/;

async function main() {
  console.log("=== Affiliate System Verification ===");

  const { data: members } = await supabase
    .from("affiliate_members")
    .select("id, user_id, affiliate_code, is_active");

  if (!members) {
    check("affiliate_members readable", false, "query returned null");
    console.log(`\n1 CHECK FAILED`);
    process.exit(1);
  }

  const badCodes = members.filter((m) => !CODE_PATTERN.test(m.affiliate_code));
  check(
    "All affiliate_codes are 8-char uppercase alphanumeric",
    badCodes.length === 0,
    badCodes.length > 0
      ? `${badCodes.length} invalid: ${badCodes.slice(0, 3).map((m) => m.affiliate_code).join(", ")}`
      : `${members.length} codes valid`
  );

  const { data: referrals } = await supabase
    .from("affiliate_referrals")
    .select("id, affiliate_member_id, referred_user_id, status");

  if (!referrals) {
    check("affiliate_referrals readable", false, "query returned null");
    console.log(`\n${failures + 1} CHECK(S) FAILED`);
    process.exit(1);
  }

  const memberMap = new Map(members.map((m) => [m.id, m]));

  const selfReferrals = referrals.filter((r) => {
    const member = memberMap.get(r.affiliate_member_id);
    return member && member.user_id === r.referred_user_id;
  });
  check(
    "No self-referrals",
    selfReferrals.length === 0,
    `${selfReferrals.length} self-referrals found`
  );

  const orphanReferrals = referrals.filter((r) => {
    const member = memberMap.get(r.affiliate_member_id);
    return !member || !member.is_active;
  });
  check(
    "All referrals reference an active affiliate member",
    orphanReferrals.length === 0,
    orphanReferrals.length > 0
      ? `${orphanReferrals.length} orphaned/inactive`
      : `${referrals.length} referrals OK`
  );

  const invalidStatuses = referrals.filter((r) => !VALID_STATUSES.has(r.status));
  check(
    "All referral statuses valid (registered|subscribed|churned)",
    invalidStatuses.length === 0,
    invalidStatuses.length > 0
      ? `${invalidStatuses.length} invalid: ${[...new Set(invalidStatuses.map((r) => r.status))].join(", ")}`
      : `${referrals.length} statuses valid`
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
