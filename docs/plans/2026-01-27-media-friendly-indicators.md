# Media-Friendly Economic Indicators Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance FRED worker to display economic indicators as media reports them (YoY % for inflation, target rates for Fed Funds, trillions for money supply) instead of raw FRED values.

**Architecture:** Add `display_mode` metadata to database, fetch historical data for YoY calculations, compute media-friendly values in worker, and expose both raw and media values via API. Frontend can toggle between views.

**Tech Stack:** Go (FRED worker), PostgreSQL (Supabase), FRED API

---

## Background Context

### Current State
The `analysis_economic_indicators` table stores raw FRED values:
- **Fed Funds**: `FEDFUNDS` = 3.72% (effective rate) - media shows 3.75% (target rate)
- **CPI/PCE**: Raw index values (e.g., 326.03) - media shows YoY % (e.g., 2.7%)
- **M2**: Billions (22,322) - media shows Trillions ($22.3T)
- **Fed Balance Sheet**: Millions (6,584,580) - media shows Trillions ($6.58T)

### Target State
Store both raw values (for accuracy) and media-friendly values (for display):
- Fed Funds: Switch to `DFEDTARU` (target upper bound)
- CPI/Core CPI: Calculate and store YoY % change
- PCE/Core PCE: Calculate and store YoY % change
- M2/WALCL: Store raw values, compute display values at query time

### Files to Modify
- `services/workers/data-fetcher/fred-worker/internal/db/repository.go` - Database operations
- `services/workers/data-fetcher/fred-worker/internal/fred/client.go` - FRED API client
- `services/workers/data-fetcher/fred-worker/internal/server/server.go` - API endpoints
- `services/workers/data-fetcher/fred-worker/main.go` - Fetch logic
- Database: `analysis_economic_indicators` table - Schema changes

### FRED Series Reference
| Indicator | Current Series | Media-Friendly Series | Display Mode |
|-----------|---------------|----------------------|--------------|
| Fed Funds | `FEDFUNDS` | `DFEDTARU` | `rate` |
| 10Y Treasury | `DGS10` | `DGS10` (unchanged) | `rate` |
| 2Y Treasury | `DGS2` | `DGS2` (unchanged) | `rate` |
| CPI | `CPIAUCSL` | `CPIAUCSL` + YoY calc | `yoy_pct` |
| Core CPI | `CPILFESL` | `CPILFESL` + YoY calc | `yoy_pct` |
| PCE | `PCEPI` | `PCEPI` + YoY calc | `yoy_pct` |
| Core PCE | `PCEPILFE` | `PCEPILFE` + YoY calc | `yoy_pct` |
| M2 | `M2SL` | `M2SL` (divide by 1000) | `trillions_from_billions` |
| Fed BS | `WALCL` | `WALCL` (divide by 1M) | `trillions_from_millions` |
| 10Y-2Y | `T10Y2Y` | `T10Y2Y` (unchanged) | `rate` |
| 10Y-FF | `T10YFF` | `T10YFF` (unchanged) | `rate` |
| HY Spread | `BAMLH0A0HYM2` | `BAMLH0A0HYM2` (unchanged) | `rate` |

---

## Task 1: Database Schema Enhancement

**Files:**
- Execute SQL in Supabase SQL Editor (manual step)

**Step 1: Add new columns to analysis_economic_indicators**

Run this SQL in Supabase SQL Editor:

```sql
-- Add display configuration columns
ALTER TABLE analysis_economic_indicators 
ADD COLUMN IF NOT EXISTS display_mode VARCHAR(30) DEFAULT 'rate',
ADD COLUMN IF NOT EXISTS display_divisor NUMERIC DEFAULT 1,
ADD COLUMN IF NOT EXISTS yoy_observation_value NUMERIC(18,6),
ADD COLUMN IF NOT EXISTS yoy_observation_date DATE,
ADD COLUMN IF NOT EXISTS media_current_value NUMERIC(18,6),
ADD COLUMN IF NOT EXISTS media_previous_value NUMERIC(18,6);

-- Add comments for clarity
COMMENT ON COLUMN analysis_economic_indicators.display_mode IS 'How to display: rate, yoy_pct, trillions_from_billions, trillions_from_millions';
COMMENT ON COLUMN analysis_economic_indicators.display_divisor IS 'Divisor for display (1000 for billions->trillions, 1000000 for millions->trillions)';
COMMENT ON COLUMN analysis_economic_indicators.yoy_observation_value IS 'Value from 1 year ago for YoY % calculation';
COMMENT ON COLUMN analysis_economic_indicators.yoy_observation_date IS 'Date of the year-ago observation';
COMMENT ON COLUMN analysis_economic_indicators.media_current_value IS 'Computed media-friendly current value (YoY % or divided value)';
COMMENT ON COLUMN analysis_economic_indicators.media_previous_value IS 'Computed media-friendly previous value';
```

