import { NextRequest, NextResponse } from "next/server";
import { discoverSchedules } from "@/lib/schedules/discovery";
import { getCache, setCache, deleteCache } from "@/lib/redis/client";
import { cacheKeys, cacheTTL } from "@/lib/redis/keys";
import { DiscoveryResult } from "@/lib/schedules/discovery";

/**
 * GET /api/schedules
 * Discovers schedules by probing active workers' /schedules endpoints.
 * Results are cached in Redis for performance.
 */
export async function GET() {
  try {
    const cached = await getCache<DiscoveryResult>(cacheKeys.schedules());
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await discoverSchedules();

    await setCache(cacheKeys.schedules(), result, cacheTTL.schedules);

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/schedules error:", error);
    return NextResponse.json(
      { error: "Failed to discover schedules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/schedules
 * Actions:
 * - ?refresh=true              - Force re-discovery (clear cache and re-probe workers)
 * - ?toggle=<service>&id=<id>  - Toggle schedule on/off via worker's API
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh");
  const toggleService = searchParams.get("toggle");
  const toggleId = searchParams.get("id");

  try {
    if (refresh === "true") {
      await deleteCache(cacheKeys.schedules());
      const result = await discoverSchedules();
      await setCache(cacheKeys.schedules(), result, cacheTTL.schedules);
      return NextResponse.json({
        ...result,
        message: "Schedules cache refreshed via discovery",
      });
    }

    if (toggleService && toggleId) {
      const result = await toggleViaWorker(toggleService, toggleId);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }

      // Invalidate cache so next GET re-discovers
      await deleteCache(cacheKeys.schedules());

      return NextResponse.json(result.data);
    }

    return NextResponse.json(
      { error: "Use POST with ?refresh=true or ?toggle=<service>&id=<id>" },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/schedules error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * Proxy a toggle request to the worker that owns the schedule.
 * Uses the worker_registry to find the worker's base URL.
 */
async function toggleViaWorker(
  service: string,
  scheduleId: string
): Promise<{ ok: boolean; status: number; error?: string; data?: unknown }> {
  try {
    const { getWorkers } = await import("@/lib/db/workers");
    const workers = await getWorkers();
    const worker = workers.find((w) => w.name === service);

    if (!worker?.schedules_endpoint) {
      return { ok: false, status: 404, error: `Worker '${service}' not found or has no schedules endpoint` };
    }

    // Derive toggle URL from schedules endpoint: /api/schedules -> /api/schedules/{id}/toggle
    const toggleUrl = `${worker.schedules_endpoint}/${scheduleId}/toggle`;

    const response = await fetch(toggleUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, status: response.status, error: body };
    }

    const data = await response.json();
    return { ok: true, status: 200, data };
  } catch (error) {
    console.error("Toggle via worker failed:", error);
    return { ok: false, status: 502, error: "Failed to reach worker" };
  }
}
