import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy-initialized Supabase client to avoid build-time errors
// Uses service role key for server-side only access (no auth required for back-office)
let supabaseAdminInstance: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminInstance) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    supabaseAdminInstance = createClient(url, key);
  }

  return supabaseAdminInstance;
}