**Step 2: Update existing indicators with display configuration**

```sql
-- Update display modes for each indicator type
UPDATE analysis_economic_indicators SET 
    display_mode = 'rate',
    display_divisor = 1
WHERE series_id IN ('FEDFUNDS', 'DGS10', 'DGS2', 'T10Y2Y', 'T10YFF', 'BAMLH0A0HYM2');

-- Inflation indicators need YoY % calculation
UPDATE analysis_economic_indicators SET 
    display_mode = 'yoy_pct',
    display_divisor = 1,
    units = 'YoY %'
WHERE series_id IN ('CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE');

-- M2 is in Billions, display as Trillions
UPDATE analysis_economic_indicators SET 
    display_mode = 'trillions_from_billions',
    display_divisor = 1000,
    units = 'Trillions USD'
WHERE series_id = 'M2SL';

-- Fed Balance Sheet is in Millions, display as Trillions
UPDATE analysis_economic_indicators SET 
    display_mode = 'trillions_from_millions',
    display_divisor = 1000000,
    units = 'Trillions USD'
WHERE series_id = 'WALCL';
```

**Step 3: Switch Fed Funds to Target Rate**

```sql
-- Change FEDFUNDS to DFEDTARU (Federal Funds Target Rate - Upper Limit)
UPDATE analysis_economic_indicators SET 
    series_id = 'DFEDTARU',
    display_name = 'Fed Funds Target Rate',
    description = 'Federal Funds Target Rate - Upper Limit (policy rate announced by FOMC)'
WHERE series_id = 'FEDFUNDS';
```

**Step 4: Verify changes**

```sql
SELECT series_id, display_name, display_mode, display_divisor, units 
FROM analysis_economic_indicators 
ORDER BY category, display_order;
```

**Expected output:**
| series_id | display_name | display_mode | display_divisor | units |
|-----------|-------------|--------------|-----------------|-------|
| DFEDTARU | Fed Funds Target Rate | rate | 1 | Percent |
| CPIAUCSL | CPI | yoy_pct | 1 | YoY % |
| M2SL | M2 Money Supply | trillions_from_billions | 1000 | Trillions USD |
| WALCL | Fed Balance Sheet | trillions_from_millions | 1000000 | Trillions USD |

**Step 5: Update release calendar FK if needed**

```sql
-- Update release calendar to point to new series_id
UPDATE analysis_release_calendar SET series_id = 'DFEDTARU' WHERE series_id = 'FEDFUNDS';
```

---

## Task 2: Update Go Repository Types

**Files:**
- Modify: `services/workers/data-fetcher/fred-worker/internal/db/repository.go`

**Step 1: Update Indicator struct**

Add new fields to the `Indicator` struct:

```go
// Indicator represents an economic indicator from the database
type Indicator struct {
	ID             int
	SeriesID       string
	Category       string
	DisplayName    string
	BullishWhen    string
	DisplayMode    string  // NEW: rate, yoy_pct, trillions_from_billions, trillions_from_millions
	DisplayDivisor float64 // NEW: divisor for display conversion
}
```

**Step 2: Update GetActiveIndicators query**

Modify the query to include new fields:

