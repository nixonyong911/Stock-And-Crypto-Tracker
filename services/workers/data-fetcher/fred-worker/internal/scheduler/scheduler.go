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
