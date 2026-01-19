import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

// API key for cache invalidation (optional security)
const CACHE_API_KEY = process.env.CACHE_REVALIDATE_SECRET;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tag } = body;

    // Optional: Verify API key if set
    if (CACHE_API_KEY) {
      const authHeader = request.headers.get("authorization");
      const apiKey = authHeader?.replace("Bearer ", "");
      
      if (apiKey !== CACHE_API_KEY) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!tag) {
      return NextResponse.json({ error: "Tag is required" }, { status: 400 });
    }

    // Allowed tags that can be revalidated
    const allowedTags = ["stripe-prices"];
    
    if (!allowedTags.includes(tag)) {
      return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
    }

    // Revalidate the cache (Next.js 16 requires a cache life profile as second arg)
    revalidateTag(tag, "default");

    return NextResponse.json({
      success: true,
      message: `Cache tag '${tag}' revalidated successfully`,
      revalidatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cache revalidation error:", error);
    return NextResponse.json(
      { error: "Failed to revalidate cache" },
      { status: 500 }
    );
  }
}

// Also support GET for simple testing
export async function GET(request: NextRequest) {
  const tag = request.nextUrl.searchParams.get("tag");
  
  if (!tag) {
    return NextResponse.json({
      message: "Cache revalidation endpoint",
      usage: "POST with { tag: 'stripe-prices' } or GET with ?tag=stripe-prices",
      allowedTags: ["stripe-prices"],
    });
  }

  // Revalidate via GET (for simple testing)
  const allowedTags = ["stripe-prices"];
  
  if (!allowedTags.includes(tag)) {
    return NextResponse.json({ error: "Invalid tag" }, { status: 400 });
  }

  revalidateTag(tag, "default");

  return NextResponse.json({
    success: true,
    message: `Cache tag '${tag}' revalidated successfully`,
    revalidatedAt: new Date().toISOString(),
  });
}