```go
func (r *Repository) GetActiveIndicators(ctx context.Context) ([]Indicator, error) {
	query := `
		SELECT id, series_id, category, display_name, bullish_when,
		       COALESCE(display_mode, 'rate') as display_mode,
		       COALESCE(display_divisor, 1) as display_divisor
		FROM analysis_economic_indicators
		WHERE is_active = true
		ORDER BY category, display_order
	`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query indicators: %w", err)
	}
	defer rows.Close()

	var indicators []Indicator
	for rows.Next() {
		var ind Indicator
		if err := rows.Scan(&ind.ID, &ind.SeriesID, &ind.Category, &ind.DisplayName, 
		                    &ind.BullishWhen, &ind.DisplayMode, &ind.DisplayDivisor); err != nil {
			return nil, fmt.Errorf("failed to scan indicator: %w", err)
		}
		indicators = append(indicators, ind)
	}

	return indicators, rows.Err()
}
```

**Step 3: Update IndicatorStatus struct**

Add media value fields:

```go
// IndicatorStatus represents the current status of an indicator
type IndicatorStatus struct {
	SeriesID           string
	DisplayName        string
	Category           string
	CurrentValue       *float64
	CurrentDate        *time.Time
	PreviousValue      *float64
	PreviousDate       *time.Time
	ChangePercent      *float64
	Trend              *string
	CurrentSignal      *string
	LastUpdatedAt      *time.Time
	// NEW fields for media display
	DisplayMode        string
	DisplayDivisor     float64
	MediaCurrentValue  *float64
	MediaPreviousValue *float64
}
```

**Step 4: Update GetAllIndicatorStatus query**

```go
func (r *Repository) GetAllIndicatorStatus(ctx context.Context) ([]IndicatorStatus, error) {
	query := `
		SELECT 
			series_id, display_name, category,
			current_value, current_observation_date,
			previous_value, previous_observation_date,
			change_percent, trend, current_signal,
			last_updated_at,
			COALESCE(display_mode, 'rate') as display_mode,
			COALESCE(display_divisor, 1) as display_divisor,
			media_current_value,
			media_previous_value
		FROM analysis_economic_indicators
		WHERE is_active = true
		ORDER BY category, display_order
	`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query indicator status: %w", err)
	}
	defer rows.Close()

	var statuses []IndicatorStatus
	for rows.Next() {
		var s IndicatorStatus
		if err := rows.Scan(
			&s.SeriesID, &s.DisplayName, &s.Category,
			&s.CurrentValue, &s.CurrentDate,
			&s.PreviousValue, &s.PreviousDate,
			&s.ChangePercent, &s.Trend, &s.CurrentSignal,
			&s.LastUpdatedAt,
			&s.DisplayMode, &s.DisplayDivisor,
			&s.MediaCurrentValue, &s.MediaPreviousValue,
		); err != nil {
			return nil, fmt.Errorf("failed to scan status: %w", err)
		}
		statuses = append(statuses, s)
	}

	return statuses, rows.Err()
}
```

**Step 5: Commit**

```bash
git add services/workers/data-fetcher/fred-worker/internal/db/repository.go
git commit -m "feat(fred-worker): add display mode fields to repository types"
```

---

## Task 3: Add YoY Observation Fetch to FRED Client

**Files:**
- Modify: `services/workers/data-fetcher/fred-worker/internal/fred/client.go`

**Step 1: Add GetYearAgoObservation method**

Add this new method to fetch the observation from approximately 1 year ago:

```go
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
```

**Step 2: Commit**

```bash
git add services/workers/data-fetcher/fred-worker/internal/fred/client.go
git commit -m "feat(fred-worker): add GetYearAgoObservation for YoY calculation"
```

---

## Task 4: Create Media Value Calculator

**Files:**
- Create: `services/workers/data-fetcher/fred-worker/internal/calc/media.go`

**Step 1: Create the calc package directory**

```bash
mkdir -p services/workers/data-fetcher/fred-worker/internal/calc
```

**Step 2: Create media.go with calculation functions**

