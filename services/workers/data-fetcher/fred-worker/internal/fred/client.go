package fred

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const (
	baseURL        = "https://api.stlouisfed.org/fred/series/observations"
	defaultTimeout = 30 * time.Second
	maxRetries     = 3
	retryDelay     = 2 * time.Second
)

// Client is an HTTP client for the FRED API
type Client struct {
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new FRED API client
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}
}

// GetLatestObservation fetches the most recent observation for a series
func (c *Client) GetLatestObservation(ctx context.Context, seriesID string) (*Observation, error) {
	params := url.Values{}
	params.Set("series_id", seriesID)
	params.Set("api_key", c.apiKey)
	params.Set("file_type", "json")
	params.Set("sort_order", "desc")
	params.Set("limit", "1")

	requestURL := fmt.Sprintf("%s?%s", baseURL, params.Encode())

	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		obs, err := c.doRequest(ctx, requestURL, seriesID)
		if err == nil {
			return obs, nil
		}

		lastErr = err
		slog.Warn("FRED API request failed, retrying",
			"series_id", seriesID,
			"attempt", attempt,
			"max_retries", maxRetries,
			"error", err)

		if attempt < maxRetries {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(retryDelay * time.Duration(attempt)):
				// Exponential backoff
			}
		}
	}

	return nil, fmt.Errorf("failed after %d attempts: %w", maxRetries, lastErr)
}

func (c *Client) doRequest(ctx context.Context, requestURL, seriesID string) (*Observation, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var apiResp APIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if len(apiResp.Observations) == 0 {
		return nil, fmt.Errorf("no observations returned for series %s", seriesID)
	}

	record := apiResp.Observations[0]

	// Parse date
	date, err := time.Parse("2006-01-02", record.Date)
	if err != nil {
		return nil, fmt.Errorf("failed to parse date %s: %w", record.Date, err)
	}

	// Parse value (FRED returns "." for missing values)
	if record.Value == "." {
		return nil, fmt.Errorf("no value available for series %s on %s", seriesID, record.Date)
	}

	value, err := strconv.ParseFloat(record.Value, 64)
	if err != nil {
		return nil, fmt.Errorf("failed to parse value %s: %w", record.Value, err)
	}

	return &Observation{
		Date:  date,
		Value: value,
	}, nil
}
