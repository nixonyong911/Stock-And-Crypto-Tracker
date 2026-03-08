namespace DataFetcher.Worker.Infrastructure.Common;

/// <summary>
/// Shared scheduling utilities for both interval-based and daily time-of-day scheduling.
/// </summary>
public static class IntervalScheduleHelper
{
    /// <summary>
    /// Calculates delay until the next clock-aligned interval run.
    /// For example, interval=30, offset=5 produces runs at :05, :35 of every hour.
    /// </summary>
    public static (TimeSpan Delay, DateTime NextRunUtc) CalculateDelayUntilNextInterval(int intervalMinutes, int offsetMinutes)
    {
        var now = DateTime.UtcNow;
        var minutesSinceMidnight = now.Hour * 60 + now.Minute;
        var currentSecondFraction = now.Second + now.Millisecond / 1000.0;

        var nextRunMinute = offsetMinutes;
        while (nextRunMinute < minutesSinceMidnight ||
               (nextRunMinute == minutesSinceMidnight && currentSecondFraction > 0))
        {
            nextRunMinute += intervalMinutes;
        }

        DateTime nextRun;
        if (nextRunMinute >= 24 * 60)
        {
            nextRun = now.Date.AddDays(1).AddMinutes(offsetMinutes);
        }
        else
        {
            nextRun = now.Date.AddMinutes(nextRunMinute);
        }

        var delay = nextRun - now;
        if (delay < TimeSpan.Zero)
            delay = TimeSpan.Zero;

        return (delay, nextRun);
    }

    /// <summary>
    /// Calculates delay until the next occurrence of a daily scheduled time, accounting for timezone and DST.
    /// Extracted from individual workers to eliminate duplication.
    /// </summary>
    public static (TimeSpan Delay, DateTime NextRunUtc) CalculateDelayUntilScheduledTime(TimeSpan scheduleTime, string scheduleTimezone)
    {
        var now = DateTime.UtcNow;

        TimeZoneInfo tz;
        try
        {
            tz = TimeZoneInfo.FindSystemTimeZoneById(scheduleTimezone);
        }
        catch (TimeZoneNotFoundException)
        {
            tz = TimeZoneInfo.Utc;
        }

        var nowInTz = TimeZoneInfo.ConvertTimeFromUtc(now, tz);
        var todayScheduledInTz = nowInTz.Date.Add(scheduleTime);

        if (nowInTz >= todayScheduledInTz)
        {
            todayScheduledInTz = todayScheduledInTz.AddDays(1);
        }

        var scheduledUtc = TimeZoneInfo.ConvertTimeToUtc(todayScheduledInTz, tz);
        var delay = scheduledUtc - now;

        if (delay < TimeSpan.Zero)
            delay = TimeSpan.Zero;

        return (delay, scheduledUtc);
    }
}
