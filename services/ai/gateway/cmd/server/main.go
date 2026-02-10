package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/channel"
	"github.com/stocktracker/gateway/internal/cli"
	"github.com/stocktracker/gateway/internal/config"
	"github.com/stocktracker/gateway/internal/db"
	"github.com/stocktracker/gateway/internal/filter"
	"github.com/stocktracker/gateway/internal/handler"
	"github.com/stocktracker/gateway/internal/metrics"
	"github.com/stocktracker/gateway/internal/middleware"
	"github.com/stocktracker/gateway/internal/queue"
	"github.com/stocktracker/gateway/internal/security"
	"github.com/stocktracker/gateway/internal/session"
	"github.com/stocktracker/gateway/internal/usage"
)

func main() {
	// Configure zerolog
	zerolog.TimeFieldFormat = time.RFC3339
	logger := zerolog.New(os.Stdout).With().Timestamp().Str("service", "gateway").Logger()

	logger.Info().Msg("Starting Gateway")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to load configuration")
	}

	logger.Info().
		Int("port", cfg.Port).
		Str("context_path", cfg.ContextPath).
		Int("max_concurrent", cfg.MaxConcurrent).
		Msg("Configuration loaded")

	// Initialize infrastructure
	ctx := context.Background()

	database, err := db.New(ctx, cfg.DatabaseURL, logger)
	if err != nil {
		logger.Fatal().Err(err).Msg("Database connection failed")
	}

	redisDB, err := db.NewRedis(ctx, cfg.RedisURL, logger)
	if err != nil {
		logger.Fatal().Err(err).Msg("Redis connection failed")
	}

	// Initialize core services
	channelRegistry := channel.NewRegistry(logger)
	securityService := security.NewService(cfg, database, logger)
	usageTracker := usage.NewTracker(cfg, redisDB, database, logger)
	sessionManager := session.NewManager(cfg, database, redisDB, logger)
	queueManager := queue.NewManager(cfg, logger)
	cliExecutor := cli.NewExecutor(cfg, logger)
	outputFilter := filter.NewFilter(cfg, logger)
	metricsCollector := metrics.New()

	// Start background services
	sessionManager.StartPruner(ctx)
	queueManager.Start(ctx)

	// Initialize handlers
	healthHandler := handler.NewHealthHandler(cfg, database, redisDB, cliExecutor, logger)
	chatHandler := handler.NewChatHandler(cfg, securityService, usageTracker, sessionManager, queueManager, cliExecutor, outputFilter, database, metricsCollector, logger)
	sessionHandler := handler.NewSessionHandler(sessionManager, logger)
	channelHandler := handler.NewChannelHandler(channelRegistry, logger)
	usageHandler := handler.NewUsageHandler(usageTracker, logger)
	adminHandler := handler.NewAdminHandler(database, metricsCollector, queueManager, logger)

	// Setup router
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.Auth(cfg.APIKey, logger))
	r.Use(middleware.Logging(database, logger))

	// Health endpoints
	r.Get("/health", healthHandler.Health)
	r.Get("/health/live", healthHandler.Live)
	r.Get("/health/ready", healthHandler.Ready)

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		// Chat endpoint (main AI interaction)
		r.Post("/chat", chatHandler.Chat)

		// Session management
		r.Post("/sessions", sessionHandler.Create)
		r.Get("/sessions/{userID}", sessionHandler.Get)
		r.Delete("/sessions/{sessionID}", sessionHandler.Delete)

		// Usage
		r.Get("/usage/{userID}", usageHandler.GetUsage)

		// Channel registry
		r.Post("/channels/register", channelHandler.Register)
		r.Get("/channels", channelHandler.List)

		// Admin / observability (protected by same API key)
		r.Route("/admin", func(r chi.Router) {
			r.Get("/metrics", adminHandler.Metrics)
			r.Get("/security-logs", adminHandler.SecurityLogs)
			r.Get("/sessions", adminHandler.SessionStats)
			r.Get("/usage", adminHandler.UsageStats)
		})
	})

	// Create server
	maxTimeout := config.TierConfig{CLITimeout: 300 * time.Second}.CLITimeout
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: maxTimeout + 70*time.Second, // max CLI timeout + queue wait + buffer
		IdleTimeout:  120 * time.Second,
	}

	// Startup summary
	logger.Info().
		Int("port", cfg.Port).
		Int("max_concurrent_cli", cfg.MaxConcurrent).
		Str("context_path", cfg.ContextPath).
		Str("default_cli", cfg.DefaultCLI).
		Str("default_model", cfg.DefaultModel).
		Int("session_prune_interval_min", cfg.SessionPruneInterval).
		Int("session_expiry_days", cfg.SessionExpiryDays).
		Msg("Gateway startup summary")

	// Start server
	go func() {
		logger.Info().Int("port", cfg.Port).Msg("Server listening")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("Server failed")
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Server shutdown error")
	}

	// Cleanup
	queueManager.Stop()
	database.Close()
	redisDB.Close()

	logger.Info().Msg("Server stopped")
}
