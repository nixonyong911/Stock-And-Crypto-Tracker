# Registry Files Reference

## File Locations

| Registry | Path |
|----------|------|
| Redis Cache | `services/back-office/src/lib/redis/registry.ts` |
| RabbitMQ Queues | `services/back-office/src/lib/rabbitmq/registry.ts` |

## How Auto-Discovery Works

1. **Keys/Queues**: Discovered automatically from Redis/RabbitMQ
2. **Owner**: Auto-derived from name prefix (e.g., `twelvedata:*` → "TwelveData")
3. **Description**: Must be manually added to registry

## Entry Format

### Redis Cache Registry

```typescript
export const CACHE_REGISTRY: Record<string, Partial<CacheMetadata>> = {
  "key-pattern:*": {
    description: "What this cache stores",
  },
};

const OWNER_MAP: Record<string, string> = {
  "prefix": "Custom Owner Name",
};
```

### RabbitMQ Queue Registry

```typescript
export const QUEUE_REGISTRY: Record<string, Partial<QueueMetadata>> = {
  "queue-name": {
    description: "What this queue processes",
  },
};

const OWNER_MAP: Record<string, string> = {
  "prefix": "Custom Owner Name",
};
```

## Pattern Matching

- Redis supports wildcard patterns: `twelvedata:daily:*`
- RabbitMQ uses exact queue names: `backfill-queue`
