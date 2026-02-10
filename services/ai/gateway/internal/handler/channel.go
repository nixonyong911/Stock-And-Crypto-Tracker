package handler

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/channel"
)

type ChannelHandler struct {
	registry *channel.Registry
	logger   zerolog.Logger
}

func NewChannelHandler(reg *channel.Registry, logger zerolog.Logger) *ChannelHandler {
	return &ChannelHandler{registry: reg, logger: logger}
}

// Register handles POST /api/v1/channels/register
func (h *ChannelHandler) Register(w http.ResponseWriter, r *http.Request) {
	var info channel.Info
	if err := json.NewDecoder(r.Body).Decode(&info); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request body"})
		return
	}

	h.registry.Register(info)
	h.logger.Info().Str("channel", info.Type).Msg("Channel registered")
	writeJSON(w, http.StatusCreated, map[string]string{"status": "registered"})
}

// List handles GET /api/v1/channels
func (h *ChannelHandler) List(w http.ResponseWriter, r *http.Request) {
	channels := h.registry.List()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"channels": channels,
		"total":    len(channels),
	})
}
