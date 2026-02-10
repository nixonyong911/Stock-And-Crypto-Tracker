package handler

import (
	"encoding/json"
	"net/http"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/cli"
	"github.com/stocktracker/gateway/internal/config"
	"github.com/stocktracker/gateway/internal/db"
)

type HealthHandler struct {
	config   *config.Config
	database *db.PostgresDB
	redis    *db.RedisDB
	cli      *cli.Executor
	logger   zerolog.Logger
}

func NewHealthHandler(cfg *config.Config, database *db.PostgresDB, redis *db.RedisDB, cliExec *cli.Executor, logger zerolog.Logger) *HealthHandler {
	return &HealthHandler{config: cfg, database: database, redis: redis, cli: cliExec, logger: logger}
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "gateway"})
}

func (h *HealthHandler) Live(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	checks := map[string]string{}
	allOk := true

	// Check database
	if h.database != nil {
		if err := h.database.HealthCheck(ctx); err != nil {
			checks["database"] = "error: " + err.Error()
			allOk = false
		} else {
			checks["database"] = "ok"
		}
	}

	// Check Redis
	if h.redis != nil {
		if err := h.redis.HealthCheck(ctx); err != nil {
			checks["redis"] = "error: " + err.Error()
			allOk = false
		} else {
			checks["redis"] = "ok"
		}
	}

	// Check CLI availability
	if h.cli != nil {
		if h.cli.CheckCLIAvailable(ctx, "cursor-agent") {
			checks["cursor_agent"] = "ok"
		} else {
			checks["cursor_agent"] = "not available"
			allOk = false
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if !allOk {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	resp := map[string]interface{}{"status": "ok", "checks": checks}
	if !allOk {
		resp["status"] = "degraded"
	}
	json.NewEncoder(w).Encode(resp)
}
