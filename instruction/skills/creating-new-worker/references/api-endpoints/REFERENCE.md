# API Endpoints Reference

## Required Endpoints

| Endpoint | Method | Response |
|----------|--------|----------|
| `/health/live` | GET | `200 OK` if running |
| `/health/ready` | GET | `200 OK` if DB connected |
| `/api/{worker}/status` | GET | Worker config JSON |
| `/api/{worker}/trigger/{id}` | POST | Single operation result |
| `/api/{worker}/trigger/all` | POST | Batch operation result |

## Response DTOs

```json
// Status Response
{ "service": "YourWorker", "status": "Running", "config": { "interval": "15min" } }

// Trigger Response
{ "success": true, "message": "Processed 26 records", "recordsProcessed": 26 }
```

## Swagger Configuration

```csharp
// Program.cs
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c => {
    c.SwaggerDoc("v1", new() { Title = "YourWorker API", Version = "v1" });
});

app.UseSwagger();
app.UseSwaggerUI(c => {
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "YourWorker v1");
    c.RoutePrefix = "swagger";
});
```

## PATH_BASE for Reverse Proxy

```yaml
environment:
  - PATH_BASE=/api/yourworker
```

## Related
- [Verification Reference](../verification/REFERENCE.md)
