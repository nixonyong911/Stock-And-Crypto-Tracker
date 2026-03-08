import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";

export interface AffiliateMember {
  id: number;
  user_id: number;
  affiliate_code: string;
  status: "active" | "suspended" | "inactive";
  created_at: string;
  updated_at: string;
}

export interface AffiliateReferral {
  id: number;
  affiliate_member_id: number;
  referred_user_id: number;
  affiliate_code: string;
  status: "registered" | "subscribed" | "churned";
  created_at: string;
  updated_at: string;
}

function generateAffiliateCode(): string {
  let result = "";
  while (result.length < 8) {
    const chunk = crypto
      .randomBytes(6)
      .toString("base64url")
      .replace(/[^A-Z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 8);
    result += chunk;
  }
  return result.slice(0, 8);
}

export async function getAffiliateMemberByUserId(
  userId: number
): Promise<AffiliateMember | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("affiliate_members")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function getAffiliateMemberByCode(
  code: string
): Promise<AffiliateMember | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("affiliate_members")
    .select("*")
    .eq("affiliate_code", code.toUpperCase())
    .eq("status", "active")
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function createAffiliateMember(
  userId: number
): Promise<AffiliateMember> {
  const supabase = getSupabaseAdmin();

  for (let attempt = 0; attempt < 2; attempt++) {
    const code = generateAffiliateCode();
    const { data, error } = await supabase
      .from("affiliate_members")
      .insert({
        user_id: userId,
        affiliate_code: code,
      })
      .select()
      .single();

    if (!error) return data;
    if (error.code === "23505" && attempt === 0) continue;
    throw error;
  }

  throw new Error("Failed to create affiliate member after retry");
}

export async function createAffiliateReferral(params: {
  affiliateMemberId: number;
  referredUserId: number;
  affiliateCode: string;
}): Promise<AffiliateReferral> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("affiliate_referrals")
    .insert({
      affiliate_member_id: params.affiliateMemberId,
      referred_user_id: params.referredUserId,
      affiliate_code: params.affiliateCode,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getAffiliateReferralByUser(
  userId: number
): Promise<AffiliateReferral | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("affiliate_referrals")
    .select("*")
    .eq("referred_user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export interface AffiliateStats {
  totalReferrals: number;
  referralsByMonth: Record<string, number>;
}

export async function getAffiliateStats(
  userId: number
): Promise<AffiliateStats | null> {
  const member = await getAffiliateMemberByUserId(userId);
  if (!member) return null;

  const supabase = getSupabaseAdmin();
  const { data: referrals, error } = await supabase
    .from("affiliate_referrals")
    .select("id, created_at")
    .eq("affiliate_member_id", member.id);

  if (error) throw error;

  const referralsByMonth: Record<string, number> = {};
  for (const r of referrals ?? []) {
    const month = r.created_at.slice(0, 7);
    referralsByMonth[month] = (referralsByMonth[month] ?? 0) + 1;
  }

  return {
    totalReferrals: referrals?.length ?? 0,
    referralsByMonth,
  };
}
