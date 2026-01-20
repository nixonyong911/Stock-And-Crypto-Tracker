import { NextRequest, NextResponse } from "next/server";
import { getWorkers, refreshWorkersCache } from "@/lib/db/workers";

/**
 * GET /api/workers
 * Returns all active workers from cache or database
 */
export async function GET() {
  try {
    const workers = await getWorkers();
    return NextResponse.json({ workers });
  } catch (error) {
    console.error("GET /api/workers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch workers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workers?refresh=true
 * Force refresh the workers cache
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh");

  if (refresh !== "true") {
    return NextResponse.json(
      { error: "Use POST with ?refresh=true to refresh cache" },
      { status: 400 }
    );
  }

  try {
    const workers = await refreshWorkersCache();
    return NextResponse.json({ 
      workers,
      message: "Workers cache refreshed successfully",
    });
  } catch (error) {
    console.error("POST /api/workers error:", error);
    return NextResponse.json(
      { error: "Failed to refresh workers cache" },
      { status: 500 }
    );
  }
}
