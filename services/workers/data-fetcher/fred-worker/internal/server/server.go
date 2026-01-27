package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/stocktracker/fred-worker/internal/db"
	"github.com/stocktracker/fred-worker/internal/fred"
	"github.com/stocktracker/fred-worker/internal/metrics"
)

// Server handles HTTP requests
type Server struct {
	port          string
	repository    *db.Repository
	fredClient    *fred.Client
	metricsClient *metrics.Client
	triggerFunc   func() error
	httpServer    *http.Server
}

// StatusResponse represents the /api/fred/status response
type StatusResponse struct {
	Service        string    `json:"service"`
	Status         string    `json:"status"`
	Version        string    `json:"version"`
	IndicatorCount int       `json:"indicator_count"`
	LastUpdatedAt  *string   `json:"last_updated_at,omitempty"`
	Indicators     []IndicatorStatusDTO `json:"indicators,omitempty"`
}

// IndicatorStatusDTO represents an indicator in the status response
type IndicatorStatusDTO struct {
	SeriesID      string   `json:"series_id"`
	DisplayName   string   `json:"display_name"`
	Category      string   `json:"category"`
	CurrentValue  *float64 `json:"current_value,omitempty"`
	PreviousValue *float64 `json:"previous_value,omitempty"`
	ChangePercent *float64 `json:"change_percent,omitempty"`
	Trend         *string  `json:"trend,omitempty"`
	Signal        *string  `json:"signal,omitempty"`
}

// TriggerResponse represents the response for trigger endpoints
type TriggerResponse struct {
	Success          bool   `json:"success"`
	Message          string `json:"message"`
	RecordsProcessed int    `json:"records_processed"`
}

// New creates a new HTTP server
func New(port string, repo *db.Repository, fredClient *fred.Client, metricsClient *metrics.Client, triggerFunc func() error) *Server {
	return &Server{
		port:          port,
		repository:    repo,
		fredClient:    fredClient,
		metricsClient: metricsClient,
		triggerFunc:   triggerFunc,
	}
}

// Start begins listening for HTTP requests
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Health endpoints
	mux.HandleFunc("GET /health/live", s.handleLiveness)
	mux.HandleFunc("GET /health/ready", s.handleReadiness)

	// API endpoints (paths without prefix - Caddy handle_path strips /api/fred)
	mux.HandleFunc("GET /status", s.handleStatus)
	mux.HandleFunc("POST /trigger/all", s.handleTriggerAll)
	mux.HandleFunc("POST /trigger/{series_id}", s.handleTriggerSingle)

	s.httpServer = &http.Server{
		Addr:         ":" + s.port,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 120 * time.Second, // Allow long-running triggers
	}

	slog.Info("HTTP server starting", "port", s.port)
	return s.httpServer.ListenAndServe()
}

// Stop gracefully shuts down the server
func (s *Server) Stop() {
	if s.httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.httpServer.Shutdown(ctx)
	}
}

func (s *Server) handleLiveness(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (s *Server) handleReadiness(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := s.repository.Ping(ctx); err != nil {
		slog.Error("Readiness check failed", "error", err)
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("Database unavailable"))
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("OK"))
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	indicators, err := s.repository.GetAllIndicatorStatus(ctx)
	if err != nil {
		slog.Error("Failed to get indicator status", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var lastUpdated *string
	dtos := make([]IndicatorStatusDTO, 0, len(indicators))
	for _, ind := range indicators {
		dto := IndicatorStatusDTO{
			SeriesID:      ind.SeriesID,
			DisplayName:   ind.DisplayName,
			Category:      ind.Category,
			CurrentValue:  ind.CurrentValue,
			PreviousValue: ind.PreviousValue,
			ChangePercent: ind.ChangePercent,
			Trend:         ind.Trend,
			Signal:        ind.CurrentSignal,
		}
		dtos = append(dtos, dto)

		if ind.LastUpdatedAt != nil {
			formatted := ind.LastUpdatedAt.Format(time.RFC3339)
			if lastUpdated == nil || formatted > *lastUpdated {
				lastUpdated = &formatted
			}
		}
	}

	response := StatusResponse{
		Service:        "fred-worker",
		Status:         "Running",
		Version:        "1.0.0",
		IndicatorCount: len(indicators),
		LastUpdatedAt:  lastUpdated,
		Indicators:     dtos,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleTriggerAll(w http.ResponseWriter, r *http.Request) {
	slog.Info("Manual trigger: all indicators")

	start := time.Now()
	err := s.triggerFunc()
	duration := time.Since(start)

	_ = s.metricsClient.RecordHistogram(r.Context(), "fetch_duration_seconds", duration.Seconds(), nil)

	response := TriggerResponse{
		Success: err == nil,
		Message: "Fetch completed",
	}
	if err != nil {
		response.Message = err.Error()
	}

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
	}
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleTriggerSingle(w http.ResponseWriter, r *http.Request) {
	seriesID := strings.TrimPrefix(r.URL.Path, "/trigger/")
	seriesID = strings.ToUpper(seriesID)

	slog.Info("Manual trigger: single indicator", "series_id", seriesID)

	ctx := r.Context()

	// Verify indicator exists
	indicator, err := s.repository.GetIndicatorBySeriesID(ctx, seriesID)
	if err != nil {
		http.Error(w, "Indicator not found", http.StatusNotFound)
		return
	}

	// Fetch from FRED
	start := time.Now()
	obs, err := s.fredClient.GetLatestObservation(ctx, indicator.SeriesID)
	if err != nil {
		slog.Error("Failed to fetch indicator", "series_id", seriesID, "error", err)
		response := TriggerResponse{
			Success: false,
			Message: err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Update database
	if err := s.repository.UpsertIndicator(ctx, indicator.SeriesID, obs.Value, obs.Date); err != nil {
		slog.Error("Failed to upsert indicator", "series_id", seriesID, "error", err)
		response := TriggerResponse{
			Success: false,
			Message: err.Error(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	duration := time.Since(start)
	_ = s.metricsClient.RecordHistogram(ctx, "fetch_duration_seconds", duration.Seconds(), map[string]string{
		"series_id": seriesID,
	})

	response := TriggerResponse{
		Success:          true,
		Message:          "Indicator updated",
		RecordsProcessed: 1,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
