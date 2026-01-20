import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/db/supabase";

export interface WorkerVersion {
  service: string;
  major_version: number;
  minor_version: number;
  updated_at: string;
}

/**
 * GET /api/versions
 * Returns all worker versions from the worker_versions table
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    
    const { data, error } = await supabase
      .from("worker_versions")
      .select("service, major_version, minor_version, updated_at")
      .order("service", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to fetch versions" },
        { status: 500 }
      );
    }

    return NextResponse.json({ versions: data as WorkerVersion[] });
  } catch (error) {
    console.error("GET /api/versions error:", error);
    return NextResponse.json(
      { error: "Failed to fetch versions" },
      { status: 500 }
    );
  }
}
