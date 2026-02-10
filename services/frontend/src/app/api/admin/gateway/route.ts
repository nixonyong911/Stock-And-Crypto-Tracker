import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getUserByClerkId } from "@/lib/db/users";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://gateway:8080";
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY || "";

/**
 * Proxy admin requests to Gateway.
 * Only accessible to users with "dev" tier.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user is dev tier
    const user = await getUserByClerkId(userId);
    if (!user || user.tier !== "dev") {
      return NextResponse.json({ error: "Forbidden: dev tier required" }, { status: 403 });
    }

    // Get the endpoint from query param
    const endpoint = request.nextUrl.searchParams.get("endpoint");
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint parameter" }, { status: 400 });
    }

    // Whitelist allowed endpoints
    const allowedEndpoints = [
      "/api/v1/admin/metrics",
      "/api/v1/admin/security-logs",
      "/api/v1/admin/sessions",
      "/api/v1/admin/usage",
    ];

    if (!allowedEndpoints.some((e) => endpoint.startsWith(e))) {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 400 });
    }

    // Proxy to Gateway
    const response = await fetch(`${GATEWAY_URL}${endpoint}`, {
      headers: {
        "X-API-Key": GATEWAY_API_KEY,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Gateway returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Admin API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
