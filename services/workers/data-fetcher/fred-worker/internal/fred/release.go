package fred

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"time"
)

const (
	seriesReleaseURL  = "https://api.stlouisfed.org/fred/series/release"
	releaseDatesURL   = "https://api.stlouisfed.org/fred/release/dates"
)

// ReleaseInfo contains information about a FRED release
type ReleaseInfo struct {
	ReleaseID   int
	ReleaseName string
	ReleaseLink string
}

// ReleaseDate represents an upcoming release date
type ReleaseDate struct {
	ReleaseID int
	Date      time.Time
}

// SeriesReleaseResponse represents the FRED API response for series/release
type SeriesReleaseResponse struct {
	Releases []struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
		Link string `json:"link"`
	} `json:"releases"`
}

// ReleaseDatesResponse represents the FRED API response for release/dates
type ReleaseDatesResponse struct {
	ReleaseDates []struct {
		ReleaseID int    `json:"release_id"`
		Date      string `json:"date"`
	} `json:"release_dates"`
}

// GetSeriesRelease fetches the release information for a given series
// This is used to get the release_id which is needed to fetch release dates
func (c *Client) GetSeriesRelease(ctx context.Context, seriesID string) (*ReleaseInfo, error) {
	params := url.Values{}
	params.Set("series_id", seriesID)
	params.Set("api_key", c.apiKey)
	params.Set("file_type", "json")

	requestURL := fmt.Sprintf("%s?%s", seriesReleaseURL, params.Encode())

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

	var apiResp SeriesReleaseResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	if len(apiResp.Releases) == 0 {
		return nil, fmt.Errorf("no release found for series %s", seriesID)
	}

	release := apiResp.Releases[0]
	return &ReleaseInfo{
		ReleaseID:   release.ID,
		ReleaseName: release.Name,
		ReleaseLink: release.Link,
	}, nil
}

// GetReleaseDates fetches upcoming release dates for a given release_id
// Returns the next few release dates sorted ascending (nearest first)
func (c *Client) GetReleaseDates(ctx context.Context, releaseID int) ([]ReleaseDate, error) {
	// Get dates from today onwards
	today := time.Now().Format("2006-01-02")

	params := url.Values{}
	params.Set("release_id", fmt.Sprintf("%d", releaseID))
	params.Set("api_key", c.apiKey)
	params.Set("file_type", "json")
	params.Set("realtime_start", today)
	params.Set("sort_order", "asc")
	params.Set("limit", "5") // Get next 5 dates
	params.Set("include_release_dates_with_no_data", "true")

	requestURL := fmt.Sprintf("%s?%s", releaseDatesURL, params.Encode())

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

	var apiResp ReleaseDatesResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	var dates []ReleaseDate
	for _, rd := range apiResp.ReleaseDates {
		date, err := time.Parse("2006-01-02", rd.Date)
		if err != nil {
			slog.Warn("Failed to parse release date", "date", rd.Date, "error", err)
			continue
		}
		dates = append(dates, ReleaseDate{
			ReleaseID: rd.ReleaseID,
			Date:      date,
		})
	}

	return dates, nil
}

// GetReleaseFrequency determines the release frequency based on release dates
// Returns human-readable frequency string
func GetReleaseFrequency(dates []ReleaseDate) string {
	if len(dates) < 2 {
		return "Unknown"
	}

	// Calculate average days between releases
	totalDays := 0
	for i := 1; i < len(dates); i++ {
		days := int(dates[i].Date.Sub(dates[i-1].Date).Hours() / 24)
		totalDays += days
	}
	avgDays := totalDays / (len(dates) - 1)

	switch {
	case avgDays <= 1:
		return "Daily"
	case avgDays <= 7:
		return "Weekly"
	case avgDays <= 14:
		return "Bi-weekly"
	case avgDays <= 35:
		return "Monthly"
	case avgDays <= 100:
		return "Quarterly"
	default:
		// Calculate times per year
		timesPerYear := 365 / avgDays
		if timesPerYear <= 1 {
			return "Annual"
		}
		return fmt.Sprintf("%d times per year", timesPerYear)
	}
}
