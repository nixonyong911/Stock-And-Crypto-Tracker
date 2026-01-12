// Package main is the entry point for ai-hub2.0
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

	"github.com/stocktracker/ai-hub2/internal/config"
	"github.com/stocktracker/ai-hub2/internal/db"
	"github.com/stocktracker/ai-hub2/internal/executor"
	"github.com/stocktracker/ai-hub2/internal/handler"
	"github.com/stocktracker/ai-hub2/internal/middleware"
)

func main() {
	// Configure zerolog
	zerolog.TimeFieldFormat = time.RFC3339
	logger := zerolog.New(os.Stdout).With().Timestamp().Str("service", "ai-hub2").Logger()

	logger.Info().Msg("Starting AI Hub 2.0")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to load configuration")
	}

	logger.Info().
		Int("port", cfg.Port).
		Str("context_path", cfg.DefaultContextPath).
		Int("timeout_seconds", cfg.CLITimeoutSeconds).
		Int("max_concurrent", cfg.MaxConcurrent).
		Msg("Configuration loaded")

	// Initialize database connection
	ctx := context.Background()
	database, err := db.New(ctx, cfg.DatabaseURL, logger)
	if err != nil {
		logger.Warn().Err(err).Msg("Database connection failed (CLI endpoints will still work)")
		database = nil
	}

	// Initialize CLI executor
	cliExecutor := executor.New(cfg, logger)

	// Initialize handlers
	healthHandler := handler.NewHealthHandler(cfg, database, logger)
	cliHandler := handler.NewCLIHandler(cfg, cliExecutor, logger)

	// Setup router
	r := chi.NewRouter()

	// Middleware stack
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.Auth(cfg.APIKey, logger))
	r.Use(middleware.Logging(database, logger))

	// Health endpoints (no timeout - should be fast)
	r.Get("/health", healthHandler.Health)
	r.Get("/health/live", healthHandler.Live)
	r.Get("/health/ready", healthHandler.Ready)

	// CLI endpoints
	r.Get("/cli", cliHandler.ListEndpoints)

	// CLI execution endpoints with timeout
	r.Route("/cli", func(r chi.Router) {
		// Apply timeout middleware to CLI routes
		r.Use(middleware.Timeout(cfg.CLITimeout))

		r.Post("/stock-tracker/claude/opus-4.5", cliHandler.StockTrackerClaudeOpus)
		r.Post("/stock-tracker/cursor/opus-4.5", cliHandler.StockTrackerCursorOpus)
		r.Post("/telegram-agent/cursor/sonnet-4.5", cliHandler.TelegramAgentCursorSonnet)
		r.Post("/telegram-agent-test/cursor/sonnet-4.5", cliHandler.TelegramAgentTestCursorSonnet)
	})

	// Create server
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: cfg.CLITimeout + 10*time.Second, // CLI timeout + buffer
		IdleTimeout:  120 * time.Second,
	}

	// Start server in goroutine
	go func() {
		logger.Info().Int("port", cfg.Port).Msg("Server listening")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("Server failed")
		}
	}()

	// Log registered endpoints
	endpoints := cfg.GetCLIEndpoints()
	logger.Info().Int("count", len(endpoints)).Msg("CLI endpoints registered")
	for _, ep := range endpoints {
		logger.Debug().Str("path", ep.Path).Str("agent", ep.Agent).Str("mode", ep.Mode).Msg("Endpoint")
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutting down server...")

	// Create shutdown context with timeout
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Shutdown server
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error().Err(err).Msg("Server shutdown error")
	}

	// Close database connection
	if database != nil {
		database.Close()
	}

	logger.Info().Msg("Server stopped")
}
