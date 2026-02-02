package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Indicator represents an economic indicator from the database
type Indicator struct {
	ID             int
	SeriesID       string
	Category       string
	DisplayName    string
	BullishWhen    string
	DisplayMode    string  // rate, yoy_pct, trillions_from_billions, trillions_from_millions
	DisplayDivisor float64 // divisor for display conversion
}

// IndicatorStatus represents the current status of an indicator
type IndicatorStatus struct {
	SeriesID      string
	DisplayName   string
	Category      string
	CurrentValue  *float64
	CurrentDate   *time.Time
	PreviousValue *float64
	PreviousDate  *time.Time
	ChangePercent *float64
	Trend         *string
	CurrentSignal *string
	LastUpdatedAt *time.Time
	// Fields for media display
	DisplayMode        string
	DisplayDivisor     float64
	MediaCurrentValue  *float64
	MediaPreviousValue *float64
	// Official release date from FRED calendar
	LastReleaseDate *time.Time
}

// Repository handles database operations for economic indicators
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository creates a new Repository
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// Ping checks database connectivity
func (r *Repository) Ping(ctx context.Context) error {
	return r.pool.Ping(ctx)
}

// GetActiveIndicators returns all active indicator definitions
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

// GetAllIndicatorStatus returns current status of all indicators
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
			media_previous_value,
			last_release_date
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
			&s.LastReleaseDate,
		); err != nil {
			return nil, fmt.Errorf("failed to scan status: %w", err)
		}
		statuses = append(statuses, s)
	}

	return statuses, rows.Err()
}

// UpsertIndicator updates an indicator with a new value
// Only shifts current to previous when observation_date changes (actual new release)
// Returns (updated bool, error) - updated=false means same data, skipped
func (r *Repository) UpsertIndicator(ctx context.Context, seriesID string, value float64, date time.Time) error {
	// First, check if the observation_date is newer than what we have
	// This prevents shifting previous_value when re-fetching the same data
	var currentObsDate *time.Time
	checkQuery := `SELECT current_observation_date FROM analysis_economic_indicators WHERE series_id = $1`
	err := r.pool.QueryRow(ctx, checkQuery, seriesID).Scan(&currentObsDate)
	if err != nil {
		return fmt.Errorf("failed to check indicator %s: %w", seriesID, err)
	}

	// If we already have this observation date, skip the update
	// This means it's the same data release, not a new announcement
	if currentObsDate != nil && !date.After(*currentObsDate) {
		// Same or older data - no update needed
		return nil
	}

	// New observation_date detected - this is an actual new release
	// Shift previous and update current
	query := `
		UPDATE analysis_economic_indicators
		SET
			-- Shift: previous = old current (only happens on new release)
			previous_value = current_value,
			previous_observation_date = current_observation_date,
			-- Update current with new data
			current_value = $2,
			current_observation_date = $3,
			-- Compute change (comparing new value to OLD current, which is now previous)
			change_value = CASE
				WHEN current_value IS NULL THEN NULL
				ELSE $2 - current_value
			END,
			change_percent = CASE
				WHEN current_value IS NULL OR current_value = 0 THEN NULL
				ELSE (($2 - current_value) / current_value) * 100
			END,
			-- Compute trend based on change
			trend = CASE
				WHEN current_value IS NULL THEN 'flat'
				WHEN $2 > current_value THEN 'up'
				WHEN $2 < current_value THEN 'down'
				ELSE 'flat'
			END,
			-- Compute signal based on trend vs bullish_when
			current_signal = CASE
				WHEN current_value IS NULL THEN 'neutral'
				WHEN $2 > current_value AND bullish_when = 'up' THEN 'bullish'
				WHEN $2 < current_value AND bullish_when = 'down' THEN 'bullish'
				WHEN $2 = current_value THEN 'neutral'
				ELSE 'bearish'
			END,
			last_updated_at = NOW()
		WHERE series_id = $1
	`

	result, err := r.pool.Exec(ctx, query, seriesID, value, date)
	if err != nil {
		return fmt.Errorf("failed to upsert indicator: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("indicator %s not found", seriesID)
	}

	return nil
}

// UpsertIndicatorWithMedia updates an indicator with raw and media-friendly values
// yoyValue and yoyDate are optional and only used for yoy_pct display mode
// lastReleaseDate is the official FRED release date (when data was announced)
func (r *Repository) UpsertIndicatorWithMedia(
	ctx context.Context,
	seriesID string,
	value float64,
	date time.Time,
	mediaValue *float64,
	yoyValue *float64,
	yoyDate *time.Time,
	lastReleaseDate *time.Time,
) error {
	// First, check if the observation_date is newer than what we have
	var currentObsDate *time.Time
	checkQuery := `SELECT current_observation_date FROM analysis_economic_indicators WHERE series_id = $1`
	err := r.pool.QueryRow(ctx, checkQuery, seriesID).Scan(&currentObsDate)
	if err != nil {
		return fmt.Errorf("failed to check indicator %s: %w", seriesID, err)
	}

	// Always update last_release_date if provided (even if observation hasn't changed)
	if lastReleaseDate != nil {
		updateReleaseDateQuery := `UPDATE analysis_economic_indicators SET last_release_date = $2 WHERE series_id = $1`
		_, err := r.pool.Exec(ctx, updateReleaseDateQuery, seriesID, lastReleaseDate)
		if err != nil {
			return fmt.Errorf("failed to update release date for %s: %w", seriesID, err)
		}
	}

	// If we already have this observation date, skip the value update
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
		return fmt.Errorf("failed to upsert indicator with media: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("indicator %s not found", seriesID)
	}

	return nil
}

// GetIndicatorBySeriesID returns a single indicator by series ID
func (r *Repository) GetIndicatorBySeriesID(ctx context.Context, seriesID string) (*Indicator, error) {
	query := `
		SELECT id, series_id, category, display_name, bullish_when,
		       COALESCE(display_mode, 'rate') as display_mode,
		       COALESCE(display_divisor, 1) as display_divisor
		FROM analysis_economic_indicators
		WHERE series_id = $1 AND is_active = true
	`

	var ind Indicator
	err := r.pool.QueryRow(ctx, query, seriesID).Scan(
		&ind.ID, &ind.SeriesID, &ind.Category, &ind.DisplayName, &ind.BullishWhen,
		&ind.DisplayMode, &ind.DisplayDivisor,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get indicator %s: %w", seriesID, err)
	}

	return &ind, nil
}

// ========================================
// Release Calendar Functions
// ========================================

// ReleaseCalendarEntry represents a row in analysis_release_calendar
type ReleaseCalendarEntry struct {
	SeriesID             string
	ReleaseID            int
	ReleaseName          string
	NextReleaseDate      *time.Time
	FollowingReleaseDate *time.Time
	ReleaseFrequency     string
	ReleaseLink          string
	LastSyncedAt         time.Time
}

// UpsertReleaseCalendar inserts or updates a release calendar entry
func (r *Repository) UpsertReleaseCalendar(ctx context.Context, entry ReleaseCalendarEntry) error {
	query := `
		INSERT INTO analysis_release_calendar (
			series_id, release_id, release_name,
			next_release_date, following_release_date,
			release_frequency, release_link, last_synced_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		ON CONFLICT (series_id) DO UPDATE SET
			release_id = EXCLUDED.release_id,
			release_name = EXCLUDED.release_name,
			next_release_date = EXCLUDED.next_release_date,
			following_release_date = EXCLUDED.following_release_date,
			release_frequency = EXCLUDED.release_frequency,
			release_link = EXCLUDED.release_link,
			last_synced_at = NOW()
	`

	_, err := r.pool.Exec(ctx, query,
		entry.SeriesID,
		entry.ReleaseID,
		entry.ReleaseName,
		entry.NextReleaseDate,
		entry.FollowingReleaseDate,
		entry.ReleaseFrequency,
		entry.ReleaseLink,
	)
	if err != nil {
		return fmt.Errorf("failed to upsert release calendar: %w", err)
	}

	return nil
}

// GetAllReleaseCalendar returns all release calendar entries ordered by next release date
func (r *Repository) GetAllReleaseCalendar(ctx context.Context) ([]ReleaseCalendarEntry, error) {
	query := `
		SELECT
			rc.series_id, rc.release_id, rc.release_name,
			rc.next_release_date, rc.following_release_date,
			rc.release_frequency, rc.release_link, rc.last_synced_at
		FROM analysis_release_calendar rc
		JOIN analysis_economic_indicators ei ON rc.series_id = ei.series_id
		WHERE ei.is_active = true
		ORDER BY rc.next_release_date ASC NULLS LAST
	`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query release calendar: %w", err)
	}
	defer rows.Close()

	var entries []ReleaseCalendarEntry
	for rows.Next() {
		var e ReleaseCalendarEntry
		if err := rows.Scan(
			&e.SeriesID, &e.ReleaseID, &e.ReleaseName,
			&e.NextReleaseDate, &e.FollowingReleaseDate,
			&e.ReleaseFrequency, &e.ReleaseLink, &e.LastSyncedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan release calendar: %w", err)
		}
		entries = append(entries, e)
	}

	return entries, rows.Err()
}

