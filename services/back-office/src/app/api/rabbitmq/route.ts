import { NextRequest, NextResponse } from "next/server";
import { 
  healthCheck, 
  listQueues, 
  getOverview,
  type QueueStats,
} from "@/lib/rabbitmq/client";
import { getQueueMetadata } from "@/lib/rabbitmq/registry";

export interface EnrichedQueueStats extends QueueStats {
  owner: string;
  description: string | null;
}

/**
 * GET /api/rabbitmq?action=queues|overview|health
 * - queues: List all queues with detailed stats and metadata
 * - overview: Get server overview (totals)
 * - health: Check RabbitMQ connection health
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "queues";

  try {
    switch (action) {
      case "queues": {
        const queues = await listQueues();
        
        // Enrich with metadata
        const enrichedQueues: EnrichedQueueStats[] = queues.map((queue) => {
          const metadata = getQueueMetadata(queue.name);
          return {
            ...queue,
            owner: metadata?.owner || "Unknown",
            description: metadata?.description || null,
          };
        });

        // Sort by name
        enrichedQueues.sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ queues: enrichedQueues });
      }

      case "overview": {
        const overview = await getOverview();
        if (!overview) {
          return NextResponse.json(
            { error: "Failed to get RabbitMQ overview" },
            { status: 500 }
          );
        }
        return NextResponse.json({ overview });
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
          { error: "Invalid action. Use: queues, overview, or health" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("GET /api/rabbitmq error:", error);
    return NextResponse.json(
      { error: "Failed to query RabbitMQ" },
      { status: 500 }
    );
  }
}
