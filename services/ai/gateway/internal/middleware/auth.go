package middleware

import (
	"net/http"
	"strings"

	"github.com/rs/zerolog"
)

// Auth creates an API key authentication middleware
func Auth(apiKey string, logger zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for health endpoints
			if strings.HasPrefix(r.URL.Path, "/health") {
				next.ServeHTTP(w, r)
				return
			}

			// If no API key configured, skip auth (dev mode)
			if apiKey == "" {
				logger.Warn().Str("path", r.URL.Path).Msg("API key auth disabled (GATEWAY_API_KEY not set)")
				next.ServeHTTP(w, r)
				return
			}

			providedKey := r.Header.Get("X-API-Key")
			if providedKey == "" {
				http.Error(w, `{"error":"Missing X-API-Key header"}`, http.StatusUnauthorized)
				return
			}

			if providedKey != apiKey {
				http.Error(w, `{"error":"Invalid API key"}`, http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
