package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/db"
	"github.com/stocktracker/gateway/internal/metrics"
	"github.com/stocktracker/gateway/internal/queue"
)

// AdminHandler provides admin/observability endpoints
type AdminHandler struct {
	database     *db.PostgresDB
	metrics      *metrics.Collector
	queueManager *queue.Manager
	logger       zerolog.Logger
}

// NewAdminHandler creates a new admin handler
func NewAdminHandler(database *db.PostgresDB, metricsCollector *metrics.Collector, queueManager *queue.Manager, logger zerolog.Logger) *AdminHandler {
	return &AdminHandler{
		database:     database,
		metrics:      metricsCollector,
		queueManager: queueManager,
		logger:       logger,
	}
}

// Metrics returns current runtime metrics snapshot
// GET /api/v1/admin/metrics
func (h *AdminHandler) Metrics(w http.ResponseWriter, r *http.Request) {
	snapshot := h.metrics.Snapshot()
	queueStats := h.queueManager.Stats()

	resp := map[string]interface{}{
		"metrics": snapshot,
		"queue":   queueStats,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// SecurityLogs returns recent blocked injection attempts
// GET /api/v1/admin/security-logs?limit=50&offset=0
func (h *AdminHandler) SecurityLogs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	limit := queryIntOrDefault(r, "limit", 50)
	offset := queryIntOrDefault(r, "offset", 0)

	if limit > 200 {
		limit = 200
	}

	rows, err := h.database.Pool().Query(ctx,
		`SELECT id, user_id, channel_type, message_text, block_reason, created_at
		 FROM gateway_security_log
		 ORDER BY created_at DESC
		 LIMIT $1 OFFSET $2`, limit, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Failed to query security logs")
		return
	}
	defer rows.Close()

	type SecurityLogEntry struct {
		ID          int64  `json:"id"`
		UserID      string `json:"user_id"`
		ChannelType string `json:"channel_type"`
		MessageText string `json:"message_text"`
		BlockReason string `json:"block_reason"`
		CreatedAt   string `json:"created_at"`
	}

	entries := make([]SecurityLogEntry, 0)
	for rows.Next() {
		var e SecurityLogEntry
		var createdAt interface{}
		if err := rows.Scan(&e.ID, &e.UserID, &e.ChannelType, &e.MessageText, &e.BlockReason, &createdAt); err != nil {
			continue
		}
		if t, ok := createdAt.(interface{ String() string }); ok {
			e.CreatedAt = t.String()
		}
		entries = append(entries, e)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"logs":  entries,
		"count": len(entries),
	})
}

// SessionStats returns session analytics
// GET /api/v1/admin/sessions
func (h *AdminHandler) SessionStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	type SessionStats struct {
		ActiveSessions int64            `json:"active_sessions"`
		TotalSessions  int64            `json:"total_sessions"`
		AvgDurationMin float64          `json:"avg_duration_min"`
		ByTier         map[string]int64 `json:"by_tier"`
		ByChannel      map[string]int64 `json:"by_channel"`
	}

	stats := SessionStats{
		ByTier:    make(map[string]int64),
		ByChannel: make(map[string]int64),
	}

	// Active sessions count
	_ = h.database.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM gateway_sessions WHERE expires_at > NOW()`).
		Scan(&stats.ActiveSessions)

	// Total sessions
	_ = h.database.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM gateway_sessions`).
		Scan(&stats.TotalSessions)

	// Average session duration (for expired sessions)
	_ = h.database.Pool().QueryRow(ctx,
		`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (LEAST(expires_at, last_active_at) - created_at)) / 60), 0)
		 FROM gateway_sessions WHERE expires_at < NOW()`).
		Scan(&stats.AvgDurationMin)

	// Active sessions by tier
	rows, err := h.database.Pool().Query(ctx,
		`SELECT tier, COUNT(*) FROM gateway_sessions WHERE expires_at > NOW() GROUP BY tier`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tier string
			var count int64
			if rows.Scan(&tier, &count) == nil {
				stats.ByTier[tier] = count
			}
		}
	}

	// Active sessions by channel
	rows2, err := h.database.Pool().Query(ctx,
		`SELECT channel_type, COUNT(*) FROM gateway_sessions WHERE expires_at > NOW() GROUP BY channel_type`)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var ch string
			var count int64
			if rows2.Scan(&ch, &count) == nil {
				stats.ByChannel[ch] = count
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// UsageStats returns usage analytics
// GET /api/v1/admin/usage?hours=24
func (h *AdminHandler) UsageStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	hours := queryIntOrDefault(r, "hours", 24)
	if hours > 168 { // max 7 days
		hours = 168
	}

	type UsageStats struct {
		TotalMessages int64            `json:"total_messages"`
		ByTier        map[string]int64 `json:"by_tier"`
		ByChannel     map[string]int64 `json:"by_channel"`
		HoursQueried  int              `json:"hours_queried"`
	}

	stats := UsageStats{
		ByTier:       make(map[string]int64),
		ByChannel:    make(map[string]int64),
		HoursQueried: hours,
	}

	// Total messages in period
	_ = h.database.Pool().QueryRow(ctx,
		`SELECT COUNT(*) FROM gateway_usage_log WHERE created_at > NOW() - $1 * INTERVAL '1 hour'`,
		hours).Scan(&stats.TotalMessages)

	// By tier
	rows, err := h.database.Pool().Query(ctx,
		`SELECT tier, COUNT(*) FROM gateway_usage_log
		 WHERE created_at > NOW() - $1 * INTERVAL '1 hour'
		 GROUP BY tier`, hours)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tier string
			var count int64
			if rows.Scan(&tier, &count) == nil {
				stats.ByTier[tier] = count
			}
		}
	}

	// By channel
	rows2, err := h.database.Pool().Query(ctx,
		`SELECT channel_type, COUNT(*) FROM gateway_usage_log
		 WHERE created_at > NOW() - $1 * INTERVAL '1 hour'
		 GROUP BY channel_type`, hours)
	if err == nil {
		defer rows2.Close()
		for rows2.Next() {
			var ch string
			var count int64
			if rows2.Scan(&ch, &count) == nil {
				stats.ByChannel[ch] = count
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func queryIntOrDefault(r *http.Request, key string, defaultVal int) int {
	val := r.URL.Query().Get(key)
	if val == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return n
}
