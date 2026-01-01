# Dapper TimeOnly Type Mismatch Bug

**Date**: December 27, 2025  
**Status**: 🔴 BUG - Breaks scheduled fetch worker  
**Priority**: High

## Bug Description

The TwelveData background worker crashes when trying to load the fetch schedule from the database. The scheduled fetch functionality is completely broken - only manual API triggers work.

### Error Message

```
System.Data.DataException: Error parsing column 4 (scheduletimeutc=22:00:00 - Object)
 ---> System.InvalidCastException: Unable to cast object of type 'System.TimeSpan' to type 'System.TimeOnly'.
   at Deserializeb626c9e9-aa4c-4350-95b7-8b89f211ac63(DbDataReader)
   --- End of inner exception stack trace ---
   at Dapper.SqlMapper.ThrowDataException(Exception ex, Int32 index, IDataReader reader, Object value)
   at Dapper.SqlMapper.QueryRowAsync[T](...)
   at TwelveData.Worker.Repositories.FetchScheduleRepository.GetScheduleByDataSourceNameAsync(String dataSourceName)
   at TwelveData.Worker.Workers.StockFetchWorker.ExecuteAsync(CancellationToken stoppingToken)
```

## Root Cause

| Component | Type | Issue |
|-----------|------|-------|
| PostgreSQL column | `time without time zone` | Stores time as `22:00:00` |
| Npgsql driver | Returns `TimeSpan` | PostgreSQL `time` → .NET `TimeSpan` |
| C# model | Uses `TimeOnly` | C# 10+ type, not auto-converted by Dapper |
| Dapper | No built-in handler | Fails to cast `TimeSpan` → `TimeOnly` |

## Affected Files

### Model
`services/workers/data-fetcher/TwelveData/src/TwelveData.Worker/Models/FetchSchedule.cs`

```csharp
public class FetchSchedule
{
    // ... other properties
    public TimeOnly ScheduleTimeUtc { get; set; }  // <-- Problem: TimeOnly
    // ...
}
```

### Repository
`services/workers/data-fetcher/TwelveData/src/TwelveData.Worker/Repositories/FetchScheduleRepository.cs`

```csharp
// Line 25: This column causes the error
fs.schedule_time_utc as ScheduleTimeUtc,
```

### Worker
`services/workers/data-fetcher/TwelveData/src/TwelveData.Worker/Workers/StockFetchWorker.cs`

```csharp
// Line 40: This call throws the exception
var schedule = await scheduleRepository.GetScheduleByDataSourceNameAsync(DataSourceName);
```

## Impact

| Feature | Status |
|---------|--------|
| Manual API fetch (`/api/Fetch/trigger/{symbol}`) | ✅ Works |
| Scheduled background fetch | ❌ Broken |
| n8n workflow triggers | ✅ Works (uses API) |
| Cron job triggers | ❌ Broken (uses worker) |

## Fix Options

### Option A: Change Model to Use TimeSpan (Recommended)

**Simplest fix** - Change the model property type to match what Npgsql returns:

```csharp
// FetchSchedule.cs
public TimeSpan ScheduleTimeUtc { get; set; }  // Changed from TimeOnly
```

**Pros**: Simple, no additional code needed  
**Cons**: TimeSpan can represent > 24 hours, less semantic than TimeOnly

---

### Option B: Add Custom Dapper Type Handler

Create a type handler to convert `TimeSpan` → `TimeOnly`:

```csharp
// Create new file: TypeHandlers/TimeOnlyHandler.cs
public class TimeOnlyHandler : SqlMapper.TypeHandler<TimeOnly>
{
    public override TimeOnly Parse(object value)
    {
        return TimeOnly.FromTimeSpan((TimeSpan)value);
    }

    public override void SetValue(IDbDataParameter parameter, TimeOnly value)
    {
        parameter.Value = value.ToTimeSpan();
    }
}

// Register in Program.cs
SqlMapper.AddTypeHandler(new TimeOnlyHandler());
```

**Pros**: Keeps semantic `TimeOnly` type, reusable across project  
**Cons**: More code, another file to maintain

---

### Option C: Use Inline Conversion in SQL

Cast in the SQL query itself:

```csharp
const string sql = @"
    SELECT 
        ...
        EXTRACT(EPOCH FROM fs.schedule_time_utc)::integer as ScheduleTimeSeconds,
        ...";
```

Then convert in C#. **Not recommended** - messy and fragile.

## Recommended Fix

**Option A** is recommended for simplicity. The worker only needs to compare times, and `TimeSpan` works fine for that.

### Steps to Fix

1. Update `FetchSchedule.cs`:
   ```csharp
   public TimeSpan ScheduleTimeUtc { get; set; }
   ```

2. Update `StockFetchWorker.cs` - `CalculateDelayUntilScheduledTime` method:
   - Should already work since it likely converts to `TimeSpan` anyway

3. Test locally
4. Deploy to VM

## Related Documents

- [TwelveData Architecture](../../architecture/twelvedata-architecture.md)
- [Phase 2 Pending](../azure/2025-12-27-vm-migration-phase2-pending.md)

## Notes

- This bug was discovered during the VM migration on December 27, 2025
- The manual API endpoint works because it doesn't use the `FetchSchedule` model
- Estimated fix time: ~15 minutes

