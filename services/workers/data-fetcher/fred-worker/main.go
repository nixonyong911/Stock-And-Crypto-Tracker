package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/stocktracker/fred-worker/internal/config"
	"github.com/stocktracker/fred-worker/internal/db"
	"github.com/stocktracker/fred-worker/internal/fred"
	"github.com/stocktracker/fred-worker/internal/metrics"
	"github.com/stocktracker/fred-worker/internal/scheduler"
	"github.com/stocktracker/fred-worker/internal/server"
)

const version = "1.0.0"

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

	// Create scheduler
	sched := scheduler.New(cfg.ScheduleTime, cfg.ScheduleTimezone, func() error {
		return runFetch(ctx, repository, fredClient, metricsClient)
	})

	// Create HTTP server
	srv := server.New(cfg.HTTPPort, repository, fredClient, metricsClient, func() error {
		return runFetch(ctx, repository, fredClient, metricsClient)
	})

	// Start scheduler in background
	go sched.Start(ctx)

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

		// Upsert to database
		if err := repo.UpsertIndicator(ctx, ind.SeriesID, obs.Value, obs.Date); err != nil {
			slog.Error("Failed to upsert indicator", "series_id", ind.SeriesID, "error", err)
			errorCount++
			_ = metricsClient.IncrementCounter(ctx, "fetch_errors_total", map[string]string{
				"series_id":  ind.SeriesID,
				"error_type": "db_error",
			})
			continue
		}

		successCount++
		slog.Info("Updated indicator", "series_id", ind.SeriesID, "value", obs.Value, "date", obs.Date)
	}

	// Report metrics
	_ = metricsClient.IncrementCounter(ctx, "fetch_operations_total", map[string]string{"status": "completed"})
	_ = metricsClient.IncrementCounter(ctx, "records_inserted_total", map[string]string{"count": string(rune(successCount))})

	slog.Info("Fetch completed", "success", successCount, "errors", errorCount)
	return nil
}
