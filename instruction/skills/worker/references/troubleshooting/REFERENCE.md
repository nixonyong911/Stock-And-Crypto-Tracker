# Troubleshooting Reference

## PATH_BASE 404 Errors

**Symptom:** Worker returns 404 for all routes in Docker
**Cause:** Swagger/API paths not prefixed correctly behind reverse proxy
**Solution:**
```yaml
environment:
  - PATH_BASE=/api/yourworker
```

## Metrics Not Appearing

**Symptom:** Worker runs but no metrics in Grafana
**Cause:** Worker not pushing to Metrics service
**Solution:**
```yaml
environment:
  - MetricsService__BaseUrl=http://metrics:8080
  - MetricsService__WorkerName=yourworker
  - MetricsService__Enabled=true
```

## Health Checks Failing

**Symptom:** Caddy returns 502 or health check fails
**Cause:** Using `handle` instead of `handle_path` (path not stripped)
**Solution:**
```
# Wrong
handle /api/yourworker/* {
    reverse_proxy yourworker:8080
}

# Correct
handle_path /api/yourworker/* {
    reverse_proxy yourworker:8080
}
```

## Database Connection Timeout

**Symptom:** Intermittent DB timeouts in async code
**Cause:** Deadlock from missing ConfigureAwait
**Solution:**
```csharp
// In library/shared code
await connection.QueryAsync(sql).ConfigureAwait(false);
```

## Supavisor Stream Error (Npgsql 8.0)

**Symptom:** `"Exception while reading from stream"` on multi-row queries
**Cause:** Npgsql 8.0 multiplexing incompatible with Supabase Supavisor pooler
**Solution:** In `DbConnectionFactory.cs`:
```csharp
var builder = new NpgsqlConnectionStringBuilder(baseConnectionString)
{
    Multiplexing = false,    // Required for Supavisor
    Pooling = false,         // Supabase has its own pooler
    NoResetOnClose = true    // Pooler compatibility
};
```

## Dapper DateOnly Parameter Error

**Symptom:** `"The member X of type System.DateOnly cannot be used as a parameter value"`
**Cause:** Dapper doesn't natively support .NET 6+ DateOnly type
**Solution:** Register type handler in `Program.cs`:
```csharp
SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());
// See: CandlestickAnalysis.Worker/Infrastructure/DateOnlyTypeHandler.cs
```

## Dynamic Query Returns Nulls

**Symptom:** `QueryAsync<dynamic>` returns null properties despite data existing
**Cause:** Npgsql 8.0 property name mapping differs from column aliases
**Solution:** Use strongly-typed model instead of dynamic:
```csharp
// Instead of: QueryAsync<dynamic>(sql)
// Use: QueryAsync<YourDbRowModel>(sql)
```

## Back-Office Not Discovering Worker

**Symptom:** Worker runs but doesn't appear in back-office UI
**Cause:** Missing `worker_registry` database entry
**Solution:** Execute worker_registry SQL (see database-setup/REFERENCE.md)

## Related
- [Database Setup](../database-setup/REFERENCE.md) - worker_registry SQL
- [Verification](../verification/REFERENCE.md) - Debug commands

