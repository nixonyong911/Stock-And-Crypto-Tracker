// Package handler provides HTTP request handlers for ai-hub2.0
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/stocktracker/ai-hub2/internal/config"
	"github.com/stocktracker/ai-hub2/internal/executor"
)

// CLIHandler handles CLI execution endpoints
type CLIHandler struct {
	config   *config.Config
	executor *executor.CLIExecutor
	logger   zerolog.Logger
}

// NewCLIHandler creates a new CLIHandler
func NewCLIHandler(cfg *config.Config, exec *executor.CLIExecutor, logger zerolog.Logger) *CLIHandler {
	return &CLIHandler{
		config:   cfg,
		executor: exec,
		logger:   logger.With().Str("component", "cli-handler").Logger(),
	}
}

// CLIMessageRequest is the request body for CLI endpoints
type CLIMessageRequest struct {
	Message   string `json:"message"`
	SessionID string `json:"session_id,omitempty"` // Optional: resume previous session
}

// CLIEndpointInfo describes an available CLI endpoint
type CLIEndpointInfo struct {
	Path              string `json:"path"`
	InstructionFolder string `json:"instruction_folder"`
	ContextPath       string `json:"context_path"`
	Agent             string `json:"agent"`
	Mode              string `json:"mode"`
	Description       string `json:"description"`
}

// CLIListResponse is the response for GET /cli
type CLIListResponse struct {
	Format    string            `json:"format"`
	Endpoints []CLIEndpointInfo `json:"endpoints"`
	Total     int               `json:"total"`
}

// ListEndpoints handles GET /cli - list available CLI endpoints
func (h *CLIHandler) ListEndpoints(w http.ResponseWriter, r *http.Request) {
	endpoints := h.config.GetCLIEndpoints()

	response := CLIListResponse{
		Format:    "/<type>/<instruction-folder>/<agent>/<mode>",
		Endpoints: make([]CLIEndpointInfo, len(endpoints)),
		Total:     len(endpoints),
	}

	for i, ep := range endpoints {
		response.Endpoints[i] = CLIEndpointInfo{
			Path:              ep.Path,
			InstructionFolder: ep.InstructionFolder,
			ContextPath:       ep.ContextPath,
			Agent:             ep.Agent,
			Mode:              ep.Mode,
			Description:       ep.Description,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// executeCLI is a helper that executes a CLI command and writes the response
func (h *CLIHandler) executeCLI(w http.ResponseWriter, r *http.Request, cli, model string) {
	var req CLIMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		h.logger.Warn().Err(err).Msg("Invalid request body")
		http.Error(w, `{"error": "Invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Message == "" {
		http.Error(w, `{"error": "Message is required"}`, http.StatusBadRequest)
		return
	}

	// Log request info
	logEvent := h.logger.Info().
		Str("cli", cli).
		Str("model", model).
		Int("message_length", len(req.Message))
	if req.SessionID != "" {
		logEvent = logEvent.Str("session_id", req.SessionID)
	}
	logEvent.Msg("Processing CLI request")

	result, err := h.executor.Execute(r.Context(), executor.ExecuteParams{
		CLI:         cli,
		Message:     req.Message,
		ContextPath: h.config.DefaultContextPath,
		Model:       model,
		SessionID:   req.SessionID,
	})

	if err != nil {
		h.logger.Error().Err(err).Str("cli", cli).Str("model", model).Msg("CLI execution error")
		http.Error(w, `{"detail": "`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	if !result.Success {
		errorDetail := result.Error
		if errorDetail == "" {
			errorDetail = result.Output
		}
		if errorDetail == "" {
			errorDetail = "Unknown CLI error"
		}
		h.logger.Error().
			Str("cli", cli).
			Str("model", model).
			Int("exit_code", result.ExitCode).
			Str("error", errorDetail).
			Msg("CLI execution failed")
		http.Error(w, `{"detail": "`+errorDetail+`"}`, http.StatusInternalServerError)
		return
	}

	// Return raw text response (matching Python behavior)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write([]byte(result.Output))
}

// StockTrackerClaudeOpus handles POST /cli/stock-tracker/claude/opus-4.5
func (h *CLIHandler) StockTrackerClaudeOpus(w http.ResponseWriter, r *http.Request) {
	h.executeCLI(w, r, "claude", "opus-4.5")
}

// StockTrackerCursorOpus handles POST /cli/stock-tracker/cursor/opus-4.5
func (h *CLIHandler) StockTrackerCursorOpus(w http.ResponseWriter, r *http.Request) {
	h.executeCLI(w, r, "cursor-agent", "opus-4.5")
}

// TelegramAgentCursorSonnet handles POST /cli/telegram-agent/cursor/sonnet-4.5
func (h *CLIHandler) TelegramAgentCursorSonnet(w http.ResponseWriter, r *http.Request) {
	h.executeCLI(w, r, "cursor-agent", "sonnet-4.5")
}

// TelegramAgentTestCursorSonnet handles POST /cli/telegram-agent-test/cursor/sonnet-4.5
func (h *CLIHandler) TelegramAgentTestCursorSonnet(w http.ResponseWriter, r *http.Request) {
	h.executeCLI(w, r, "cursor-agent", "sonnet-4.5")
}
