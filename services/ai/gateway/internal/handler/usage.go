package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/usage"
)

type UsageHandler struct {
	tracker *usage.Tracker
	logger  zerolog.Logger
}

func NewUsageHandler(t *usage.Tracker, logger zerolog.Logger) *UsageHandler {
	return &UsageHandler{tracker: t, logger: logger}
}

// GetUsage handles GET /api/v1/usage/{userID}
func (h *UsageHandler) GetUsage(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")

	info, err := h.tracker.GetUsageInfo(r.Context(), userID)
	if err != nil {
		h.logger.Error().Err(err).Str("user_id", userID).Msg("Failed to get usage info")
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Failed to get usage"})
		return
	}

	writeJSON(w, http.StatusOK, info)
}
