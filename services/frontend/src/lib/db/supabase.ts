import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminInstance: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdminInstance) {
    const url = process.env.DATABASE_URL_JS;
    const key = process.env.DATABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error("Missing DATABASE_URL_JS or DATABASE_SERVICE_ROLE_KEY");
    }

    supabaseAdminInstance = createClient(url, key);
  }

  return supabaseAdminInstance;
}
