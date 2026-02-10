package usage

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/config"
	"github.com/stocktracker/gateway/internal/db"
)

// UsageInfo contains usage information for a user
type UsageInfo struct {
	Tier           string     `json:"tier"`
	Remaining      int        `json:"remaining"`
	Max            int        `json:"max"`
	NextRechargeAt *time.Time `json:"next_recharge_at,omitempty"`
	FullRechargeAt *time.Time `json:"full_recharge_at,omitempty"`
}

// Tracker manages message usage tracking and recharge
type Tracker struct {
	config   *config.Config
	redis    *db.RedisDB
	database *db.PostgresDB
	logger   zerolog.Logger
}

// NewTracker creates a new usage tracker
func NewTracker(cfg *config.Config, redis *db.RedisDB, database *db.PostgresDB, logger zerolog.Logger) *Tracker {
	return &Tracker{config: cfg, redis: redis, database: database, logger: logger}
}

func (t *Tracker) usageKey(userID string) string {
	return fmt.Sprintf("usage:%s:slots", userID)
}

// CheckAndConsume checks if the user has remaining messages and consumes one
// Returns remaining count (>= 0 means success, < 0 means exhausted)
func (t *Tracker) CheckAndConsume(ctx context.Context, userID, channelType string) (int, error) {
	key := t.usageKey(userID)
	rechargeDuration := time.Duration(t.config.FreeRechargeHours) * time.Hour
	maxMessages := t.config.FreeMaxMessages
	now := time.Now()

	// Get all timestamps from the list
	timestamps, err := t.redis.LRange(ctx, key, 0, -1)
	if err != nil {
		return 0, fmt.Errorf("failed to read usage slots: %w", err)
	}

	// Count active (non-recharged) slots
	activeCount := 0
	for _, ts := range timestamps {
		tsUnix, _ := strconv.ParseInt(ts, 10, 64)
		usedAt := time.Unix(tsUnix, 0)
		if now.Sub(usedAt) < rechargeDuration {
			activeCount++
		}
	}

	remaining := maxMessages - activeCount
	if remaining <= 0 {
		return -1, nil
	}

	// Consume a slot
	if err := t.redis.LPush(ctx, key, now.Unix()); err != nil {
		return 0, fmt.Errorf("failed to record usage: %w", err)
	}

	// Trim to max slots
	if err := t.redis.LTrim(ctx, key, 0, int64(maxMessages-1)); err != nil {
		t.logger.Warn().Err(err).Msg("Failed to trim usage list")
	}

	// Set TTL for auto-cleanup (all slots recharge after maxMessages * rechargeHours)
	maxTTL := time.Duration(maxMessages) * rechargeDuration
	if err := t.redis.Expire(ctx, key, maxTTL); err != nil {
		t.logger.Warn().Err(err).Msg("Failed to set usage TTL")
	}

	return remaining - 1, nil // -1 because we just consumed one
}

// GetUsageInfo returns usage information for a user
func (t *Tracker) GetUsageInfo(ctx context.Context, userID string) (*UsageInfo, error) {
	key := t.usageKey(userID)
	rechargeDuration := time.Duration(t.config.FreeRechargeHours) * time.Hour
	maxMessages := t.config.FreeMaxMessages
	now := time.Now()

	timestamps, err := t.redis.LRange(ctx, key, 0, -1)
	if err != nil {
		return &UsageInfo{Tier: "free", Remaining: maxMessages, Max: maxMessages}, nil
	}

	// Find active slots and earliest recharge
	var earliestUsed time.Time
	var latestUsed time.Time
	activeCount := 0

	for _, ts := range timestamps {
		tsUnix, _ := strconv.ParseInt(ts, 10, 64)
		usedAt := time.Unix(tsUnix, 0)
		if now.Sub(usedAt) < rechargeDuration {
			activeCount++
			if earliestUsed.IsZero() || usedAt.Before(earliestUsed) {
				earliestUsed = usedAt
			}
			if latestUsed.IsZero() || usedAt.After(latestUsed) {
				latestUsed = usedAt
			}
		}
	}

	info := &UsageInfo{
		Tier:      "free",
		Remaining: maxMessages - activeCount,
		Max:       maxMessages,
	}

	if activeCount > 0 {
		nextRecharge := earliestUsed.Add(rechargeDuration)
		info.NextRechargeAt = &nextRecharge
		fullRecharge := latestUsed.Add(rechargeDuration)
		info.FullRechargeAt = &fullRecharge
	}

	return info, nil
}
