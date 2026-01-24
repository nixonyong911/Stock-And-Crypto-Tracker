/**
 * RabbitMQ Management API client
 * Uses HTTP API exposed by rabbitmq:3-management-alpine on port 15672
 */

// RabbitMQ Management API response types
export interface RabbitMQQueue {
  name: string;
  vhost: string;
  durable: boolean;
  auto_delete: boolean;
  messages: number;
  messages_ready: number;
  messages_unacknowledged: number;
  consumers: number;
  memory: number;
  state: string;
  idle_since?: string;
  message_stats?: {
    publish?: number;
    publish_details?: { rate: number };
    deliver?: number;
    deliver_details?: { rate: number };
    deliver_get?: number;
    deliver_get_details?: { rate: number };
    ack?: number;
    ack_details?: { rate: number };
  };
}

export interface RabbitMQOverview {
  cluster_name: string;
  queue_totals: {
    messages: number;
    messages_ready: number;
    messages_unacknowledged: number;
  };
  object_totals: {
    consumers: number;
    queues: number;
    exchanges: number;
    connections: number;
    channels: number;
  };
  message_stats?: {
    publish?: number;
    publish_details?: { rate: number };
    deliver?: number;
    deliver_details?: { rate: number };
  };
  node: string;
}

export interface QueueStats {
  name: string;
  messagesReady: number;
  messagesUnacked: number;
  totalMessages: number;
  consumers: number;
  memory: number;
  publishRate: number;
  deliverRate: number;
  idleSince: string | null;
  state: string;
}

export interface OverviewStats {
  totalQueues: number;
  totalMessages: number;
  messagesReady: number;
  messagesUnacked: number;
  totalConsumers: number;
  totalConnections: number;
  publishRate: number;
  deliverRate: number;
}

// Lazy-initialized config to avoid build-time errors
function getConfig() {
  const managementUrl = process.env.RABBITMQ_MANAGEMENT_URL;
  const password = process.env.RABBITMQ_PASSWORD;

  if (!managementUrl) {
    throw new Error("Missing RABBITMQ_MANAGEMENT_URL environment variable");
  }
  if (!password) {
    throw new Error("Missing RABBITMQ_PASSWORD environment variable");
  }

  return {
    baseUrl: managementUrl.replace(/\/$/, ""), // Remove trailing slash
    username: "stocktracker",
    password,
  };
}

/**
 * Make authenticated request to RabbitMQ Management API
 */
async function fetchRabbitMQ<T>(endpoint: string): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}/api${endpoint}`;
  
  const auth = Buffer.from(`${config.username}:${config.password}`).toString("base64");
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    // Don't cache management API responses
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`RabbitMQ API error: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Health check for RabbitMQ connection
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const overview = await fetchRabbitMQ<RabbitMQOverview>("/overview");
    return !!overview.cluster_name;
  } catch {
    return false;
  }
}

/**
 * Get RabbitMQ server overview stats
 */
export async function getOverview(): Promise<OverviewStats | null> {
  try {
    const overview = await fetchRabbitMQ<RabbitMQOverview>("/overview");
    
    return {
      totalQueues: overview.object_totals?.queues ?? 0,
      totalMessages: overview.queue_totals?.messages ?? 0,
      messagesReady: overview.queue_totals?.messages_ready ?? 0,
      messagesUnacked: overview.queue_totals?.messages_unacknowledged ?? 0,
      totalConsumers: overview.object_totals?.consumers ?? 0,
      totalConnections: overview.object_totals?.connections ?? 0,
      publishRate: overview.message_stats?.publish_details?.rate ?? 0,
      deliverRate: overview.message_stats?.deliver_details?.rate ?? 0,
    };
  } catch (error) {
    console.error("Failed to get RabbitMQ overview:", error);
    return null;
  }
}

/**
 * List all queues with detailed stats
 */
export async function listQueues(): Promise<QueueStats[]> {
  try {
    const queues = await fetchRabbitMQ<RabbitMQQueue[]>("/queues");
    
    return queues.map((q) => ({
      name: q.name,
      messagesReady: q.messages_ready ?? 0,
      messagesUnacked: q.messages_unacknowledged ?? 0,
      totalMessages: q.messages ?? 0,
      consumers: q.consumers ?? 0,
      memory: q.memory ?? 0,
      publishRate: q.message_stats?.publish_details?.rate ?? 0,
      deliverRate: q.message_stats?.deliver_get_details?.rate ?? 0,
      idleSince: q.idle_since ?? null,
      state: q.state ?? "unknown",
    }));
  } catch (error) {
    console.error("Failed to list RabbitMQ queues:", error);
    return [];
  }
}
