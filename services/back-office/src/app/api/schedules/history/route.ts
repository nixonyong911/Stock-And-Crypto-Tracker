import { NextRequest, NextResponse } from "next/server";
import { getExecutionHistory } from "@/lib/db/schedules";

/**
 * GET /api/schedules/history?ids=1,2,3
 * Returns last 20 executions per schedule ID.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json(
      { error: "Missing 'ids' query parameter (comma-separated schedule IDs)" },
      { status: 400 },
    );
  }

  try {
    const ids = idsParam
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));

    if (ids.length === 0) {
      return NextResponse.json(
        { error: "No valid schedule IDs provided" },
        { status: 400 },
      );
    }

    const history = await getExecutionHistory(ids, 20);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("GET /api/schedules/history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch execution history" },
      { status: 500 },
    );
  }
}
