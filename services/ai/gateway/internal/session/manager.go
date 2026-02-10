package session

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/config"
	"github.com/stocktracker/gateway/internal/db"
)

// Session represents an active user session
type Session struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	ChannelType  string    `json:"channel_type"`
	CLISessionID string    `json:"cli_session_id"`
	Tier         string    `json:"tier"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
	LastActiveAt time.Time `json:"last_active_at"`
}

// Manager manages session lifecycle
type Manager struct {
	config   *config.Config
	database *db.PostgresDB
	redis    *db.RedisDB
	logger   zerolog.Logger
}

// NewManager creates a new session manager
func NewManager(cfg *config.Config, database *db.PostgresDB, redis *db.RedisDB, logger zerolog.Logger) *Manager {
	return &Manager{config: cfg, database: database, redis: redis, logger: logger}
}

// CreateSession creates a new session, expiring any existing one
func (m *Manager) CreateSession(ctx context.Context, userID, channelType, tier string) (*Session, error) {
	// Expire existing sessions for this user
	_, err := m.database.Pool().Exec(ctx,
		"UPDATE gateway_sessions SET expires_at = NOW() WHERE user_id = $1 AND expires_at > NOW()", userID)
	if err != nil {
		m.logger.Warn().Err(err).Str("user_id", userID).Msg("Failed to expire old sessions")
	}

	// Create new session
	sess := &Session{
		ID:           uuid.New().String(),
		UserID:       userID,
		ChannelType:  channelType,
		CLISessionID: uuid.New().String(),
		Tier:         tier,
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(time.Duration(m.config.SessionExpiryDays) * 24 * time.Hour),
		LastActiveAt: time.Now(),
	}

	_, err = m.database.Pool().Exec(ctx,
		`INSERT INTO gateway_sessions (id, user_id, channel_type, cli_session_id, tier, created_at, expires_at, last_active_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		sess.ID, sess.UserID, sess.ChannelType, sess.CLISessionID, sess.Tier,
		sess.CreatedAt, sess.ExpiresAt, sess.LastActiveAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create session: %w", err)
	}

	m.logger.Info().Str("user_id", userID).Str("session_id", sess.ID).Msg("Session created")
	return sess, nil
}

// GetActiveSession returns the active session for a user
func (m *Manager) GetActiveSession(ctx context.Context, userID string) (*Session, error) {
	var sess Session
	err := m.database.Pool().QueryRow(ctx,
		`SELECT id, user_id, channel_type, cli_session_id, tier, created_at, expires_at, last_active_at
		 FROM gateway_sessions WHERE user_id = $1 AND expires_at > NOW()
		 ORDER BY created_at DESC LIMIT 1`, userID).
		Scan(&sess.ID, &sess.UserID, &sess.ChannelType, &sess.CLISessionID,
			&sess.Tier, &sess.CreatedAt, &sess.ExpiresAt, &sess.LastActiveAt)
	if err != nil {
		return nil, fmt.Errorf("no active session: %w", err)
	}
	return &sess, nil
}

// ExpireSession expires a session by ID
func (m *Manager) ExpireSession(ctx context.Context, sessionID string) error {
	_, err := m.database.Pool().Exec(ctx,
		"UPDATE gateway_sessions SET expires_at = NOW() WHERE id = $1", sessionID)
	return err
}

// UpdateLastActive updates the last_active_at timestamp
func (m *Manager) UpdateLastActive(ctx context.Context, sessionID string) {
	_, _ = m.database.Pool().Exec(ctx,
		"UPDATE gateway_sessions SET last_active_at = NOW() WHERE id = $1", sessionID)
}

// AcquireUserLock acquires a per-user lock (Layer 1 of queue system)
// Returns an unlock function and error
func (m *Manager) AcquireUserLock(ctx context.Context, userID string, timeout time.Duration) (func(), error) {
	lockKey := fmt.Sprintf("user:%s:lock", userID)
	lockTTL := timeout + 60*time.Second // processing timeout + buffer

	// Try to acquire lock with retry
	deadline := time.Now().Add(60 * time.Second) // max wait 60s
	for {
		acquired, err := m.redis.SetNX(ctx, lockKey, "1", lockTTL)
		if err != nil {
			return nil, fmt.Errorf("lock error: %w", err)
		}

		if acquired {
			unlock := func() {
				_ = m.redis.Del(context.Background(), lockKey)
			}
			return unlock, nil
		}

		if time.Now().After(deadline) {
			return nil, fmt.Errorf("lock timeout: user %s is still processing", userID)
		}

		// Wait before retry
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(1 * time.Second):
			// retry
		}
	}
}

// StartPruner starts the background session pruner
func (m *Manager) StartPruner(ctx context.Context) {
	interval := time.Duration(m.config.SessionPruneInterval) * time.Minute
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		m.logger.Info().Dur("interval", interval).Msg("Session pruner started")

		for {
			select {
			case <-ctx.Done():
				m.logger.Info().Msg("Session pruner stopped")
				return
			case <-ticker.C:
				m.prune(ctx)
			}
		}
	}()
}

func (m *Manager) prune(ctx context.Context) {
	result, err := m.database.Pool().Exec(ctx,
		"DELETE FROM gateway_sessions WHERE expires_at < NOW()")
	if err != nil {
		m.logger.Error().Err(err).Msg("Session pruning failed")
		return
	}
	count := result.RowsAffected()
	if count > 0 {
		m.logger.Info().Int64("pruned", count).Msg("Expired sessions pruned")
	}
}