```go
package calc

import "math"

// DisplayMode constants
const (
	ModeRate                  = "rate"
	ModeYoYPct                = "yoy_pct"
	ModeTrillionsFromBillions = "trillions_from_billions"
	ModeTrillionsFromMillions = "trillions_from_millions"
)

// CalculateMediaValue computes the media-friendly display value
// based on the display mode and raw value
func CalculateMediaValue(displayMode string, rawValue float64, yearAgoValue *float64, divisor float64) *float64 {
	switch displayMode {
	case ModeRate:
		// Rate values are already in the correct format
		return &rawValue

	case ModeYoYPct:
		// Calculate Year-over-Year percentage change
		if yearAgoValue == nil || *yearAgoValue == 0 {
			return nil
		}
		yoyPct := ((rawValue - *yearAgoValue) / *yearAgoValue) * 100
		// Round to 1 decimal place (e.g., 2.7%)
		rounded := math.Round(yoyPct*10) / 10
		return &rounded

	case ModeTrillionsFromBillions:
		// Convert billions to trillions
		trillions := rawValue / 1000
		// Round to 2 decimal places
		rounded := math.Round(trillions*100) / 100
		return &rounded

	case ModeTrillionsFromMillions:
		// Convert millions to trillions
		trillions := rawValue / 1000000
		// Round to 2 decimal places
		rounded := math.Round(trillions*100) / 100
		return &rounded

	default:
		// Unknown mode, return raw value
		return &rawValue
	}
}

// NeedsYearAgoData returns true if the display mode requires YoY calculation
func NeedsYearAgoData(displayMode string) bool {
	return displayMode == ModeYoYPct
}
```

**Step 3: Commit**

```bash
git add services/workers/data-fetcher/fred-worker/internal/calc/media.go
git commit -m "feat(fred-worker): add media value calculator for YoY and unit conversions"
```

---

## Task 5: Update Repository Upsert for Media Values

**Files:**
- Modify: `services/workers/data-fetcher/fred-worker/internal/db/repository.go`

**Step 1: Add new UpsertIndicatorWithMedia function**

Add this function below the existing `UpsertIndicator`:

```go
// UpsertIndicatorWithMedia updates an indicator with raw and media-friendly values
// yoyValue and yoyDate are optional and only used for yoy_pct display mode
func (r *Repository) UpsertIndicatorWithMedia(
	ctx context.Context,
	seriesID string,
	value float64,
	date time.Time,
	mediaValue *float64,
	yoyValue *float64,
	yoyDate *time.Time,
) error {
	// First, check if the observation_date is newer than what we have
	var currentObsDate *time.Time
	checkQuery := `SELECT current_observation_date FROM analysis_economic_indicators WHERE series_id = $1`
	err := r.pool.QueryRow(ctx, checkQuery, seriesID).Scan(&currentObsDate)
	if err != nil {
		return fmt.Errorf("failed to check indicator %s: %w", seriesID, err)
	}

	// If we already have this observation date, skip the update
	if currentObsDate != nil && !date.After(*currentObsDate) {
		return nil
	}

	// New observation_date detected - this is an actual new release
	query := `
		UPDATE analysis_economic_indicators
		SET
			-- Shift: previous = old current
			previous_value = current_value,
			previous_observation_date = current_observation_date,
			media_previous_value = media_current_value,
			-- Update current with new data
			current_value = $2,
			current_observation_date = $3,
			media_current_value = $4,
			-- Update YoY reference if provided
			yoy_observation_value = COALESCE($5, yoy_observation_value),
			yoy_observation_date = COALESCE($6, yoy_observation_date),
			-- Compute change based on MEDIA values for proper comparison
			change_value = CASE 
				WHEN media_current_value IS NULL THEN NULL
				ELSE $4 - media_current_value
			END,
			change_percent = CASE 
				WHEN media_current_value IS NULL OR media_current_value = 0 THEN NULL
				ELSE (($4 - media_current_value) / ABS(media_current_value)) * 100
			END,
			-- Compute trend based on media values
			trend = CASE 
				WHEN media_current_value IS NULL THEN 'flat'
				WHEN $4 > media_current_value THEN 'up'
				WHEN $4 < media_current_value THEN 'down'
				ELSE 'flat'
			END,
			-- Compute signal based on trend vs bullish_when
			current_signal = CASE 
				WHEN media_current_value IS NULL THEN 'neutral'
				WHEN $4 > media_current_value AND bullish_when = 'up' THEN 'bullish'
				WHEN $4 < media_current_value AND bullish_when = 'down' THEN 'bullish'
				WHEN $4 = media_current_value THEN 'neutral'
				ELSE 'bearish'
			END,
			last_updated_at = NOW()
		WHERE series_id = $1
	`

	result, err := r.pool.Exec(ctx, query, seriesID, value, date, mediaValue, yoyValue, yoyDate)
	if err != nil {
		return fmt.Errorf("failed to upsert indicator: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("indicator %s not found", seriesID)
	}

	return nil
}
```

