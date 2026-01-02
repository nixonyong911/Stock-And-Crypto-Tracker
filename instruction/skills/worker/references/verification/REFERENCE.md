# Verification Reference

## Pre-Deployment Checklist

- [ ] `dotnet build` succeeds
- [ ] `curl http://localhost:8080/health/live` returns 200
- [ ] Swagger UI loads at `/swagger`
- [ ] Metrics visible at `/api/metrics/workers`
- [ ] Database entries exist (data_sources, fetch_schedules)

## Post-Deployment Commands

```bash
# Check container
ssh-azure "docker ps | grep yourworker"

# Health check
curl https://nxserver.malaysiawest.cloudapp.azure.com/api/yourworker/health/live

# Test trigger
curl -X POST .../api/yourworker/api/trigger/TEST

# Check logs
ssh-azure "docker logs yourworker --tail 50"
```

## Database Verification

```sql
SELECT * FROM data_sources WHERE name = 'YourWorker';
SELECT name, schedule_time_utc FROM fetch_schedules WHERE name LIKE '%YourWorker%';
SELECT COUNT(*), MAX(created_at) FROM your_table;
```

## Grafana Verification

1. Open Grafana Cloud
2. Query: `{job="stocktracker-metrics"} |= "yourworker"`

## Related
- [CLI VM Skill](../../../cli/References/vm/REFERENCE.md)
