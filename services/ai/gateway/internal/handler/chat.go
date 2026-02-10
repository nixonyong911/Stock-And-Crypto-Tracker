package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/cli"
	"github.com/stocktracker/gateway/internal/config"
	"github.com/stocktracker/gateway/internal/db"
	"github.com/stocktracker/gateway/internal/filter"
	"github.com/stocktracker/gateway/internal/metrics"
	"github.com/stocktracker/gateway/internal/queue"
	"github.com/stocktracker/gateway/internal/security"
	"github.com/stocktracker/gateway/internal/session"
	"github.com/stocktracker/gateway/internal/usage"
)

// ChatRequest is the request body for POST /api/v1/chat
type ChatRequest struct {
	Message   string `json:"message"`
	UserID    string `json:"user_id"`
	SessionID string `json:"session_id,omitempty"`
	Tier      string `json:"tier,omitempty"`
}

// ChatResponse is the response body for POST /api/v1/chat
type ChatResponse struct {
	Response  string                 `json:"response"`
	SessionID string                 `json:"session_id,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

// ChatHandler handles the main AI chat endpoint
type ChatHandler struct {
	config   *config.Config
	security *security.Service
	usage    *usage.Tracker
	session  *session.Manager
	queue    *queue.Manager
	cli      *cli.Executor
	filter   *filter.Filter
	database *db.PostgresDB
	metrics  *metrics.Collector
	logger   zerolog.Logger
}

func NewChatHandler(
	cfg *config.Config,
	sec *security.Service,
	usg *usage.Tracker,
	sess *session.Manager,
	q *queue.Manager,
	cliExec *cli.Executor,
	f *filter.Filter,
	database *db.PostgresDB,
	metricsCollector *metrics.Collector,
	logger zerolog.Logger,
) *ChatHandler {
	return &ChatHandler{
		config:   cfg,
		security: sec,
		usage:    usg,
		session:  sess,
		queue:    q,
		cli:      cliExec,
		filter:   f,
		database: database,
		metrics:  metricsCollector,
		logger:   logger,
	}
}

// Chat handles POST /api/v1/chat
func (h *ChatHandler) Chat(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	// Parse request
	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	if req.Message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Message is required"})
		return
	}

	if req.UserID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "user_id is required"})
		return
	}

	tier := config.ParseTier(req.Tier)
	channelType := r.Header.Get("X-Channel-Type")
	if channelType == "" {
		channelType = "unknown"
	}

	h.metrics.IncTotalRequests()
	h.metrics.IncTierRequest(string(tier))

	h.logger.Info().
		Str("user_id", req.UserID).
		Str("tier", string(tier)).
		Str("channel", channelType).
		Int("message_length", len(req.Message)).
		Msg("Chat request received")

	// Step 1: Security check (prompt injection detection)
	if blocked, reason := h.security.Check(req.Message); blocked {
		h.metrics.IncBlockedInjections()
		h.metrics.IncFailedRequests()
		h.logger.Warn().
			Str("user_id", req.UserID).
			Str("reason", reason).
			Msg("Message blocked by security")
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Message blocked", "reason": reason})
		return
	}

	// Step 2: Usage check (free tier recharge)
	if tier == config.TierFree {
		remaining, err := h.usage.CheckAndConsume(r.Context(), req.UserID, channelType)
		if err != nil {
			h.metrics.IncFailedRequests()
			h.logger.Error().Err(err).Str("user_id", req.UserID).Msg("Usage check failed")
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Usage check failed"})
			return
		}
		if remaining < 0 {
			h.metrics.IncUsageRejections()
			h.metrics.IncFailedRequests()
			usageInfo, _ := h.usage.GetUsageInfo(r.Context(), req.UserID)
			writeJSON(w, http.StatusTooManyRequests, map[string]interface{}{
				"error":            "No messages remaining",
				"next_recharge_at": usageInfo.NextRechargeAt,
				"full_recharge_at": usageInfo.FullRechargeAt,
			})
			return
		}
	}

	// Step 3: Log usage (all tiers)
	go func() {
		_ = h.database.InsertUsageLog(r.Context(), req.UserID, string(tier), channelType)
	}()

	// Step 4: Acquire per-user lock (Layer 1)
	tierCfg := h.config.GetTierConfig(tier)
	unlock, err := h.session.AcquireUserLock(r.Context(), req.UserID, tierCfg.CLITimeout)
	if err != nil {
		h.metrics.IncFailedRequests()
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Your previous message is still processing"})
		return
	}
	defer unlock()

	// Step 5: Enter priority queue (Layer 2) + acquire CLI slot (Layer 3)
	h.metrics.IncQueueEnqueues()
	release, err := h.queue.Enqueue(r.Context(), tier)
	if err != nil {
		if err.Error() == "queue wait timeout" {
			h.metrics.IncQueueTimeouts()
		} else {
			h.metrics.IncQueueFullErrors()
		}
		h.metrics.IncFailedRequests()
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Server busy, please try again"})
		return
	}
	defer release()

	// Step 6: Execute CLI
	h.metrics.IncCLIExecutions()
	cliStart := time.Now()
	cliResult, err := h.cli.Execute(r.Context(), cli.ExecuteParams{
		CLI:         h.config.DefaultCLI,
		Message:     req.Message,
		ContextPath: h.config.ContextPath,
		Model:       h.config.DefaultModel,
		SessionID:   req.SessionID,
		Tier:        tier,
		HomePath:    tierCfg.HomePath,
		Timeout:     tierCfg.CLITimeout,
	})
	cliDuration := time.Since(cliStart).Milliseconds()
	h.metrics.AddCLIDuration(cliDuration)
	if err != nil {
		if err.Error() == "execution timed out" || r.Context().Err() != nil {
			h.metrics.IncCLITimeouts()
		} else {
			h.metrics.IncCLIErrors()
		}
		h.metrics.IncFailedRequests()
		h.logger.Error().Err(err).Str("user_id", req.UserID).Msg("CLI execution failed")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "AI processing failed"})
		return
	}

	// Step 7: Filter output
	filteredResponse := h.filter.Apply(cliResult.Output, tier)

	processingMs := time.Since(startTime).Milliseconds()
	h.metrics.IncSuccessRequests()

	h.logger.Info().
		Str("user_id", req.UserID).
		Int64("processing_ms", processingMs).
		Int64("cli_ms", cliDuration).
		Int("response_length", len(filteredResponse)).
		Msg("Chat request completed")

	writeJSON(w, http.StatusOK, ChatResponse{
		Response:  filteredResponse,
		SessionID: cliResult.SessionID,
		Metadata: map[string]interface{}{
			"processing_ms": processingMs,
			"model":         h.config.DefaultModel,
			"tier":          string(tier),
		},
	})
}
