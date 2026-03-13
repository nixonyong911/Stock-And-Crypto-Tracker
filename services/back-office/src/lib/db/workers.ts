import { getSupabaseAdmin } from "./supabase";
import { getCache, setCache, deleteCache } from "../redis/client";
import { cacheKeys, cacheTTL } from "../redis/keys";

// Worker types (matching Supabase schema)
export interface WorkerRegistry {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  service_type: string;
  health_endpoint: string | null;
  status_endpoint: string | null;
  schedules_endpoint: string | null;
  config_schema: Record<string, unknown> | null;
  is_active: boolean;
  last_health_check: string | null;
  last_health_status: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get all active workers with Redis caching
 */
export async function getWorkers(): Promise<WorkerRegistry[]> {
  // Check Redis cache first
  const cached = await getCache<WorkerRegistry[]>(cacheKeys.workers());
  if (cached) {
    return cached;
  }

  // Fetch from database
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("worker_registry")
    .select("*")
    .eq("is_active", true)
    .order("display_name");

  if (error) {
    console.error("Failed to fetch workers:", error);
    throw error;
  }

  const workers = data || [];

  // Store in Redis cache
  await setCache(cacheKeys.workers(), workers, cacheTTL.workers);

  return workers;
}

/**
 * Get workers filtered by service type
 */
export async function getWorkersByType(serviceType: string): Promise<WorkerRegistry[]> {
  const workers = await getWorkers();
  return workers.filter((w) => w.service_type === serviceType);
}

/**
 * Get a single worker by name with caching
 */
export async function getWorkerByName(name: string): Promise<WorkerRegistry | null> {
  // Check Redis cache first
  const cached = await getCache<WorkerRegistry>(cacheKeys.workerByName(name));
  if (cached) {
    return cached;
  }

  // Fetch from database
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("worker_registry")
    .select("*")
    .eq("name", name)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    console.error("Failed to fetch worker:", error);
    throw error;
  }

  // Store in Redis cache
  if (data) {
    await setCache(cacheKeys.workerByName(name), data, cacheTTL.workers);
  }

  return data;
}

/**
 * Invalidate workers cache
 * Call this when workers are modified
 */
export async function invalidateWorkersCache(): Promise<void> {
  await deleteCache(cacheKeys.workers());
  console.log("Invalidated workers cache");
}

/**
 * Refresh workers cache - fetch from DB and update cache
 */
export async function refreshWorkersCache(): Promise<WorkerRegistry[]> {
  // Delete existing cache
  await deleteCache(cacheKeys.workers());
  
  // Fetch fresh from database and re-cache
  return getWorkers();
}
