import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase";

export interface TrialClaim {
  id: number;
  user_id: number;
  phone_hash: string;
  telegram_user_id: string | null;
  stripe_subscription_id: string | null;
  claimed_at: string;
  trial_end_at: string | null;
  source: "web" | "telegram";
  ip_address: string | null;
}

function getPhoneHashSalt(): string {
  const salt = process.env.PHONE_HASH_SALT;
  if (!salt) throw new Error("PHONE_HASH_SALT is not configured");
  return salt;
}

export function hashPhone(phoneE164: string): string {
  const normalized = phoneE164.replace(/[\s\-()]/g, "");
  return crypto
    .createHash("sha256")
    .update(getPhoneHashSalt() + normalized)
    .digest("hex");
}

export async function getTrialClaimByPhoneHash(
  phoneHash: string
): Promise<TrialClaim | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("trial_claims")
    .select("*")
    .eq("phone_hash", phoneHash)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function getTrialClaimByUserId(
  userId: number
): Promise<TrialClaim | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("trial_claims")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function insertTrialClaim(claim: {
  user_id: number;
  phone_hash: string;
  telegram_user_id?: string | null;
  stripe_subscription_id: string;
  trial_end_at: string;
  source: "web" | "telegram";
  ip_address?: string | null;
}): Promise<TrialClaim> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("trial_claims")
    .insert(claim)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function countTrialClaimsByIp(
  ipAddress: string,
  withinDays: number = 30
): Promise<number> {
  const supabase = getSupabaseAdmin();
  const since = new Date(
    Date.now() - withinDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const { count, error } = await supabase
    .from("trial_claims")
    .select("id", { count: "exact", head: true })
    .eq("ip_address", ipAddress)
    .gte("claimed_at", since);

  if (error) throw error;
  return count ?? 0;
}
