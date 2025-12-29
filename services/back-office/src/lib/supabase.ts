import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';

// Create a singleton client, handling missing env vars during build
let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not configured');
    return null;
  }
  
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  
  return supabaseInstance;
};

// Legacy export for backward compatibility
export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as unknown as SupabaseClient;

// Types for our database tables
export interface WorkerRegistry {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  service_type: string;
  health_endpoint: string | null;
  status_endpoint: string | null;
  config_schema: Record<string, unknown> | null;
  is_active: boolean;
  last_health_check: string | null;
  last_health_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface FetchSchedule {
  id: number;
  data_source_id: number;
  name: string;
  description: string | null;
  schedule_time_utc: string;
  is_enabled: boolean;
  fetch_config: Record<string, unknown>;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockTicker {
  id: number;
  universe_id: number;
  symbol: string;
  name: string | null;
  exchange: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkerMetricsDaily {
  id: number;
  worker_id: number;
  metric_date: string;
  api_calls_total: number;
  api_calls_success: number;
  api_calls_failed: number;
  records_inserted: number;
  avg_duration_ms: number | null;
  created_at: string;
}

