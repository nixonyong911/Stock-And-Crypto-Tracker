package server

import (
	"context"
	"encoding/json"
	"fmt"
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
	port             string
	repository       *db.Repository
	fredClient       *fred.Client
	metricsClient    *metrics.Client
	triggerFunc      func() error
	calendarSyncFunc func() error
	httpServer       *http.Server
	scheduleTime     string
	scheduleTimezone string
}

// StatusResponse represents the /api/fred/status response
type StatusResponse struct {
	Service        string               `json:"service"`
	Status         string               `json:"status"`
	Version        string               `json:"version"`
	Display        string               `json:"display"` // "media" or "raw"
	IndicatorCount int                  `json:"indicator_count"`
	LastUpdatedAt  *string              `json:"last_updated_at,omitempty"`
	Indicators     []IndicatorStatusDTO `json:"indicators,omitempty"`
}

// IndicatorStatusDTO represents an indicator in the status response
type IndicatorStatusDTO struct {
	SeriesID         string   `json:"series_id"`
	DisplayName      string   `json:"display_name"`
	Category         string   `json:"category"`
	// Raw values (actual FRED data)
	RawCurrentValue  *float64 `json:"raw_current_value,omitempty"`
	RawPreviousValue *float64 `json:"raw_previous_value,omitempty"`
	// Media-friendly values (for display)
	CurrentValue     *float64 `json:"current_value,omitempty"`
	PreviousValue    *float64 `json:"previous_value,omitempty"`
	// Metadata
	DisplayMode      string   `json:"display_mode"`
	ChangePercent    *float64 `json:"change_percent,omitempty"`
	Trend            *string  `json:"trend,omitempty"`
	Signal           *string  `json:"signal,omitempty"`
	// Dates
	CurrentObservationDate *string `json:"current_observation_date,omitempty"`
	LastReleaseDate        *string `json:"last_release_date,omitempty"`
}

// TriggerResponse represents the response for trigger endpoints
type TriggerResponse struct {
	Success          bool   `json:"success"`
	Message          string `json:"message"`
	RecordsProcessed int    `json:"records_processed"`
}