**Step 2: Commit**

```bash
git add services/workers/data-fetcher/fred-worker/internal/db/repository.go
git commit -m "feat(fred-worker): add UpsertIndicatorWithMedia for media value storage"
```

---

## Task 6: Update Main Fetch Logic

**Files:**
- Modify: `services/workers/data-fetcher/fred-worker/main.go`

**Step 1: Add import for calc package**

Add to imports:

```go
import (
	// ... existing imports ...
	"github.com/stocktracker/fred-worker/internal/calc"
)
```

**Step 2: Update runFetch function**

Replace the existing `runFetch` function with this enhanced version:

```go
// runFetch executes the fetch operation for all active indicators
func runFetch(ctx context.Context, repo *db.Repository, fredClient *fred.Client, metricsClient *metrics.Client) error {
	slog.Info("Starting scheduled fetch")

	// Get all active indicators
	indicators, err := repo.GetActiveIndicators(ctx)
	if err != nil {
		slog.Error("Failed to get active indicators", "error", err)
		return err
	}

	slog.Info("Fetching indicators", "count", len(indicators))

	successCount := 0
	errorCount := 0

	for _, ind := range indicators {
		// Fetch latest observation from FRED
		obs, err := fredClient.GetLatestObservation(ctx, ind.SeriesID)
		if err != nil {
			slog.Error("Failed to fetch indicator", "series_id", ind.SeriesID, "error", err)
			errorCount++
			_ = metricsClient.IncrementCounter(ctx, "fetch_errors_total", map[string]string{
				"series_id":  ind.SeriesID,
				"error_type": "api_error",
			})
			continue
		}

		// Calculate media-friendly value
		var mediaValue *float64
		var yoyValue *float64
		var yoyDate *time.Time

		if calc.NeedsYearAgoData(ind.DisplayMode) {
			// Fetch year-ago observation for YoY calculation
			yoyObs, err := fredClient.GetYearAgoObservation(ctx, ind.SeriesID, obs.Date)
			if err != nil {
				slog.Warn("Failed to fetch year-ago observation, skipping YoY calc",
					"series_id", ind.SeriesID, "error", err)
			} else {
				yoyValue = &yoyObs.Value
				yoyDate = &yoyObs.Date
				mediaValue = calc.CalculateMediaValue(ind.DisplayMode, obs.Value, yoyValue, ind.DisplayDivisor)
			}
		} else {
			// For non-YoY modes, calculate directly
			mediaValue = calc.CalculateMediaValue(ind.DisplayMode, obs.Value, nil, ind.DisplayDivisor)
		}

		// Upsert to database with media value
		if err := repo.UpsertIndicatorWithMedia(ctx, ind.SeriesID, obs.Value, obs.Date, mediaValue, yoyValue, yoyDate); err != nil {
			slog.Error("Failed to upsert indicator", "series_id", ind.SeriesID, "error", err)
			errorCount++
			_ = metricsClient.IncrementCounter(ctx, "fetch_errors_total", map[string]string{
				"series_id":  ind.SeriesID,
				"error_type": "db_error",
			})
			continue
		}

		successCount++
		slog.Info("Updated indicator",
			"series_id", ind.SeriesID,
			"raw_value", obs.Value,
			"media_value", mediaValue,
			"display_mode", ind.DisplayMode,
			"date", obs.Date)
	}

	// Report metrics
	_ = metricsClient.IncrementCounter(ctx, "fetch_operations_total", map[string]string{"status": "completed"})

	slog.Info("Fetch completed", "success", successCount, "errors", errorCount)
	return nil
}
```

**Step 3: Commit**

```bash
git add services/workers/data-fetcher/fred-worker/main.go
git commit -m "feat(fred-worker): update fetch logic to calculate media values"
```

---

## Task 7: Update API Response with Display Toggle

**Files:**
- Modify: `services/workers/data-fetcher/fred-worker/internal/server/server.go`

**Step 1: Update IndicatorStatusDTO**

Modify the struct to include both raw and media values:

