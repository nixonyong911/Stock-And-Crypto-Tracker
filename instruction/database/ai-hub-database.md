# AI Hub Database Schema

## Overview

AI Hub uses two tables in Supabase PostgreSQL:
- `ai_hub_logs` - Request/response logging (7-day retention)
- `ai_hub_rate_tracking` - Rate limit counters per project/model

---

## ai_hub_logs

Stores all AI Hub request/response logs with 7-day automatic retention.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (gen_random_uuid) |
| request_id | UUID | Correlation ID for request |
| model_id | VARCHAR(150) | Full model identifier |
| caller_service | VARCHAR(100) | Calling service name |
| google_project_id | VARCHAR(100) | Google Cloud project ID |
| message_preview | TEXT | First 500 chars of input |
| response_preview | TEXT | First 500 chars of output |
| tokens_input | INT | Input token count |
| tokens_output | INT | Output token count |
| duration_ms | INT | Request duration |
| retry_count | INT | Number of retries |
| rate_limit_type | VARCHAR(10) | RPM/TPM/RPD if hit |
| status | VARCHAR(20) | success/rate_limited/server_error/timeout |
| http_status_code | INT | Provider response code |
| error_message | TEXT | Error details |
| created_at | TIMESTAMPTZ | Timestamp |

### Indexes

- `idx_ai_hub_logs_created` - created_at DESC
- `idx_ai_hub_logs_model` - model_id
- `idx_ai_hub_logs_status` - status
- `idx_ai_hub_logs_project` - google_project_id

### Check Constraint

```sql
status IN ('success', 'rate_limited', 'server_error', 'unavailable', 'client_error', 'timeout')
```

---

## ai_hub_rate_tracking

Tracks rate limit usage per Google Cloud project and model family.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| google_project_id | VARCHAR(100) | Google Cloud project ID |
| model_family | VARCHAR(50) | Model family (gemini-3-flash) |
| minute_window | TIMESTAMPTZ | RPM/TPM window (truncated to minute) |
| requests_count | INT | RPM counter |
| tokens_count | INT | TPM counter |
| pacific_date | DATE | RPD date (Pacific timezone) |
| daily_requests | INT | RPD counter |
| updated_at | TIMESTAMPTZ | Last update |

### Unique Constraint

```sql
UNIQUE(google_project_id, model_family, minute_window)
```

---

## Monitoring Queries

### Error Rate by Model (last 24h)

```sql
SELECT model_id, status, COUNT(*) 
FROM ai_hub_logs 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY model_id, status;
```

### Rate Limit Incidents

```sql
SELECT model_id, rate_limit_type, created_at, error_message 
FROM ai_hub_logs 
WHERE status = 'rate_limited' 
ORDER BY created_at DESC 
LIMIT 50;
```

### Average Response Time

```sql
SELECT model_id, AVG(duration_ms) as avg_ms, COUNT(*) as requests
FROM ai_hub_logs 
WHERE status = 'success' AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY model_id;
```

---

## Maintenance

### Manual Log Cleanup

```sql
DELETE FROM ai_hub_logs WHERE created_at < NOW() - INTERVAL '7 days';
DELETE FROM ai_hub_rate_tracking WHERE minute_window < NOW() - INTERVAL '2 days';
```

### Run Migration

```powershell
cd services/common/StockTracker.Data.Migrations
dotnet run -- migrate
```

---

## EF Core Entities

- `StockTracker.Data.Entities.AiHubLog`
- `StockTracker.Data.Entities.AiHubRateTracking`
- Migration: `AddAiHubTables`



