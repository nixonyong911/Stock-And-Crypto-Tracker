package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/stocktracker/fred-worker/internal/calc"
	"github.com/stocktracker/fred-worker/internal/config"
	"github.com/stocktracker/fred-worker/internal/db"
	"github.com/stocktracker/fred-worker/internal/fred"
	"github.com/stocktracker/fred-worker/internal/metrics"
	"github.com/stocktracker/fred-worker/internal/scheduler"
	"github.com/stocktracker/fred-worker/internal/server"
)

const version = "1.4.0"

// Schedule ID for FRED Daily Macro Fetch in worker_fetch_schedules table
const fredScheduleID = 4

func main() {
	// Setup structured logging
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("Starting FRED Worker", "version", version)

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		slog.Error("Failed to load configuration", "error", err)
		os.Exit(1)
	}

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize database connection
	dbPool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("Failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer dbPool.Close()

	// Initialize components
	repository := db.NewRepository(dbPool)
	fredClient := fred.NewClient(cfg.FredAPIKey)
	metricsClient := metrics.NewClient(cfg.MetricsServiceURL, "fred-worker")

	// Report worker startup
	if err := metricsClient.SetGauge(ctx, "worker_up", 1, nil); err != nil {
		slog.Warn("Failed to report worker_up metric", "error", err)
	}
	if err := metricsClient.SetGauge(ctx, "worker_info", 1, map[string]string{"version": version}); err != nil {
		slog.Warn("Failed to report worker_info metric", "error", err)
	}

	// Create daily scheduler for indicator data fetch (08:00 ET)
	dailySched := scheduler.New(cfg.ScheduleTime, cfg.ScheduleTimezone, func() error {
		return runFetch(ctx, repository, fredClient, metricsClient)
	})

	// Create weekly scheduler for release calendar sync (Sunday 00:00 ET)
	weeklySched := scheduler.NewWeeklyScheduler(time.Sunday, "00:00", cfg.ScheduleTimezone, func() error {
		return runCalendarSync(ctx, repository, fredClient, metricsClient)
	})

	// Create HTTP server with both trigger functions
	srv := server.New(cfg.HTTPPort, repository, fredClient, metricsClient,
		func() error { return runFetch(ctx, repository, fredClient, metricsClient) },
		func() error { return runCalendarSync(ctx, repository, fredClient, metricsClient) },
		cfg.ScheduleTime, cfg.ScheduleTimezone,
	)

	// Start schedulers in background
	go dailySched.Start(ctx)
	go weeklySched.Start(ctx)

	// Run initial calendar sync on startup (ensures new indicators get calendar data immediately)
	go func() {
		slog.Info("Running initial calendar sync on startup")
		if err := runCalendarSync(ctx, repository, fredClient, metricsClient); err != nil {
			slog.Error("Initial calendar sync failed", "error", err)
		}
	}()

	// Start HTTP server in background
	go func() {
		if err := srv.Start(); err != nil {
			slog.Error("HTTP server error", "error", err)
		}
	}()

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	slog.Info("Shutdown signal received, stopping...")

	// Report worker shutdown
	if err := metricsClient.SetGauge(ctx, "worker_up", 0, nil); err != nil {
		slog.Warn("Failed to report worker_up=0 metric", "error", err)
	}

	// Graceful shutdown
	cancel()
	srv.Stop()

	slog.Info("FRED Worker stopped")
}