// New creates a new HTTP server
func New(port string, repo *db.Repository, fredClient *fred.Client, metricsClient *metrics.Client, triggerFunc func() error, calendarSyncFunc func() error, scheduleTime string, scheduleTimezone string) *Server {
	return &Server{
		port:             port,
		repository:       repo,
		fredClient:       fredClient,
		metricsClient:    metricsClient,
		triggerFunc:      triggerFunc,
		calendarSyncFunc: calendarSyncFunc,
		scheduleTime:     scheduleTime,
		scheduleTimezone: scheduleTimezone,
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

	// Calendar endpoints
	mux.HandleFunc("GET /calendar", s.handleGetCalendar)
	mux.HandleFunc("POST /calendar/sync", s.handleCalendarSync)

	// Schedule discovery endpoint
	mux.HandleFunc("GET /schedules", s.handleSchedules)

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

	// Check display mode from query param (default: media)
	displayMode := r.URL.Query().Get("display")
	if displayMode != "raw" {
		displayMode = "media"
	}

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
			SeriesID:         ind.SeriesID,
			DisplayName:      ind.DisplayName,
			Category:         ind.Category,
			DisplayMode:      ind.DisplayMode,
			RawCurrentValue:  ind.CurrentValue,
			RawPreviousValue: ind.PreviousValue,
			ChangePercent:    ind.ChangePercent,
			Trend:            ind.Trend,
			Signal:           ind.CurrentSignal,
		}

		// Set current/previous based on display mode
		if displayMode == "raw" {
			dto.CurrentValue = ind.CurrentValue
			dto.PreviousValue = ind.PreviousValue
		} else {
			// Media mode - use media values, fallback to raw if not available
			if ind.MediaCurrentValue != nil {
				dto.CurrentValue = ind.MediaCurrentValue
			} else {
				dto.CurrentValue = ind.CurrentValue
			}
			if ind.MediaPreviousValue != nil {
				dto.PreviousValue = ind.MediaPreviousValue
			} else {
				dto.PreviousValue = ind.PreviousValue
			}
		}

		// Add dates
		if ind.CurrentDate != nil {
			formatted := ind.CurrentDate.Format("2006-01-02")
			dto.CurrentObservationDate = &formatted
		}
		if ind.LastReleaseDate != nil {
			formatted := ind.LastReleaseDate.Format("2006-01-02")
			dto.LastReleaseDate = &formatted
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
		Version:        "1.3.0",
		Display:        displayMode,
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

// ========================================
// Calendar Endpoints
// ========================================

// CalendarResponse represents the /calendar response
type CalendarResponse struct {
	Releases []ReleaseDTO `json:"releases"`
	Count    int          `json:"count"`
}

// ReleaseDTO represents a release in the calendar response
type ReleaseDTO struct {
	SeriesID            string  `json:"series_id"`
	ReleaseName         string  `json:"release_name"`
	NextReleaseDate     *string `json:"next_release_date,omitempty"`
	FollowingReleaseDate *string `json:"following_release_date,omitempty"`
	ReleaseFrequency    string  `json:"release_frequency"`
	ReleaseLink         string  `json:"release_link,omitempty"`
}

func (s *Server) handleGetCalendar(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Check for optional "days" query parameter
	daysParam := r.URL.Query().Get("days")
	
	var entries []db.ReleaseCalendarEntry
	var err error

	if daysParam != "" {
		var days int
		if _, err := json.Number(daysParam).Int64(); err == nil {
			days = int(json.Number(daysParam).String()[0] - '0') * 10 // Simple parse
		}
		if days <= 0 {
			days = 30 // Default to 30 days
		}
		entries, err = s.repository.GetUpcomingReleases(ctx, days)
	} else {
		entries, err = s.repository.GetAllReleaseCalendar(ctx)
	}

	if err != nil {
		slog.Error("Failed to get release calendar", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	dtos := make([]ReleaseDTO, 0, len(entries))
	for _, e := range entries {
		dto := ReleaseDTO{
			SeriesID:         e.SeriesID,
			ReleaseName:      e.ReleaseName,
			ReleaseFrequency: e.ReleaseFrequency,
			ReleaseLink:      e.ReleaseLink,
		}
		if e.NextReleaseDate != nil {
			formatted := e.NextReleaseDate.Format("2006-01-02")
			dto.NextReleaseDate = &formatted
		}
		if e.FollowingReleaseDate != nil {
			formatted := e.FollowingReleaseDate.Format("2006-01-02")
			dto.FollowingReleaseDate = &formatted
		}
		dtos = append(dtos, dto)
	}

	response := CalendarResponse{
		Releases: dtos,
		Count:    len(dtos),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleCalendarSync(w http.ResponseWriter, r *http.Request) {
	slog.Info("Manual trigger: calendar sync")

	start := time.Now()
	err := s.calendarSyncFunc()
	duration := time.Since(start)

	_ = s.metricsClient.RecordHistogram(r.Context(), "calendar_sync_duration_seconds", duration.Seconds(), nil)

	response := TriggerResponse{
		Success: err == nil,
		Message: "Calendar sync completed",
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

// ========================================
// Schedule Discovery Endpoint
// ========================================

// SchedulesResponse represents the /schedules discovery response
type SchedulesResponse struct {
	Service   string             `json:"service"`
	Schedules []ScheduleEntryDTO `json:"schedules"`
}

// ScheduleEntryDTO represents a single schedule entry
type ScheduleEntryDTO struct {
	Name             string  `json:"name"`
	Description      string  `json:"description"`
	IsEnabled        bool    `json:"is_enabled"`
	Cadence          string  `json:"cadence"`
	CadenceType      string  `json:"cadence_type"`
	IntervalMinutes  *int    `json:"interval_minutes"`
	OffsetMinutes    *int    `json:"offset_minutes"`
	ScheduleTime     *string `json:"schedule_time"`
	ScheduleTimezone *string `json:"schedule_timezone"`
	LastRunAt        *string `json:"last_run_at"`
	LastRunStatus    *string `json:"last_run_status"`
	LastRunMessage   *string `json:"last_run_message"`
	TriggerEndpoint  *string `json:"trigger_endpoint"`
}

func (s *Server) handleSchedules(w http.ResponseWriter, r *http.Request) {
	triggerAll := "/trigger/all"
	calendarSync := "/calendar/sync"

	response := SchedulesResponse{
		Service: "fred-worker",
		Schedules: []ScheduleEntryDTO{
			{
				Name:             "FRED Daily Macro Fetch",
				Description:      "Fetches latest observations for all active FRED economic indicators",
				IsEnabled:        true,
				Cadence:          fmt.Sprintf("Daily at %s %s", s.scheduleTime, s.scheduleTimezone),
				CadenceType:      "daily",
				ScheduleTime:     &s.scheduleTime,
				ScheduleTimezone: &s.scheduleTimezone,
				TriggerEndpoint:  &triggerAll,
			},
			{
				Name:             "FRED Weekly Calendar Sync",
				Description:      "Syncs release calendar dates for all tracked economic indicators",
				IsEnabled:        true,
				Cadence:          fmt.Sprintf("Weekly (Sunday) at 00:00 %s", s.scheduleTimezone),
				CadenceType:      "weekly",
				ScheduleTime:     strPtr("00:00"),
				ScheduleTimezone: &s.scheduleTimezone,
				TriggerEndpoint:  &calendarSync,
			},
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func strPtr(s string) *string { return &s }
