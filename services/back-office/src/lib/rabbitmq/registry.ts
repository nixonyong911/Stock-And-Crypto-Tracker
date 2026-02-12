/**
 * Queue registry for RabbitMQ monitoring UI
 * Fully automatic discovery with optional manual overrides
 */

export interface QueueMetadata {
  owner: string;
  description: string | null;
}

/**
 * Optional registry for enhanced metadata (descriptions)
 * Queues not in this registry will still be discovered automatically
 */
export const QUEUE_REGISTRY: Record<string, Partial<QueueMetadata>> = {
  "backfill-queue": {
    description: "Stock historical data backfill requests (FIFO processing)",
  },
  "crypto-backfill-queue": {
    description:
      "Crypto historical data backfill requests (24/7 trading, ~17K data points per symbol)",
  },
  "ticker-add-queue": {
    description:
      "New ticker registration requests (adds stocks/crypto to tracking)",
  },
  "analysis-backfill-queue": {
    description:
      "Candlestick pattern analysis backfill requests (triggered after price data backfill)",
  },
  "telegram.messages": {
    description: "Incoming user messages awaiting AI processing",
  },
  "telegram.dlq": {
    description: "Dead letter queue - failed messages after max retries",
  },
};

/**
 * Map of queue name prefixes to friendly owner names
 * Add new services here for custom naming, otherwise auto-derived from prefix
 */
const OWNER_MAP: Record<string, string> = {
  backfill: "TwelveData Worker",
  crypto: "TwelveData Worker",
  ticker: "TwelveData Worker",
  analysis: "Candlestick Analysis Worker",
  telegram: "Telegram Bot",
};

/**
 * Auto-derive owner from queue name prefix
 * Handles formats: "prefix-queue", "prefix.queue", "prefix_queue"
 */
function deriveOwnerFromQueue(queueName: string): string {
  // Extract prefix (before first separator: - . or _)
  const prefix = queueName.split(/[-._]/)[0];

  // Check if we have a custom mapping
  if (OWNER_MAP[prefix]) {
    return OWNER_MAP[prefix];
  }

  // Auto-convert: kebab-case or snake_case → Title Case + " Worker"
  const titleCase = prefix
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return `${titleCase} Worker`;
}

/**
 * Get metadata for a queue
 * Fully automatic - always returns metadata (derived if not in registry)
 */
export function getQueueMetadata(queueName: string): QueueMetadata {
  // Default auto-derived metadata
  const autoMetadata: QueueMetadata = {
    owner: deriveOwnerFromQueue(queueName),
    description: null,
  };

  // Try exact match in registry for enhanced metadata
  if (QUEUE_REGISTRY[queueName]) {
    return { ...autoMetadata, ...QUEUE_REGISTRY[queueName] };
  }

  // Return auto-derived metadata (fully automatic)
  return autoMetadata;
}

/**
 * Get the owner of a queue (always returns a value)
 */
export function getQueueOwner(queueName: string): string {
  return getQueueMetadata(queueName).owner;
}