```go
// IndicatorStatusDTO represents an indicator in the status response
type IndicatorStatusDTO struct {
	SeriesID      string   `json:"series_id"`
	DisplayName   string   `json:"display_name"`
	Category      string   `json:"category"`
	// Raw values (actual FRED data)
	RawCurrentValue  *float64 `json:"raw_current_value,omitempty"`
	RawPreviousValue *float64 `json:"raw_previous_value,omitempty"`
	// Media-friendly values (for display)
	CurrentValue     *float64 `json:"current_value,omitempty"`
	PreviousValue    *float64 `json:"previous_value,omitempty"`
	// Metadata
	DisplayMode   string   `json:"display_mode"`
	ChangePercent *float64 `json:"change_percent,omitempty"`
	Trend         *string  `json:"trend,omitempty"`
	Signal        *string  `json:"signal,omitempty"`
}
```

**Step 2: Update StatusResponse**

Add a `display` field:

```go
// StatusResponse represents the /api/fred/status response
type StatusResponse struct {
	Service        string               `json:"service"`
	Status         string               `json:"status"`
	Version        string               `json:"version"`
	Display        string               `json:"display"` // NEW: "media" or "raw"
	IndicatorCount int                  `json:"indicator_count"`
	LastUpdatedAt  *string              `json:"last_updated_at,omitempty"`
	Indicators     []IndicatorStatusDTO `json:"indicators,omitempty"`
}
```

**Step 3: Update handleStatus to support display query param**

```go
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Check display mode from query param (default: media)
	displayMode := r.URL.Query().Get("display")
	if displayMode != "raw" {
		displayMode = "media"
	}

	indicators, err := s.repository.GetAllIndicatorStatus(ctx)
	if err != nil {
		slog.Error("Failed to get indicator status", "error", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	var lastUpdated *string
	dtos := make([]IndicatorStatusDTO, 0, len(indicators))
	for _, ind := range indicators {
		dto := IndicatorStatusDTO{
			SeriesID:         ind.SeriesID,
			DisplayName:      ind.DisplayName,
			Category:         ind.Category,
			DisplayMode:      ind.DisplayMode,
			RawCurrentValue:  ind.CurrentValue,
			RawPreviousValue: ind.PreviousValue,
			ChangePercent:    ind.ChangePercent,
			Trend:            ind.Trend,
			Signal:           ind.CurrentSignal,
		}

		// Set current/previous based on display mode
		if displayMode == "raw" {
			dto.CurrentValue = ind.CurrentValue
			dto.PreviousValue = ind.PreviousValue
		} else {
			// Media mode - use media values, fallback to raw if not available
			if ind.MediaCurrentValue != nil {
				dto.CurrentValue = ind.MediaCurrentValue
			} else {
				dto.CurrentValue = ind.CurrentValue
			}
			if ind.MediaPreviousValue != nil {
				dto.PreviousValue = ind.MediaPreviousValue
			} else {
				dto.PreviousValue = ind.PreviousValue
			}
		}

		dtos = append(dtos, dto)

		if ind.LastUpdatedAt != nil {
			formatted := ind.LastUpdatedAt.Format(time.RFC3339)
			if lastUpdated == nil || formatted > *lastUpdated {
				lastUpdated = &formatted
			}
		}
	}

	response := StatusResponse{
		Service:        "fred-worker",
		Status:         "Running",
		Version:        "1.2.0", // Bump version
		Display:        displayMode,
		IndicatorCount: len(indicators),
		LastUpdatedAt:  lastUpdated,
		Indicators:     dtos,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
```

**Step 4: Commit**

```bash
git add services/workers/data-fetcher/fred-worker/internal/server/server.go
git commit -m "feat(fred-worker): add display toggle for media/raw values in API"
```

---

## Task 8: Update Version and Build

**Files:**
- Modify: `services/workers/data-fetcher/fred-worker/main.go`

**Step 1: Bump version constant**

```go
const version = "1.2.0"
```

**Step 2: Run go mod tidy**

```bash
cd services/workers/data-fetcher/fred-worker
go mod tidy
```

**Step 3: Build and verify**

```bash
cd services/workers/data-fetcher/fred-worker
go build -o fred-worker .
```

