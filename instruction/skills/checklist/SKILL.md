---
name: cache-queue-registry
description: Maintain Redis cache and RabbitMQ queue registries in back-office. Use when adding descriptions for new cache keys or queues, or when "Unknown" appears in the Infrastructure monitoring pages.
---

# Cache & Queue Registry Maintenance

## Table of Contents

- [Cache \& Queue Registry Maintenance](#cache--queue-registry-maintenance)
  - [Table of Contents](#table-of-contents)
  - [Redis Cache and RabbitMQ Registry Reference](#redis-cache-and-rabbitmq-registry-reference)

---

## Redis Cache and RabbitMQ Registry Reference

Registry files map cache keys and queue names to human-readable metadata (owner, description). New keys/queues are auto-discovered; descriptions require manual registry entry.

See [references/registry-files.md](references/registry-files.md) for file locations and entry format.
