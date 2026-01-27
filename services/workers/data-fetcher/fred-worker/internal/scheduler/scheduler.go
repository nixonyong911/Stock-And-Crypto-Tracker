package scheduler

import (
	"context"
	"log/slog"
	"time"
)

// Scheduler handles daily scheduled execution
type Scheduler struct {
	scheduleTime     string // HH:MM format
	scheduleTimezone string // IANA timezone
	fetchFunc        func() error
}

// New creates a new Scheduler
func New(scheduleTime, scheduleTimezone string, fetchFunc func() error) *Scheduler {
	return &Scheduler{
		scheduleTime:     scheduleTime,
		scheduleTimezone: scheduleTimezone,
		fetchFunc:        fetchFunc,
	}
}

// Start begins the scheduling loop
func (s *Scheduler) Start(ctx context.Context) {
	slog.Info("Scheduler starting",
		"schedule_time", s.scheduleTime,
		"timezone", s.scheduleTimezone)

	for {
		delay, nextRun := s.calculateDelay()
		slog.Info("Next scheduled run",
			"next_run", nextRun.Format(time.RFC3339),
			"delay", delay.Round(time.Minute))

		select {
		case <-ctx.Done():
			slog.Info("Scheduler stopped")
			return
		case <-time.After(delay):
			slog.Info("Executing scheduled fetch")
			if err := s.fetchFunc(); err != nil {
				slog.Error("Scheduled fetch failed", "error", err)
			}
			// Small delay to prevent running twice in the same minute
			time.Sleep(time.Minute)
		}
	}
}

// calculateDelay returns the duration until the next scheduled run
func (s *Scheduler) calculateDelay() (time.Duration, time.Time) {
	// Load timezone
	loc, err := time.LoadLocation(s.scheduleTimezone)
	if err != nil {
		slog.Warn("Invalid timezone, using UTC", "timezone", s.scheduleTimezone, "error", err)
		loc = time.UTC
	}

	// Parse schedule time
	scheduleHour, scheduleMin := 8, 0 // Default to 08:00
	if _, err := time.Parse("15:04", s.scheduleTime); err == nil {
		parsed, _ := time.Parse("15:04", s.scheduleTime)
		scheduleHour = parsed.Hour()
		scheduleMin = parsed.Minute()
	}

	// Current time in target timezone
	now := time.Now().In(loc)

	// Today's scheduled time
	scheduled := time.Date(
		now.Year(), now.Month(), now.Day(),
		scheduleHour, scheduleMin, 0, 0, loc,
	)

	// If we've passed today's scheduled time, schedule for tomorrow
	if now.After(scheduled) {
		scheduled = scheduled.Add(24 * time.Hour)
	}

	delay := scheduled.Sub(now)
	return delay, scheduled
}

// GetNextRunTime returns the next scheduled run time
func (s *Scheduler) GetNextRunTime() time.Time {
	_, nextRun := s.calculateDelay()
	return nextRun
}

// ========================================
// Weekly Scheduler (for calendar sync)
// ========================================

// WeeklyScheduler handles weekly scheduled execution
type WeeklyScheduler struct {
	dayOfWeek        time.Weekday // e.g., time.Sunday
	scheduleTime     string       // HH:MM format
	scheduleTimezone string       // IANA timezone
	syncFunc         func() error
}

// NewWeeklyScheduler creates a new weekly scheduler
func NewWeeklyScheduler(dayOfWeek time.Weekday, scheduleTime, scheduleTimezone string, syncFunc func() error) *WeeklyScheduler {
	return &WeeklyScheduler{
		dayOfWeek:        dayOfWeek,
		scheduleTime:     scheduleTime,
		scheduleTimezone: scheduleTimezone,
		syncFunc:         syncFunc,
	}
}

// Start begins the weekly scheduling loop
func (w *WeeklyScheduler) Start(ctx context.Context) {
	slog.Info("Weekly scheduler starting",
		"day_of_week", w.dayOfWeek.String(),
		"schedule_time", w.scheduleTime,
		"timezone", w.scheduleTimezone)

	for {
		delay, nextRun := w.calculateWeeklyDelay()
		slog.Info("Next weekly calendar sync",
			"next_run", nextRun.Format(time.RFC3339),
			"delay", delay.Round(time.Hour))

		select {
		case <-ctx.Done():
			slog.Info("Weekly scheduler stopped")
			return
		case <-time.After(delay):
			slog.Info("Executing weekly calendar sync")
			if err := w.syncFunc(); err != nil {
				slog.Error("Weekly calendar sync failed", "error", err)
			}
			// Small delay to prevent running twice
			time.Sleep(time.Minute)
		}
	}
}

// calculateWeeklyDelay returns the duration until the next scheduled weekly run
func (w *WeeklyScheduler) calculateWeeklyDelay() (time.Duration, time.Time) {
	// Load timezone
	loc, err := time.LoadLocation(w.scheduleTimezone)
	if err != nil {
		slog.Warn("Invalid timezone, using UTC", "timezone", w.scheduleTimezone, "error", err)
		loc = time.UTC
	}

	// Parse schedule time
	scheduleHour, scheduleMin := 0, 0 // Default to 00:00
	if _, err := time.Parse("15:04", w.scheduleTime); err == nil {
		parsed, _ := time.Parse("15:04", w.scheduleTime)
		scheduleHour = parsed.Hour()
		scheduleMin = parsed.Minute()
	}

	// Current time in target timezone
	now := time.Now().In(loc)

	// Find the next occurrence of the target day of week
	daysUntilTarget := int(w.dayOfWeek) - int(now.Weekday())
	if daysUntilTarget < 0 {
		daysUntilTarget += 7
	}

	// Calculate the scheduled time for that day
	scheduled := time.Date(
		now.Year(), now.Month(), now.Day()+daysUntilTarget,
		scheduleHour, scheduleMin, 0, 0, loc,
	)

	// If we're on the target day but past the scheduled time, go to next week
	if daysUntilTarget == 0 && now.After(scheduled) {
		scheduled = scheduled.Add(7 * 24 * time.Hour)
	}

	delay := scheduled.Sub(now)
	return delay, scheduled
}

// GetNextWeeklyRunTime returns the next scheduled weekly run time
func (w *WeeklyScheduler) GetNextWeeklyRunTime() time.Time {
	_, nextRun := w.calculateWeeklyDelay()
	return nextRun
}
