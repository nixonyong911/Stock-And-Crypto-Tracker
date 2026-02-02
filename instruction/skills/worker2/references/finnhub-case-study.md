# Finnhub Worker Case Study

This document details the specific bugs encountered and fixes applied when deploying the Finnhub fundamentals worker.

## Bug Timeline

### Bug 1: API URL Construction (Critical)

**Error:**
```
System.Text.Json.JsonException: '<' is an invalid start of a value
```

**Root Cause:** HttpClient was receiving HTML error page instead of JSON because URLs were malformed.

**Investigation:**
```bash
# Test API directly from container
docker exec finnhub curl -s "https://finnhub.io/api/v1/stock/profile2?symbol=AAPL&token=xxx"
# Returns valid JSON - so API works

# Check what URL the code was constructing
# BaseAddress: https://finnhub.io/api/v1
# URL: /stock/profile2?...
# Result: https://finnhub.io/stock/profile2 (WRONG - /api/v1 replaced!)
```

**Fix Applied:**
```csharp
// Before
_httpClient.BaseAddress = new Uri(_settings.BaseUrl);
var url = $"/stock/profile2?symbol={symbol}&token={_settings.ApiKey}";

// After
var baseUrl = _settings.BaseUrl.TrimEnd('/') + "/";
_httpClient.BaseAddress = new Uri(baseUrl);
var url = $"stock/profile2?symbol={symbol}&token={_settings.ApiKey}";
```

**Commit:** `fix(finnhub): fix API URL construction for HttpClient BaseAddress`

---

### Bug 2: Quarter Field Type Mismatch

**Error:**
```
System.Text.Json.JsonException: The JSON value could not be converted to System.String. Path: $.data[0].quarter
```

**Root Cause:** Finnhub API returns `quarter` as integer (1, 2, 3, 4) but model expected string.

**API Response:**
```json
{
  "data": [{
    "year": 2025,
    "quarter": 3,  // Integer, not "Q3"
    ...
  }]
}
```

**Fix Applied:**
```csharp
// Model change
public int? Quarter { get; set; }  // Was: string?

// Usage change
var fiscalQuarter = latestReport?.Quarter != null 
    ? $"Q{latestReport.Quarter}" 
    : _calcService.GetFiscalQuarter(DateTime.UtcNow.Month);
```

**Commit:** `fix(finnhub): change Quarter field to int, fix fiscal quarter formatting`

---

### Bug 3: Non-Numeric Financial Values

**Error:**
```
System.Text.Json.JsonException: The JSON value could not be converted to System.Nullable`1[System.Decimal]. Path: $.data[38].report.bs[12].value
```

**Root Cause:** Some balance sheet items have value `"N/A"` or empty strings instead of numbers.

**API Response Example:**
```json
{
  "report": {
    "bs": [
      { "concept": "Assets", "value": 123456789.00 },
      { "concept": "Goodwill", "value": "N/A" }  // String, not number!
    ]
  }
}
```

**Fix Applied:**
```csharp
// Model change
public class FinancialItem
{
    public object? Value { get; set; }  // Was: decimal?
}

// Conversion helper
private decimal? ConvertToDecimal(object? value)
{
    if (value == null) return null;
    
    if (value is System.Text.Json.JsonElement jsonElement)
    {
        if (jsonElement.ValueKind == System.Text.Json.JsonValueKind.Number)
            return jsonElement.GetDecimal();
        return null;
    }
    
    if (value is decimal d) return d;
    if (value is double dbl) return (decimal)dbl;
    if (value is string s && decimal.TryParse(s, out var parsed)) return parsed;
    
    return null;
}
```

**Commit:** `fix(finnhub): handle non-numeric financial item values (e.g., 'N/A')`

---

### Bug 4: Database Column Name Mismatch

**Error:**
```
column fs.schedule_time_utc does not exist
```

**Root Cause:** Assumed column name from other workers was `schedule_time_utc` but actual column is `schedule_time`.

**Diagnosis:**
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'worker_fetch_schedules';

-- Result: schedule_time (not schedule_time_utc)
```

**Fix Applied:**
```csharp
const string sql = @"
    SELECT
        fs.schedule_time as ScheduleTimeUtc,  // Was: schedule_time_utc
        ...
    FROM worker_fetch_schedules fs
    ...";
```

**Commit:** `fix(finnhub): fix schedule column name (schedule_time not schedule_time_utc)`

---

### Bug 5: PostgreSQL Time Type Mapping

**Error:**
```
System.Data.DataException: Error parsing column 3 (scheduletimeutc=16:28:00 - Object)
 ---> System.InvalidCastException: Unable to cast object of type 'System.TimeSpan' to type 'System.TimeOnly'.
```

**Root Cause:** PostgreSQL `time without time zone` maps to `TimeSpan` in .NET/Dapper, not `TimeOnly`.

**Fix Applied:**
```csharp
// Model change
public class FetchSchedule
{
    public TimeSpan ScheduleTimeUtc { get; set; }  // Was: TimeOnly
}

// Worker code change
private TimeSpan CalculateDelay(TimeSpan scheduleTime)  // Was: TimeOnly
{
    var now = DateTime.UtcNow;
    var todaySchedule = now.Date.Add(scheduleTime);  // Was: scheduleTime.ToTimeSpan()
    ...
}
```

**Commit:** `fix(finnhub): use TimeSpan instead of TimeOnly for schedule_time`

---

## Final Working Configuration

### docker-compose.yml
```yaml
finnhub:
  image: stocktracker-finnhub:${FINNHUB_VERSION:-latest}
  environment:
    - PATH_BASE=/api/finnhub
    - ConnectionStrings__DefaultConnection=${DATABASE_URL_NET_DIRECT}  # Direct connection
    - Finnhub__ApiKey=${FINNHUB_API_KEY}
    - Finnhub__BaseUrl=https://finnhub.io/api/v1
    - Finnhub__RateLimitDelayMs=2000
```

### Verification Results
- All 10 tickers fetched successfully
- No duplicate records (upsert working)
- Scheduled trigger executes at configured time
- Health endpoints responding correctly
