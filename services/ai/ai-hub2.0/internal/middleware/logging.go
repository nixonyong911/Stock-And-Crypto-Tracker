// Package middleware provides HTTP middleware for ai-hub2.0
package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/stocktracker/ai-hub2/internal/db"
)

// loggingResponseWriter wraps http.ResponseWriter to capture response body
type loggingResponseWriter struct {
	http.ResponseWriter
	statusCode int
	body       *bytes.Buffer
}

func newLoggingResponseWriter(w http.ResponseWriter) *loggingResponseWriter {
	return &loggingResponseWriter{
		ResponseWriter: w,
		statusCode:     http.StatusOK,
		body:           &bytes.Buffer{},
	}
}

func (lrw *loggingResponseWriter) WriteHeader(code int) {
	lrw.statusCode = code
	lrw.ResponseWriter.WriteHeader(code)
}

func (lrw *loggingResponseWriter) Write(b []byte) (int, error) {
	lrw.body.Write(b)
	return lrw.ResponseWriter.Write(b)
}

// Logging creates a request/response logging middleware that writes to Supabase
func Logging(database *db.PostgresDB, logger zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip logging for health and docs endpoints
			if shouldSkipLogging(r.URL.Path) {
				next.ServeHTTP(w, r)
				return
			}

			start := time.Now()
			endpoint := r.URL.Path

			// Capture request body
			var requestBody json.RawMessage
			if r.Body != nil {
				bodyBytes, err := io.ReadAll(r.Body)
				if err == nil && len(bodyBytes) > 0 {
					requestBody = truncateBody(bodyBytes)
					// Restore body for handler
					r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
				}
			}

			// Wrap response writer to capture response
			lrw := newLoggingResponseWriter(w)

			// Call the actual handler
			next.ServeHTTP(lrw, r)

			// Calculate elapsed time
			elapsed := time.Since(start)
			elapsedSec := elapsed.Seconds()

			// Capture response body (truncated if needed)
			responseBody := truncateBody(lrw.body.Bytes())

			// Log to console
			logger.Info().
				Str("endpoint", endpoint).
				Int("status", lrw.statusCode).
				Float64("elapsed_sec", elapsedSec).
				Int("request_size", len(requestBody)).
				Int("response_size", len(responseBody)).
				Msg("Request completed")

			// Fire-and-forget logging to Supabase
			if database != nil {
				go func() {
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()

					entry := db.LogEntry{
						RequestTimestamp: start,
						Endpoint:         endpoint,
						RequestBody:      requestBody,
						ResponseBody:     responseBody,
						ElapsedTimeSec:   elapsedSec,
						StatusCode:       lrw.statusCode,
					}

					if err := database.InsertLogEntry(ctx, entry); err != nil {
						logger.Error().Err(err).Str("endpoint", endpoint).Msg("Failed to log to database")
					}
				}()
			}
		})
	}
}

// shouldSkipLogging returns true for endpoints that shouldn't be logged
func shouldSkipLogging(path string) bool {
	skipPrefixes := []string{"/health", "/docs", "/redoc", "/openapi.json"}
	for _, prefix := range skipPrefixes {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}

// truncateBody limits body size to prevent huge payloads in logs
func truncateBody(body []byte) json.RawMessage {
	const maxSize = 10 * 1024 // 10KB

	if len(body) == 0 {
		return nil
	}

	if len(body) <= maxSize {
		// Validate it's valid JSON, otherwise wrap as string
		if json.Valid(body) {
			return body
		}
		// Wrap non-JSON as string
		quoted, _ := json.Marshal(string(body))
		return quoted
	}

	// Truncate and indicate truncation
	truncated := map[string]interface{}{
		"_truncated":     true,
		"_original_size": len(body),
		"content":        string(body[:maxSize]),
	}
	result, _ := json.Marshal(truncated)
	return result
}