// GetUpcomingReleases returns releases scheduled within the next N days
func (r *Repository) GetUpcomingReleases(ctx context.Context, days int) ([]ReleaseCalendarEntry, error) {
	query := `
		SELECT
			rc.series_id, rc.release_id, rc.release_name,
			rc.next_release_date, rc.following_release_date,
			rc.release_frequency, rc.release_link, rc.last_synced_at
		FROM analysis_release_calendar rc
		JOIN analysis_economic_indicators ei ON rc.series_id = ei.series_id
		WHERE ei.is_active = true
		  AND rc.next_release_date IS NOT NULL
		  AND rc.next_release_date <= CURRENT_DATE + $1
		ORDER BY rc.next_release_date ASC
	`

	rows, err := r.pool.Query(ctx, query, days)
	if err != nil {
		return nil, fmt.Errorf("failed to query upcoming releases: %w", err)
	}
	defer rows.Close()

	var entries []ReleaseCalendarEntry
	for rows.Next() {
		var e ReleaseCalendarEntry
		if err := rows.Scan(
			&e.SeriesID, &e.ReleaseID, &e.ReleaseName,
			&e.NextReleaseDate, &e.FollowingReleaseDate,
			&e.ReleaseFrequency, &e.ReleaseLink, &e.LastSyncedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan upcoming release: %w", err)
		}
		entries = append(entries, e)
	}

	return entries, rows.Err()
}

// ========================================
// Schedule Status Functions
// ========================================

// UpdateScheduleStatus updates the last run status for a worker schedule
func (r *Repository) UpdateScheduleStatus(ctx context.Context, scheduleID int, status string, message string) error {
	query := `
		UPDATE worker_fetch_schedules
		SET last_run_at = NOW(),
		    last_run_status = $2,
		    last_run_message = $3,
		    updated_at = NOW()
		WHERE id = $1
	`

	result, err := r.pool.Exec(ctx, query, scheduleID, status, message)
	if err != nil {
		return fmt.Errorf("failed to update schedule status: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("schedule %d not found", scheduleID)
	}

	return nil
}
