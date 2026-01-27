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
// Shifts current to previous and updates computed fields
func (r *Repository) UpsertIndicator(ctx context.Context, seriesID string, value float64, date time.Time) error {
	query := `
		UPDATE analysis_economic_indicators
		SET
			-- Shift: previous = old current
			previous_value = current_value,
			previous_observation_date = current_observation_date,
			-- Update current
			current_value = $2,
			current_observation_date = $3,
			-- Compute change
			change_value = $2 - current_value,
			change_percent = CASE 
				WHEN current_value IS NULL OR current_value = 0 THEN NULL
				ELSE (($2 - current_value) / current_value) * 100
			END,
			-- Compute trend
			trend = CASE 
				WHEN $2 > current_value THEN 'up'
				WHEN $2 < current_value THEN 'down'
				ELSE 'flat'
			END,
			-- Compute signal based on trend vs bullish_when
			current_signal = CASE 
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
