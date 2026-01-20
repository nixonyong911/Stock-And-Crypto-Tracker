import { NextRequest, NextResponse } from "next/server";
import { 
  getKeysWithTTL, 
  getRedisInfo, 
  deleteCache, 
  deleteCachePattern,
  healthCheck,
} from "@/lib/redis/client";
import { getCacheMetadata } from "@/lib/redis/registry";

/**
 * GET /api/redis?action=keys|info|health
 * - keys: List all keys with TTL and metadata
 * - info: Get Redis memory and connection info
 * - health: Check Redis connection health
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "keys";

  try {
    switch (action) {
      case "keys": {
        const pattern = searchParams.get("pattern") || "*";
        const keysWithTTL = await getKeysWithTTL(pattern);
        
        // Enrich with metadata
        const enrichedKeys = keysWithTTL.map((item) => {
          const metadata = getCacheMetadata(item.key);
          return {
            ...item,
            owner: metadata?.owner || "Unknown",
            description: metadata?.description || null,
            refreshEndpoint: metadata?.refreshEndpoint || null,
          };
        });

        // Sort by key name
        enrichedKeys.sort((a, b) => a.key.localeCompare(b.key));

        return NextResponse.json({ keys: enrichedKeys });
      }

      case "info": {
        const info = await getRedisInfo();
        if (!info) {
          return NextResponse.json(
            { error: "Failed to get Redis info" },
            { status: 500 }
          );
        }
        return NextResponse.json({ info });
      }

      case "health": {
        const healthy = await healthCheck();
        return NextResponse.json({ 
          healthy,
          status: healthy ? "connected" : "disconnected",
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: keys, info, or health" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("GET /api/redis error:", error);
    return NextResponse.json(
      { error: "Failed to query Redis" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/redis?action=refresh&key=xxx
 * Delete a cache key and trigger refresh via its endpoint
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const key = searchParams.get("key");

  if (action !== "refresh" || !key) {
    return NextResponse.json(
      { error: "Use POST with ?action=refresh&key=xxx" },
      { status: 400 }
    );
  }

  try {
    // Delete the cache key
    const deleted = await deleteCache(key);
    
    // Get refresh endpoint from metadata
    const metadata = getCacheMetadata(key);
    
    let refreshed = false;
    if (metadata?.refreshEndpoint) {
      // Trigger refresh by calling the endpoint
      try {
        const baseUrl = request.headers.get("host") || "localhost:3000";
        const protocol = request.headers.get("x-forwarded-proto") || "http";
        const refreshUrl = `${protocol}://${baseUrl}${metadata.refreshEndpoint}`;
        
        const response = await fetch(refreshUrl, { method: "POST" });
        refreshed = response.ok;
      } catch (refreshError) {
        console.error("Failed to refresh cache:", refreshError);
      }
    }

    return NextResponse.json({
      deleted,
      refreshed,
      key,
      message: deleted 
        ? (refreshed ? "Cache refreshed successfully" : "Cache cleared (manual refresh needed)")
        : "Key not found",
    });
  } catch (error) {
    console.error("POST /api/redis error:", error);
    return NextResponse.json(
      { error: "Failed to refresh cache" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/redis?pattern=xxx
 * Delete all cache keys matching a pattern
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pattern = searchParams.get("pattern");

  if (!pattern) {
    return NextResponse.json(
      { error: "Use DELETE with ?pattern=xxx (e.g., back-office:*)" },
      { status: 400 }
    );
  }

  try {
    const deletedCount = await deleteCachePattern(pattern);
    
    return NextResponse.json({
      deleted: deletedCount,
      pattern,
      message: `Deleted ${deletedCount} key(s) matching pattern: ${pattern}`,
    });
  } catch (error) {
    console.error("DELETE /api/redis error:", error);
    return NextResponse.json(
      { error: "Failed to delete cache keys" },
      { status: 500 }
    );
  }
}
