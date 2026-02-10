package middleware

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/db"
)

const maxBodySize = 10 * 1024 // 10KB

type responseCapture struct {
	http.ResponseWriter
	statusCode int
	body       bytes.Buffer
}

func (rc *responseCapture) WriteHeader(code int) {
	rc.statusCode = code
	rc.ResponseWriter.WriteHeader(code)
}

func (rc *responseCapture) Write(b []byte) (int, error) {
	if rc.body.Len() < maxBodySize {
		rc.body.Write(b)
	}
	return rc.ResponseWriter.Write(b)
}

// Logging creates request/response logging middleware
func Logging(database *db.PostgresDB, logger zerolog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip logging for health endpoints
			if strings.HasPrefix(r.URL.Path, "/health") {
				next.ServeHTTP(w, r)
				return
			}

			start := time.Now()

			// Read and restore request body
			var reqBody []byte
			if r.Body != nil {
				reqBody, _ = io.ReadAll(io.LimitReader(r.Body, int64(maxBodySize)))
				r.Body = io.NopCloser(bytes.NewBuffer(reqBody))
			}

			// Capture response
			capture := &responseCapture{ResponseWriter: w, statusCode: http.StatusOK}
			next.ServeHTTP(capture, r)

			elapsed := time.Since(start)

			// Log request
			logger.Info().
				Str("method", r.Method).
				Str("path", r.URL.Path).
				Int("status", capture.statusCode).
				Dur("elapsed", elapsed).
				Msg("Request completed")

			// Async DB log
			if database != nil {
				go func() {
					reqJSON := toJSON(reqBody)
					respJSON := toJSON(capture.body.Bytes())

					_ = database.InsertLogEntry(r.Context(), db.LogEntry{
						RequestTimestamp: start,
						Endpoint:         r.URL.Path,
						RequestBody:      reqJSON,
						ResponseBody:     respJSON,
						ElapsedTimeSec:   elapsed.Seconds(),
						StatusCode:       capture.statusCode,
					})
				}()
			}
		})
	}
}

func toJSON(data []byte) json.RawMessage {
	if json.Valid(data) {
		return json.RawMessage(data)
	}
	// Wrap non-JSON as string
	s, _ := json.Marshal(string(data))
	return json.RawMessage(s)
}
