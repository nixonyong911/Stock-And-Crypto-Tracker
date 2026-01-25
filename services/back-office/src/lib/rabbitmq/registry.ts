/**
 * Queue registry for RabbitMQ monitoring UI
 * Maps queue names to their metadata for display
 */

export interface QueueMetadata {
  owner: string;
  description: string;
}

export const QUEUE_REGISTRY: Record<string, QueueMetadata> = {
  "backfill-queue": {
    owner: "TwelveData Worker",
    description: "Historical data backfill requests (FIFO processing)",
  },
  "ticker-add-queue": {
    owner: "TwelveData Worker",
    description: "New ticker registration requests (adds stocks/crypto to tracking)",
  },
  "analysis-backfill-queue": {
    owner: "Candlestick Analysis Worker",
    description: "Candlestick pattern analysis backfill requests (triggered after price data backfill)",
  },
  "telegram.messages": {
    owner: "Telegram Bot",
    description: "Incoming user messages awaiting AI processing",
  },
  "telegram.dlq": {
    owner: "Telegram Bot",
    description: "Dead letter queue - failed messages after max retries",
  },
};

/**
 * Get metadata for a queue by name
 */
export function getQueueMetadata(queueName: string): QueueMetadata | null {
  return QUEUE_REGISTRY[queueName] ?? null;
}

/**
 * Get the owner of a queue
 */
export function getQueueOwner(queueName: string): string {
  const metadata = getQueueMetadata(queueName);
  return metadata?.owner ?? "Unknown";
}
