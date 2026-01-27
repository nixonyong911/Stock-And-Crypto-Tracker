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

// GetYearAgoObservation fetches the observation closest to 1 year before the given date
func (c *Client) GetYearAgoObservation(ctx context.Context, seriesID string, currentDate time.Time) (*Observation, error) {
	// Calculate target date (1 year ago)
	yearAgo := currentDate.AddDate(-1, 0, 0)

	// Fetch observations around that date (allow some flexibility for monthly data)
	startDate := yearAgo.AddDate(0, -1, 0).Format("2006-01-02") // 1 month before target
	endDate := yearAgo.AddDate(0, 1, 0).Format("2006-01-02")    // 1 month after target

	params := url.Values{}
	params.Set("series_id", seriesID)
	params.Set("api_key", c.apiKey)
	params.Set("file_type", "json")
	params.Set("observation_start", startDate)
	params.Set("observation_end", endDate)
	params.Set("sort_order", "desc") // Get most recent first

	requestURL := fmt.Sprintf("%s?%s", baseURL, params.Encode())

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
		return nil, fmt.Errorf("no year-ago observations for series %s", seriesID)
	}

	// Find the observation closest to exactly 1 year ago
	var closest *ObservationRecord
	var closestDiff time.Duration = time.Hour * 24 * 365 // Max 1 year diff

	for i := range apiResp.Observations {
		record := &apiResp.Observations[i]
		if record.Value == "." {
			continue // Skip missing values
		}

		obsDate, err := time.Parse("2006-01-02", record.Date)
		if err != nil {
			continue
		}

		diff := yearAgo.Sub(obsDate)
		if diff < 0 {
			diff = -diff
		}

		if diff < closestDiff {
			closestDiff = diff
			closest = record
		}
	}

	if closest == nil {
		return nil, fmt.Errorf("no valid year-ago observation for series %s", seriesID)
	}

	date, _ := time.Parse("2006-01-02", closest.Date)
	value, _ := strconv.ParseFloat(closest.Value, 64)

	return &Observation{
		Date:  date,
		Value: value,
	}, nil
}
