import { NextRequest, NextResponse } from "next/server";
import { getSchedules, refreshSchedulesCache, toggleSchedule } from "@/lib/db/schedules";

/**
 * GET /api/schedules
 * Returns all schedules from cache or database
 */
export async function GET() {
  try {
    const schedules = await getSchedules();
    return NextResponse.json({ schedules });
  } catch (error) {
    console.error("GET /api/schedules error:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/schedules?refresh=true - Force refresh the schedules cache
 * POST /api/schedules?toggle=<id> - Toggle schedule enabled status
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh");
  const toggleId = searchParams.get("toggle");

  try {
    // Handle toggle
    if (toggleId) {
      const scheduleId = parseInt(toggleId, 10);
      if (isNaN(scheduleId)) {
        return NextResponse.json(
          { error: "Invalid schedule ID" },
          { status: 400 }
        );
      }

      const schedule = await toggleSchedule(scheduleId);
      if (!schedule) {
        return NextResponse.json(
          { error: "Schedule not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        schedule,
        message: `Schedule ${schedule.is_enabled ? "enabled" : "disabled"}`,
      });
    }

    // Handle refresh
    if (refresh === "true") {
      const schedules = await refreshSchedulesCache();
      return NextResponse.json({
        schedules,
        message: "Schedules cache refreshed successfully",
      });
    }

    return NextResponse.json(
      { error: "Use POST with ?refresh=true or ?toggle=<id>" },
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
