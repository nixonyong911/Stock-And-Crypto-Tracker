// Package middleware provides HTTP middleware for ai-hub2.0
package middleware

import (
	"context"
	"net/http"
	"time"
)

// Timeout creates a middleware that adds a timeout to the request context
func Timeout(timeout time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx, cancel := context.WithTimeout(r.Context(), timeout)
			defer cancel()

			// Create request with timeout context
			r = r.WithContext(ctx)

			// Use a channel to detect if handler completed
			done := make(chan struct{})

			go func() {
				next.ServeHTTP(w, r)
				close(done)
			}()

			select {
			case <-done:
				// Handler completed normally
			case <-ctx.Done():
				// Timeout occurred - the handler goroutine will still complete
				// but the context cancellation will propagate to child operations
				// Note: We don't write a response here as the handler may have already started writing
			}
		})
	}
}

// RequestTimeout creates a simpler timeout middleware using http.TimeoutHandler
// Note: This writes "Timeout" if the timeout is exceeded, which may not be desired for all endpoints
func RequestTimeout(timeout time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.TimeoutHandler(next, timeout, `{"error": "Request timeout"}`)
	}
}
