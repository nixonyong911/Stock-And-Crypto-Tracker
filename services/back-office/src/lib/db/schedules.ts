import { getSupabaseAdmin } from "./supabase";
import { getCache, setCache, deleteCache } from "../redis/client";
import { cacheKeys, cacheTTL } from "../redis/keys";

// Schedule types (matching Supabase worker_fetch_schedules table)
export interface FetchSchedule {
  id: number;
  data_source_id: number;
  /** Foreign key to worker_registry for proper schedule-worker linking */
  worker_id: number | null;
  name: string;
  description: string | null;
  schedule_time: string;
  schedule_timezone: string;
  is_enabled: boolean;
  fetch_config: Record<string, unknown>;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get all schedules with Redis caching
 */
export async function getSchedules(): Promise<FetchSchedule[]> {
  // Check Redis cache first
  const cached = await getCache<FetchSchedule[]>(cacheKeys.schedules());
  if (cached) {
    return cached;
  }

  // Fetch from database
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("worker_fetch_schedules")
    .select("*")
    .order("name");

  if (error) {
    console.error("Failed to fetch schedules:", error);
    throw error;
  }

  const schedules = data || [];

  // Store in Redis cache
  await setCache(cacheKeys.schedules(), schedules, cacheTTL.schedules);

  return schedules;
}

/**
 * Get schedule by data source ID
 */
export async function getScheduleByDataSourceId(dataSourceId: number): Promise<FetchSchedule | null> {
  // Check Redis cache first
  const cached = await getCache<FetchSchedule>(cacheKeys.scheduleByDataSourceId(dataSourceId));
  if (cached) {
    return cached;
  }

  // Fetch from database
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("worker_fetch_schedules")
    .select("*")
    .eq("data_source_id", dataSourceId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    console.error("Failed to fetch schedule:", error);
    throw error;
  }

  // Store in Redis cache
  if (data) {
    await setCache(cacheKeys.scheduleByDataSourceId(dataSourceId), data, cacheTTL.schedules);
  }

  return data;
}

/**
 * Find schedule by worker name (partial match)
 */
export async function getScheduleByWorkerName(workerName: string): Promise<FetchSchedule | null> {
  const schedules = await getSchedules();
  return schedules.find((s) => 
    s.name.toLowerCase().includes(workerName.toLowerCase())
  ) || null;
}

/**
 * Toggle schedule enabled status
 */
export async function toggleSchedule(scheduleId: number): Promise<FetchSchedule | null> {
  const supabase = getSupabaseAdmin();
  
  // Get current state
  const { data: current } = await supabase
    .from("worker_fetch_schedules")
    .select("is_enabled")
    .eq("id", scheduleId)
    .single();

  if (!current) return null;

  // Toggle
  const { data, error } = await supabase
    .from("worker_fetch_schedules")
    .update({ 
      is_enabled: !current.is_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId)
    .select()
    .single();

  if (error) {
    console.error("Failed to toggle schedule:", error);
    throw error;
  }

  // Invalidate cache
  await invalidateSchedulesCache();

  return data;
}

/**
 * Invalidate schedules cache
 */
export async function invalidateSchedulesCache(): Promise<void> {
  await deleteCache(cacheKeys.schedules());
  console.log("Invalidated schedules cache");
}

/**
 * Refresh schedules cache - fetch from DB and update cache
 */
export async function refreshSchedulesCache(): Promise<FetchSchedule[]> {
  // Delete existing cache
  await deleteCache(cacheKeys.schedules());
  
  // Fetch fresh from database and re-cache
  return getSchedules();
}

// Execution history types
export interface ExecutionLogEntry {
  id: number;
  schedule_id: number;
  status: string;
  message: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string;
}

/**
 * Get execution history for multiple schedules in a single query.
 * Returns last N executions per schedule, keyed by schedule_id.
 */
export async function getExecutionHistory(
  scheduleIds: number[],
  limit = 20,
): Promise<Record<number, ExecutionLogEntry[]>> {
  if (scheduleIds.length === 0) return {};

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("worker_execution_log")
    .select("id, schedule_id, status, message, duration_ms, started_at, completed_at")
    .in("schedule_id", scheduleIds)
    .order("completed_at", { ascending: false })
    .limit(limit * scheduleIds.length);

  if (error) {
    console.error("Failed to fetch execution history:", error);
    throw error;
  }

  const grouped: Record<number, ExecutionLogEntry[]> = {};
  for (const row of data || []) {
    if (!grouped[row.schedule_id]) {
      grouped[row.schedule_id] = [];
    }
    if (grouped[row.schedule_id].length < limit) {
      grouped[row.schedule_id].push(row);
    }
  }

  return grouped;
}
