// Package middleware provides HTTP middleware for ai-hub2.0
package middleware

import (
	"net/http"

	"github.com/rs/zerolog"
)

// Auth creates an API key authentication middleware
func Auth(apiKey string, logger zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip auth for health endpoints
			if isHealthEndpoint(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// Skip auth for docs endpoints
			if isDocsEndpoint(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			// If no API key configured, skip auth (dev mode)
			if apiKey == "" {
				logger.Warn().Str("path", r.URL.Path).Msg("API key authentication disabled (AI_HUB_API_KEY not set)")
				next.ServeHTTP(w, r)
				return
			}

			// Validate API key
			providedKey := r.Header.Get("X-API-Key")

			if providedKey == "" {
				logger.Warn().Str("path", r.URL.Path).Msg("Request missing API key")
				http.Error(w, `{"error": "Missing X-API-Key header"}`, http.StatusUnauthorized)
				return
			}

			if providedKey != apiKey {
				logger.Warn().Str("path", r.URL.Path).Msg("Invalid API key")
				http.Error(w, `{"error": "Invalid API key"}`, http.StatusUnauthorized)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func isHealthEndpoint(path string) bool {
	return path == "/health" || path == "/health/live" || path == "/health/ready"
}

func isDocsEndpoint(path string) bool {
	return path == "/docs" || path == "/redoc" || path == "/openapi.json"
}