**Expected:** Build succeeds with no errors.

**Step 4: Commit**

```bash
git add services/workers/data-fetcher/fred-worker/
git commit -m "feat(fred-worker): bump version to 1.2.0 with media-friendly values"
```

---

## Task 9: Populate Initial Media Values

**Files:**
- Execute SQL in Supabase SQL Editor (manual step)

After deployment, run this SQL to populate initial media values for existing data:

```sql
-- Populate media values for rate-type indicators (already correct)
UPDATE analysis_economic_indicators 
SET media_current_value = current_value,
    media_previous_value = previous_value
WHERE display_mode = 'rate';

-- Populate media values for M2 (billions to trillions)
UPDATE analysis_economic_indicators 
SET media_current_value = current_value / 1000,
    media_previous_value = previous_value / 1000
WHERE series_id = 'M2SL';

-- Populate media values for Fed Balance Sheet (millions to trillions)
UPDATE analysis_economic_indicators 
SET media_current_value = current_value / 1000000,
    media_previous_value = previous_value / 1000000
WHERE series_id = 'WALCL';

-- For YoY % indicators, need to calculate manually or wait for next fetch
-- These will be populated by the worker on next run
-- Temporarily set to NULL to indicate pending calculation
UPDATE analysis_economic_indicators 
SET media_current_value = NULL,
    media_previous_value = NULL
WHERE display_mode = 'yoy_pct';
```

---

## Task 10: Deploy and Verify

**Files:**
- Follow standard deployment workflow

**Step 1: SSH into VM and check current version**

```bash
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
docker ps | grep fred
```

Note the current image version.

**Step 2: Stage and push changes**

```bash
git status
git add services/workers/data-fetcher/fred-worker/
git commit -m "feat(fred-worker): media-friendly indicator values with YoY calculation"
git push origin main
```

**Step 3: Monitor GitHub Actions build**

```bash
gh run watch
```

Wait for build to complete successfully.

**Step 4: Verify VM deployment**

```bash
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
docker ps | grep fred
```

Confirm version incremented.

**Step 5: Test API with display toggle**

```bash
# Media values (default)
curl -s https://api.stocktracker.com/api/fred/status | jq '.indicators[0]'

# Raw values
curl -s "https://api.stocktracker.com/api/fred/status?display=raw" | jq '.indicators[0]'
```

**Step 6: Trigger manual fetch to populate YoY values**

```bash
curl -X POST https://api.stocktracker.com/api/fred/trigger/all
```

**Step 7: Verify CPI shows YoY percentage**

```bash
curl -s https://api.stocktracker.com/api/fred/status | jq '.indicators[] | select(.series_id=="CPIAUCSL")'
```

**Expected output:**
```json
{
  "series_id": "CPIAUCSL",
  "display_name": "CPI",
  "category": "inflation",
  "raw_current_value": 326.03,
  "raw_previous_value": 325.12,
  "current_value": 2.7,
  "previous_value": 2.9,
  "display_mode": "yoy_pct",
  "change_percent": -7.4,
  "trend": "down",
  "signal": "bullish"
}
```

---

## Summary

### Changes Made
1. **Database**: Added `display_mode`, `display_divisor`, `yoy_observation_value`, `yoy_observation_date`, `media_current_value`, `media_previous_value` columns
2. **Fed Funds**: Changed from `FEDFUNDS` (effective rate) to `DFEDTARU` (target rate)
3. **Inflation indicators**: Now calculate and store YoY % change
4. **Money supply indicators**: Now display in trillions instead of billions/millions
5. **API**: Added `?display=raw` toggle to see original FRED values

### API Usage
```bash
# Default (media-friendly values for dashboards)
GET /api/fred/status

# Raw FRED values (for debugging/verification)
GET /api/fred/status?display=raw
```

### Indicator Display Modes
| Mode | Calculation | Example |
|------|-------------|---------|
| `rate` | Pass-through | 3.75% → 3.75% |
| `yoy_pct` | (current - yearAgo) / yearAgo * 100 | 326.03 → 2.7% |
| `trillions_from_billions` | value / 1000 | 22,322 → 22.32T |
| `trillions_from_millions` | value / 1000000 | 6,584,580 → 6.58T |
