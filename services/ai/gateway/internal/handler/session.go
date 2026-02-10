package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/session"
)

type SessionHandler struct {
	manager *session.Manager
	logger  zerolog.Logger
}

func NewSessionHandler(mgr *session.Manager, logger zerolog.Logger) *SessionHandler {
	return &SessionHandler{manager: mgr, logger: logger}
}

// Create handles POST /api/v1/sessions
func (h *SessionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID      string `json:"user_id"`
		ChannelType string `json:"channel_type"`
		Tier        string `json:"tier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	sess, err := h.manager.CreateSession(r.Context(), req.UserID, req.ChannelType, req.Tier)
	if err != nil {
		h.logger.Error().Err(err).Str("user_id", req.UserID).Msg("Failed to create session")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to create session"})
		return
	}

	writeJSON(w, http.StatusCreated, sess)
}

// Get handles GET /api/v1/sessions/{userID}
func (h *SessionHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")

	sess, err := h.manager.GetActiveSession(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "No active session found"})
		return
	}

	writeJSON(w, http.StatusOK, sess)
}

// Delete handles DELETE /api/v1/sessions/{sessionID}
func (h *SessionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")

	if err := h.manager.ExpireSession(r.Context(), sessionID); err != nil {
		h.logger.Error().Err(err).Str("session_id", sessionID).Msg("Failed to expire session")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to expire session"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "expired"})
}
