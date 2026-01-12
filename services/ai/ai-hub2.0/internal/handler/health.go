// Package handler provides HTTP request handlers for ai-hub2.0
package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/stocktracker/ai-hub2/internal/config"
	"github.com/stocktracker/ai-hub2/internal/db"
)

// HealthHandler handles health check endpoints
type HealthHandler struct {
	config   *config.Config
	database *db.PostgresDB
	logger   zerolog.Logger
}

// NewHealthHandler creates a new HealthHandler
func NewHealthHandler(cfg *config.Config, database *db.PostgresDB, logger zerolog.Logger) *HealthHandler {
	return &HealthHandler{
		config:   cfg,
		database: database,
		logger:   logger.With().Str("component", "health").Logger(),
	}
}

// HealthResponse is the response for the /health endpoint
type HealthResponse struct {
	Status            string    `json:"status"`
	Service           string    `json:"service"`
	Version           string    `json:"version"`
	EndpointsCount    int       `json:"endpoints_count"`
	DatabaseConnected bool      `json:"database_connected"`
	Timestamp         time.Time `json:"timestamp"`
}

// LivenessResponse is the response for /health/live
type LivenessResponse struct {
	Status string `json:"status"`
}

// ReadinessResponse is the response for /health/ready
type ReadinessResponse struct {
	Status string `json:"status"`
}

// Health handles GET /health - full health status
func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	dbHealthy := false
	if h.database != nil {
		if err := h.database.HealthCheck(ctx); err == nil {
			dbHealthy = true
		}
	}

	status := "healthy"
	if !dbHealthy {
		status = "unhealthy"
	}

	response := HealthResponse{
		Status:            status,
		Service:           "ai-hub2.0",
		Version:           "2.0.0",
		EndpointsCount:    len(h.config.GetCLIEndpoints()),
		DatabaseConnected: dbHealthy,
		Timestamp:         time.Now().UTC(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Live handles GET /health/live - Kubernetes liveness probe
func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	response := LivenessResponse{Status: "ok"}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Ready handles GET /health/ready - Kubernetes readiness probe
func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	// Check database connectivity
	if h.database != nil {
		if err := h.database.HealthCheck(ctx); err != nil {
			h.logger.Warn().Err(err).Msg("Database not ready")
			http.Error(w, `{"status": "not ready", "error": "database not connected"}`, http.StatusServiceUnavailable)
			return
		}
	}

	response := ReadinessResponse{Status: "ready"}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
