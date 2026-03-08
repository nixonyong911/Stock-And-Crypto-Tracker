using DataFetcher.Worker.Infrastructure.Common;
using Xunit;

namespace DataFetcher.Worker.Tests;

public class IntervalScheduleHelperTests
{
    [Theory]
    [InlineData(30, 5)]
    [InlineData(30, 10)]
    [InlineData(30, 15)]
    [InlineData(60, 0)]
    [InlineData(15, 7)]
    public void CalculateDelayUntilNextInterval_ReturnsPositiveDelay(int interval, int offset)
    {
        var (delay, nextRun) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(interval, offset);

        Assert.True(delay >= TimeSpan.Zero, $"Delay should be non-negative, got {delay}");
        Assert.True(delay <= TimeSpan.FromMinutes(interval), $"Delay should be at most {interval} min, got {delay}");
        Assert.True(nextRun > DateTime.UtcNow.AddSeconds(-2), "Next run should be in the future");
    }

    [Theory]
    [InlineData(30, 5)]
    [InlineData(30, 10)]
    [InlineData(30, 15)]
    public void CalculateDelayUntilNextInterval_NextRunAlignedToOffset(int interval, int offset)
    {
        var (_, nextRun) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(interval, offset);

        var minuteOfDay = nextRun.Hour * 60 + nextRun.Minute;
        var remainder = (minuteOfDay - offset) % interval;

        Assert.Equal(0, remainder);
        Assert.Equal(0, nextRun.Second);
    }

    [Fact]
    public void CalculateDelayUntilNextInterval_30Min_Offset5_ProducesCorrectSlots()
    {
        var (_, nextRun) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(30, 5);

        var minute = nextRun.Minute;
        Assert.True(minute == 5 || minute == 35, $"Expected minute 5 or 35, got {minute}");
    }

    [Fact]
    public void CalculateDelayUntilNextInterval_30Min_Offset10_ProducesCorrectSlots()
    {
        var (_, nextRun) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(30, 10);

        var minute = nextRun.Minute;
        Assert.True(minute == 10 || minute == 40, $"Expected minute 10 or 40, got {minute}");
    }

    [Fact]
    public void CalculateDelayUntilNextInterval_30Min_Offset15_ProducesCorrectSlots()
    {
        var (_, nextRun) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(30, 15);

        var minute = nextRun.Minute;
        Assert.True(minute == 15 || minute == 45, $"Expected minute 15 or 45, got {minute}");
    }

    [Theory]
    [InlineData("UTC")]
    [InlineData("America/New_York")]
    public void CalculateDelayUntilScheduledTime_ReturnsPositiveDelay(string timezone)
    {
        var scheduleTime = TimeSpan.FromHours(3);
        var (delay, nextRun) = IntervalScheduleHelper.CalculateDelayUntilScheduledTime(scheduleTime, timezone);

        Assert.True(delay >= TimeSpan.Zero);
        Assert.True(delay <= TimeSpan.FromHours(24));
        Assert.True(nextRun > DateTime.UtcNow.AddSeconds(-2));
    }

    [Fact]
    public void CalculateDelayUntilScheduledTime_InvalidTimezone_FallsBackToUtc()
    {
        var scheduleTime = TimeSpan.FromHours(12);
        var (delay, _) = IntervalScheduleHelper.CalculateDelayUntilScheduledTime(scheduleTime, "Invalid/Timezone");

        Assert.True(delay >= TimeSpan.Zero);
        Assert.True(delay <= TimeSpan.FromHours(24));
    }

    [Fact]
    public void CalculateDelayUntilNextInterval_ConsecutiveCallsProduceSameTarget()
    {
        var (_, nextRun1) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(30, 5);
        var (_, nextRun2) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(30, 5);

        Assert.Equal(nextRun1, nextRun2);
    }

    [Fact]
    public void CalculateDelayUntilNextInterval_DifferentOffsets_ProduceDifferentTargets()
    {
        var (_, nextRun5) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(30, 5);
        var (_, nextRun10) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(30, 10);
        var (_, nextRun15) = IntervalScheduleHelper.CalculateDelayUntilNextInterval(30, 15);

        Assert.NotEqual(nextRun5, nextRun10);
        Assert.NotEqual(nextRun10, nextRun15);
    }
}
