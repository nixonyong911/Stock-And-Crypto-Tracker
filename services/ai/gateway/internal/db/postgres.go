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

// LogEntry represents a request log entry
type LogEntry struct {
	RequestTimestamp time.Time
	Endpoint         string
	RequestBody      json.RawMessage
	ResponseBody     json.RawMessage
	ElapsedTimeSec   float64
	StatusCode       int
}

// New creates a new PostgresDB instance
func New(ctx context.Context, databaseURL string, logger zerolog.Logger) (*PostgresDB, error) {
	poolCfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	poolCfg.MaxConns = 10
	poolCfg.MinConns = 2
	poolCfg.HealthCheckPeriod = 30 * time.Second
	poolCfg.MaxConnLifetime = 1 * time.Hour
	poolCfg.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	logger.Info().Msg("Database connection pool established")
	return &PostgresDB{pool: pool, logger: logger}, nil
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

// HealthCheck verifies the database connection
func (db *PostgresDB) HealthCheck(ctx context.Context) error {
	return db.pool.Ping(ctx)
}

// InsertLogEntry inserts a request log entry
func (db *PostgresDB) InsertLogEntry(ctx context.Context, entry LogEntry) error {
	query := `
		INSERT INTO logging_gateway_request 
		(request_timestamp, endpoint, request_body, response_body, elapsed_time_sec, status_code)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := db.pool.Exec(ctx, query,
		entry.RequestTimestamp, entry.Endpoint, entry.RequestBody,
		entry.ResponseBody, entry.ElapsedTimeSec, entry.StatusCode,
	)
	if err != nil {
		db.logger.Error().Err(err).Str("endpoint", entry.Endpoint).Msg("Failed to insert log entry")
		return err
	}
	return nil
}

// InsertUsageLog inserts a usage audit log entry
func (db *PostgresDB) InsertUsageLog(ctx context.Context, userID, tier, channelType string) error {
	query := `INSERT INTO gateway_usage_log (user_id, tier, channel_type, created_at) VALUES ($1, $2, $3, NOW())`
	_, err := db.pool.Exec(ctx, query, userID, tier, channelType)
	if err != nil {
		db.logger.Error().Err(err).Str("user_id", userID).Msg("Failed to insert usage log")
		return err
	}
	return nil
}

// InsertSecurityLog logs a blocked injection attempt
func (db *PostgresDB) InsertSecurityLog(ctx context.Context, userID, channelType, message, reason string) error {
	query := `INSERT INTO gateway_security_log (user_id, channel_type, message_text, block_reason, created_at) VALUES ($1, $2, $3, $4, NOW())`
	_, err := db.pool.Exec(ctx, query, userID, channelType, message, reason)
	if err != nil {
		db.logger.Error().Err(err).Str("user_id", userID).Msg("Failed to insert security log")
		return err
	}
	return nil
}
