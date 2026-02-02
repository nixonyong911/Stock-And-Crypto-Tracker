---
name: worker2
description: Use when deploying .NET workers to VM and encountering API errors, database column mismatches, or JSON deserialization failures. Reference for common worker deployment bugs and their fixes.
---

# Worker Deployment Debugging

## Overview

This skill documents common bugs encountered when deploying .NET workers (data-fetchers) to the VM environment, particularly when integrating with external APIs (Finnhub, TwelveData, etc.) and PostgreSQL databases via Supabase.

## When to Use

- Worker returns HTML instead of JSON from external API
- JSON deserialization fails with "invalid start of value"
- Database queries fail with "column does not exist"
- Dapper throws InvalidCastException on time columns
- Worker health checks pass but scheduled jobs fail

## Quick Reference

| Symptom                                      | Likely Cause                         | Fix                                          |
| -------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `'<' is an invalid start of a value`         | API URL construction wrong           | Use relative URLs without leading `/`        |
| `Cannot convert to System.String`            | API returns number for string field  | Change model property to correct type        |
| `Cannot convert to System.Nullable<Decimal>` | API returns "N/A" or non-numeric     | Use `object?` type, convert manually         |
| `column X does not exist`                    | Wrong column name in SQL             | Query `information_schema.columns` to verify |
| `Unable to cast TimeSpan to TimeOnly`        | PostgreSQL time → .NET type mismatch | Use `TimeSpan` not `TimeOnly`                |
| Worker crashes after schedule check          | Multiple issues in BackgroundService | Add try-catch, verify all DB queries         |

## Common Bugs and Fixes

### 1. HttpClient BaseAddress URL Construction

**Symptom:** API returns HTML error page, `'<' is an invalid start of a value`

**Cause:** When using `HttpClient.BaseAddress`, URLs starting with `/` replace the entire path instead of appending.

**Wrong:**

```csharp
_httpClient.BaseAddress = new Uri("https://api.example.com/v1");
var url = $"/endpoint?key={apiKey}";  // Results in: https://api.example.com/endpoint
```

**Correct:**

```csharp
// Ensure base URL ends with /
var baseUrl = settings.BaseUrl.TrimEnd('/') + "/";
_httpClient.BaseAddress = new Uri(baseUrl);
var url = $"endpoint?key={apiKey}";  // Results in: https://api.example.com/v1/endpoint
```

### 2. JSON Number vs String Mismatch

**Symptom:** `The JSON value could not be converted to System.String`

**Cause:** External API returns numeric values where model expects strings.

**Example:** Finnhub returns `quarter` as integer `1` but model has `string? Quarter`

**Fix:** Match the model property type to the actual API response:

```csharp
// Wrong
public string? Quarter { get; set; }

// Correct
public int? Quarter { get; set; }
```

Then convert when needed:

```csharp
var fiscalQuarter = latestReport?.Quarter != null
    ? $"Q{latestReport.Quarter}"
    : GetFiscalQuarter(DateTime.UtcNow.Month);
```

### 3. Non-Numeric Financial Values

**Symptom:** `Cannot convert to System.Nullable<Decimal>` at path like `$.data[X].report.bs[Y].value`

**Cause:** Financial APIs sometimes return `"N/A"`, `"none"`, or empty strings instead of numbers.

**Fix:** Use `object?` type and convert manually:

```csharp
public class FinancialItem
{
    public string? Concept { get; set; }
    public object? Value { get; set; }  // Can be decimal or string
}

private decimal? ConvertToDecimal(object? value)
{
    if (value == null) return null;

    if (value is System.Text.Json.JsonElement jsonElement)
    {
        if (jsonElement.ValueKind == System.Text.Json.JsonValueKind.Number)
            return jsonElement.GetDecimal();
        return null;  // Skip string values like "N/A"
    }

    if (value is decimal d) return d;
    if (value is double dbl) return (decimal)dbl;
    if (value is string s && decimal.TryParse(s, out var parsed)) return parsed;

    return null;
}
```

### 4. Database Column Name Mismatch

**Symptom:** `column fs.schedule_time_utc does not exist`

**Cause:** SQL query uses wrong column name (assumed vs actual).

**Diagnosis:** Query the schema:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'worker_fetch_schedules';
```

**Fix:** Update SQL to use correct column name:

```csharp
// Wrong
const string sql = "SELECT fs.schedule_time_utc as ScheduleTimeUtc FROM ...";

// Correct
const string sql = "SELECT fs.schedule_time as ScheduleTimeUtc FROM ...";
```

### 5. PostgreSQL Time Type Mapping

**Symptom:** `Unable to cast object of type 'System.TimeSpan' to type 'System.TimeOnly'`

**Cause:** PostgreSQL `time without time zone` maps to .NET `TimeSpan`, not `TimeOnly`.

**Fix:** Use `TimeSpan` in your model:

```csharp
// Wrong
public TimeOnly ScheduleTimeUtc { get; set; }

// Correct
public TimeSpan ScheduleTimeUtc { get; set; }
```

Update usage accordingly:

```csharp
// Wrong (TimeOnly)
var todaySchedule = now.Date.Add(scheduleTime.ToTimeSpan());

// Correct (TimeSpan)
var todaySchedule = now.Date.Add(scheduleTime);
```

### 6. Direct Database Connection

**Symptom:** Connection timeouts, multiplexing errors, or inconsistent behavior

**Cause:** Using pooled connection (`DATABASE_CONNECTION_STRING`) instead of direct.

**Fix:** Use `DATABASE_URL_NET_DIRECT` for workers:

```yaml
# docker-compose.yml
environment:
  # Database connection (direct, bypasses pooler for best performance)
  - ConnectionStrings__DefaultConnection=${DATABASE_URL_NET_DIRECT}
```

## Verification Steps

After fixing bugs, verify each component:

1. **Health Check:**

   ```bash
   curl -sf https://server/api/worker/health/live
   ```

2. **Single Ticker Test:**

   ```bash
   curl -X POST https://server/api/worker/api/fetch/trigger/1 | jq .
   ```

3. **All Tickers Test:**

   ```bash
   curl -X POST https://server/api/worker/api/fetch/trigger/all | jq .
   ```

4. **Database Verification:**

   ```sql
   SELECT symbol, COUNT(*) FROM table GROUP BY symbol HAVING COUNT(*) > 1;
   ```

5. **Scheduled Job Test:**
   - Update schedule time to +2 minutes
   - Restart container
   - Watch logs for trigger
   - Revert schedule time after verification

## Container Debugging

```bash
# Check if container is using latest image
docker ps | grep worker-name
docker images | grep worker-name

# Force recreate with new image
./scripts/start-services.sh up -d worker-name --force-recreate

# Check logs
docker logs worker-name --tail 50

# Test API from inside container
docker exec worker-name curl -s "https://api.example.com/endpoint?key=xxx"
```

## Common Mistakes

| Mistake                                            | Consequence              |
| -------------------------------------------------- | ------------------------ |
| Not restarting container after deploy              | Old code still running   |
| Assuming column names without checking schema      | Runtime SQL errors       |
| Using `TimeOnly` for PostgreSQL time columns       | Dapper cast exceptions   |
| Starting HTTP URLs with `/` when using BaseAddress | Wrong URL construction   |
| Expecting all API values to be numeric             | Deserialization failures |
