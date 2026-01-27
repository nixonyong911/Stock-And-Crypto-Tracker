package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Indicator represents an economic indicator from the database
type Indicator struct {
	ID          int
	SeriesID    string
	Category    string
	DisplayName string
	BullishWhen string
}

// IndicatorStatus represents the current status of an indicator
type IndicatorStatus struct {
	SeriesID       string
	DisplayName    string
	Category       string
	CurrentValue   *float64
	CurrentDate    *time.Time
	PreviousValue  *float64
	PreviousDate   *time.Time
	ChangePercent  *float64
	Trend          *string
	CurrentSignal  *string
	LastUpdatedAt  *time.Time
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
		SELECT id, series_id, category, display_name, bullish_when
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
		if err := rows.Scan(&ind.ID, &ind.SeriesID, &ind.Category, &ind.DisplayName, &ind.BullishWhen); err != nil {
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
			last_updated_at
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

// GetIndicatorBySeriesID returns a single indicator by series ID
func (r *Repository) GetIndicatorBySeriesID(ctx context.Context, seriesID string) (*Indicator, error) {
	query := `
		SELECT id, series_id, category, display_name, bullish_when
		FROM analysis_economic_indicators
		WHERE series_id = $1 AND is_active = true
	`

	var ind Indicator
	err := r.pool.QueryRow(ctx, query, seriesID).Scan(
		&ind.ID, &ind.SeriesID, &ind.Category, &ind.DisplayName, &ind.BullishWhen,
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
	SeriesID            string
	ReleaseID           int
	ReleaseName         string
	NextReleaseDate     *time.Time
	FollowingReleaseDate *time.Time
	ReleaseFrequency    string
	ReleaseLink         string
	LastSyncedAt        time.Time
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