// runFetch executes the fetch operation for all active indicators
func runFetch(ctx context.Context, repo *db.Repository, fredClient *fred.Client, metricsClient *metrics.Client) error {
	slog.Info("Starting scheduled fetch")

	// Get all active indicators
	indicators, err := repo.GetActiveIndicators(ctx)
	if err != nil {
		slog.Error("Failed to get active indicators", "error", err)
		return err
	}

	slog.Info("Fetching indicators", "count", len(indicators))

	successCount := 0
	errorCount := 0

	// Track release IDs we've already fetched to avoid duplicate API calls
	releaseCache := make(map[int][]fred.ReleaseDate)

	for _, ind := range indicators {
		// Fetch latest observation from FRED
		obs, err := fredClient.GetLatestObservation(ctx, ind.SeriesID)
		if err != nil {
			slog.Error("Failed to fetch indicator", "series_id", ind.SeriesID, "error", err)
			errorCount++
			_ = metricsClient.IncrementCounter(ctx, "fetch_errors_total", map[string]string{
				"series_id":  ind.SeriesID,
				"error_type": "api_error",
			})
			continue
		}

		// Calculate media-friendly value
		var mediaValue *float64
		var yoyValue *float64
		var yoyDate *time.Time

		if calc.NeedsYearAgoData(ind.DisplayMode) {
			// Fetch year-ago observation for YoY calculation
			yoyObs, err := fredClient.GetYearAgoObservation(ctx, ind.SeriesID, obs.Date)
			if err != nil {
				slog.Warn("Failed to fetch year-ago observation, skipping YoY calc",
					"series_id", ind.SeriesID, "error", err)
			} else {
				yoyValue = &yoyObs.Value
				yoyDate = &yoyObs.Date
				mediaValue = calc.CalculateMediaValue(ind.DisplayMode, obs.Value, yoyValue, ind.DisplayDivisor)
			}
		} else {
			// For non-YoY modes, calculate directly
			mediaValue = calc.CalculateMediaValue(ind.DisplayMode, obs.Value, nil, ind.DisplayDivisor)
		}

		// Fetch official release date from FRED calendar
		var lastReleaseDate *time.Time
		releaseInfo, err := fredClient.GetSeriesRelease(ctx, ind.SeriesID)
		if err == nil {
			// Check cache first
			pastDates, cached := releaseCache[releaseInfo.ReleaseID]
			if !cached {
				pastDates, err = fredClient.GetPastReleaseDates(ctx, releaseInfo.ReleaseID)
				if err != nil {
					slog.Warn("Failed to fetch past release dates",
						"series_id", ind.SeriesID, "release_id", releaseInfo.ReleaseID, "error", err)
				}
				releaseCache[releaseInfo.ReleaseID] = pastDates
			}
			// Use most recent past release date
			if len(pastDates) > 0 {
				lastReleaseDate = &pastDates[0].Date
			}
		}

		// Upsert to database with media value and release date
		if err := repo.UpsertIndicatorWithMedia(ctx, ind.SeriesID, obs.Value, obs.Date, mediaValue, yoyValue, yoyDate, lastReleaseDate); err != nil {
			slog.Error("Failed to upsert indicator", "series_id", ind.SeriesID, "error", err)
			errorCount++
			_ = metricsClient.IncrementCounter(ctx, "fetch_errors_total", map[string]string{
				"series_id":  ind.SeriesID,
				"error_type": "db_error",
			})
			continue
		}

		successCount++
		slog.Info("Updated indicator",
			"series_id", ind.SeriesID,
			"raw_value", obs.Value,
			"media_value", mediaValue,
			"display_mode", ind.DisplayMode,
			"observation_date", obs.Date,
			"release_date", lastReleaseDate)
	}

	// Report metrics
	_ = metricsClient.IncrementCounter(ctx, "fetch_operations_total", map[string]string{"status": "completed"})

	// Update schedule status in database
	status := "success"
	message := fmt.Sprintf("Fetched %d indicators, %d errors", successCount, errorCount)
	if errorCount > 0 && successCount == 0 {
		status = "failed"
	} else if errorCount > 0 {
		status = "partial"
	}
	if err := repo.UpdateScheduleStatus(ctx, fredScheduleID, status, message); err != nil {
		slog.Warn("Failed to update schedule status", "error", err)
	}

	slog.Info("Fetch completed", "success", successCount, "errors", errorCount)
	return nil
}

// runCalendarSync fetches release calendar data for all active indicators
func runCalendarSync(ctx context.Context, repo *db.Repository, fredClient *fred.Client, metricsClient *metrics.Client) error {
	slog.Info("Starting calendar sync")

	// Get all active indicators
	indicators, err := repo.GetActiveIndicators(ctx)
	if err != nil {
		slog.Error("Failed to get active indicators for calendar sync", "error", err)
		return err
	}

	slog.Info("Syncing calendar for indicators", "count", len(indicators))

	successCount := 0
	errorCount := 0

	// Cache release dates by release_id to reuse for all series sharing the same release
	// This fixes the bug where only the first series with a given release_id got dates
	releaseDatesCache := make(map[int][]fred.ReleaseDate)

	for _, ind := range indicators {
		// Get release info for this series
		releaseInfo, err := fredClient.GetSeriesRelease(ctx, ind.SeriesID)
		if err != nil {
			slog.Error("Failed to get release info", "series_id", ind.SeriesID, "error", err)
			errorCount++
			continue
		}

		// Get release dates from cache, or fetch if not cached
		dates, cached := releaseDatesCache[releaseInfo.ReleaseID]
		if !cached {
			dates, err = fredClient.GetReleaseDates(ctx, releaseInfo.ReleaseID)
			if err != nil {
				slog.Warn("Failed to get release dates", "release_id", releaseInfo.ReleaseID, "error", err)
				// Store empty slice to avoid retrying
				dates = []fred.ReleaseDate{}
			}
			releaseDatesCache[releaseInfo.ReleaseID] = dates
		}

		// Build calendar entry
		entry := db.ReleaseCalendarEntry{
			SeriesID:         ind.SeriesID,
			ReleaseID:        releaseInfo.ReleaseID,
			ReleaseName:      releaseInfo.ReleaseName,
			ReleaseLink:      releaseInfo.ReleaseLink,
			ReleaseFrequency: fred.GetReleaseFrequency(dates),
		}

		// Set next and following release dates
		if len(dates) > 0 {
			entry.NextReleaseDate = &dates[0].Date
		}
		if len(dates) > 1 {
			entry.FollowingReleaseDate = &dates[1].Date
		}

		// Upsert to database
		if err := repo.UpsertReleaseCalendar(ctx, entry); err != nil {
			slog.Error("Failed to upsert release calendar", "series_id", ind.SeriesID, "error", err)
			errorCount++
			continue
		}

		successCount++
		slog.Info("Updated release calendar",
			"series_id", ind.SeriesID,
			"release_name", releaseInfo.ReleaseName,
			"next_date", entry.NextReleaseDate)
	}

	// Report metrics
	_ = metricsClient.IncrementCounter(ctx, "calendar_sync_total", map[string]string{"status": "completed"})

	slog.Info("Calendar sync completed", "success", successCount, "errors", errorCount)
	return nil
}
