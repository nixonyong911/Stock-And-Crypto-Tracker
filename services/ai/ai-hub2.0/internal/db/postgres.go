// Package db provides PostgreSQL database connection using pgxpool
package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// PostgresDB manages the database connection pool
type PostgresDB struct {
	pool   *pgxpool.Pool
	logger zerolog.Logger
}

// LogEntry represents a request log entry for the logging_ai_hub_request table
type LogEntry struct {
	RequestTimestamp time.Time
	Endpoint         string
	RequestBody      json.RawMessage
	ResponseBody     json.RawMessage
	ElapsedTimeSec   float64
	StatusCode       int
}

// New creates a new PostgresDB instance with connection pooling
func New(ctx context.Context, databaseURL string, logger zerolog.Logger) (*PostgresDB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Configure pool settings
	config.MaxConns = 10
	config.MinConns = 2
	config.HealthCheckPeriod = 30 * time.Second
	config.MaxConnLifetime = 1 * time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connection
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	logger.Info().Msg("Database connection pool established")

	return &PostgresDB{
		pool:   pool,
		logger: logger,
	}, nil
}

// Pool returns the underlying connection pool
func (db *PostgresDB) Pool() *pgxpool.Pool {
	return db.pool
}

// Close closes the connection pool
func (db *PostgresDB) Close() {
	db.pool.Close()
	db.logger.Info().Msg("Database connection pool closed")
}

// HealthCheck verifies the database connection is healthy
func (db *PostgresDB) HealthCheck(ctx context.Context) error {
	return db.pool.Ping(ctx)
}

// InsertLogEntry inserts a request log entry into logging_ai_hub_request table
func (db *PostgresDB) InsertLogEntry(ctx context.Context, entry LogEntry) error {
	query := `
		INSERT INTO logging_ai_hub_request 
		(request_timestamp, endpoint, request_body, response_body, elapsed_time_sec, status_code)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err := db.pool.Exec(ctx, query,
		entry.RequestTimestamp,
		entry.Endpoint,
		entry.RequestBody,
		entry.ResponseBody,
		entry.ElapsedTimeSec,
		entry.StatusCode,
	)

	if err != nil {
		db.logger.Error().Err(err).Str("endpoint", entry.Endpoint).Msg("Failed to insert log entry")
		return err
	}

	db.logger.Debug().
		Str("endpoint", entry.Endpoint).
		Float64("elapsed_sec", entry.ElapsedTimeSec).
		Msg("Log entry inserted")

	return nil
}
