# Database Setup Reference

## 1. Create Entity (if needed)

`services/common/StockTracker.Data/Entities/YourEntity.cs`:
```csharp
public class YourEntity
{
    public Guid Id { get; set; }
    public string Symbol { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
```

Register in `StockTrackerDbContext.cs`:
```csharp
public DbSet<YourEntity> YourEntities => Set<YourEntity>();
```

## 2. Apply Migration via Supabase MCP

Use `apply_migration` (NOT EF Core):
```sql
CREATE TABLE your_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 3. Register Worker (for Back-Office Discovery)

```sql
INSERT INTO worker_registry (name, display_name, description, service_type,
    health_endpoint, status_endpoint, config_schema)
VALUES (
    'yourworker', 'YourWorker Service', 'Description', 'data-fetcher',
    '/api/yourworker/health/live', '/api/yourworker/api/fetch/status',
    '{"schedule": {"properties": {"schedule_time_utc": {"type": "time"}}}}'::jsonb
);
```

## Related
- [Database Schema](../../../../database/schema.md)
- [Troubleshooting](../troubleshooting/REFERENCE.md) - Back-office discovery issues
