import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase";

/**
 * GET /api/tickers
 * Returns all stock tickers (not cached - tickers are frequently toggled)
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("stock_tickers")
      .select("*")
      .order("symbol");

    if (error) {
      console.error("Failed to fetch tickers:", error);
      return NextResponse.json(
        { error: "Failed to fetch tickers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tickers: data || [] });
  } catch (error) {
    console.error("GET /api/tickers error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tickers" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tickers?toggle=<id>
 * Toggle ticker active status
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const toggleId = searchParams.get("toggle");

  if (!toggleId) {
    return NextResponse.json(
      { error: "Use POST with ?toggle=<id>" },
      { status: 400 }
    );
  }

  const tickerId = parseInt(toggleId, 10);
  if (isNaN(tickerId)) {
    return NextResponse.json(
      { error: "Invalid ticker ID" },
      { status: 400 }
    );
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get current state
    const { data: current } = await supabase
      .from("stock_tickers")
      .select("is_active")
      .eq("id", tickerId)
      .single();

    if (!current) {
      return NextResponse.json(
        { error: "Ticker not found" },
        { status: 404 }
      );
    }

    // Toggle
    const { data, error } = await supabase
      .from("stock_tickers")
      .update({
        is_active: !current.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tickerId)
      .select()
      .single();

    if (error) {
      console.error("Failed to toggle ticker:", error);
      return NextResponse.json(
        { error: "Failed to toggle ticker" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ticker: data,
      message: `Ticker ${data.is_active ? "activated" : "deactivated"}`,
    });
  } catch (error) {
    console.error("POST /api/tickers error:", error);
    return NextResponse.json(
      { error: "Failed to toggle ticker" },
      { status: 500 }
    );
  }
}
