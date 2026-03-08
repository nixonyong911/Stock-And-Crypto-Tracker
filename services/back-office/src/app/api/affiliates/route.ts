import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month"); // YYYY-MM format

    const supabase = getSupabaseAdmin();

    // Get all affiliate members with user info
    const { data: members, error: membersError } = await supabase
      .from("affiliate_members")
      .select(
        `
        id,
        user_id,
        affiliate_code,
        status,
        created_at,
        users!inner (
          email,
          display_name
        )
      `
      )
      .order("created_at", { ascending: false });

    if (membersError) throw membersError;

    // Get referrals (optionally filtered by month)
    let referralsQuery = supabase
      .from("affiliate_referrals")
      .select(
        `
        id,
        affiliate_member_id,
        referred_user_id,
        affiliate_code,
        status,
        created_at,
        users!affiliate_referrals_referred_user_id_fkey (
          email,
          display_name
        )
      `
      )
      .order("created_at", { ascending: false });

    if (month) {
      const startDate = `${month}-01T00:00:00.000Z`;
      const [year, m] = month.split("-").map(Number);
      const endDate = new Date(year, m, 1).toISOString();
      referralsQuery = referralsQuery
        .gte("created_at", startDate)
        .lt("created_at", endDate);
    }

    const { data: referrals, error: referralsError } = await referralsQuery;
    if (referralsError) throw referralsError;

    // Group referrals by affiliate_member_id
    const referralsByMember: Record<number, Array<(typeof referrals)[number]>> =
      {};
    for (const ref of referrals || []) {
      if (!referralsByMember[ref.affiliate_member_id]) {
        referralsByMember[ref.affiliate_member_id] = [];
      }
      referralsByMember[ref.affiliate_member_id].push(ref);
    }

    const unwrapUser = (u: unknown) => {
      if (Array.isArray(u)) return u[0] ?? null;
      return u ?? null;
    };

    // Build response
    const affiliates = (members || []).map((member) => {
      const promoterUser = unwrapUser(member.users) as {
        email?: string;
        display_name?: string;
      } | null;
      return {
        id: member.id,
        affiliateCode: member.affiliate_code,
        status: member.status,
        createdAt: member.created_at,
        promoter: {
          email: promoterUser?.email,
          displayName: promoterUser?.display_name,
        },
        referralCount: (referralsByMember[member.id] || []).length,
        referrals: (referralsByMember[member.id] || []).map((ref) => {
          const refUser = unwrapUser(ref.users) as {
            email?: string;
            display_name?: string;
          } | null;
          return {
            id: ref.id,
            referredUser: {
              email: refUser?.email,
              displayName: refUser?.display_name,
            },
            status: ref.status,
            createdAt: ref.created_at,
          };
        }),
      };
    });

    const totalAffiliates = affiliates.length;
    const totalReferrals = (referrals || []).length;

    return NextResponse.json({
      affiliates,
      summary: {
        totalAffiliates,
        totalReferrals,
        month: month || "all",
      },
    });
  } catch (error) {
    console.error("Error fetching affiliates:", error);
    return NextResponse.json(
      { error: "Failed to fetch affiliates" },
      { status: 500 }
    );
  }
}
