package db

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

// RedisDB manages the Redis connection
type RedisDB struct {
	client *redis.Client
	logger zerolog.Logger
}

// NewRedis creates a new Redis client
func NewRedis(ctx context.Context, redisURL string, logger zerolog.Logger) (*RedisDB, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to ping Redis: %w", err)
	}

	logger.Info().Msg("Redis connection established")
	return &RedisDB{client: client, logger: logger}, nil
}

// Client returns the underlying Redis client
func (r *RedisDB) Client() *redis.Client {
	return r.client
}

// Close closes the Redis connection
func (r *RedisDB) Close() error {
	r.logger.Info().Msg("Redis connection closed")
	return r.client.Close()
}

// HealthCheck verifies the Redis connection
func (r *RedisDB) HealthCheck(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

// SetNX sets a key only if it doesn't exist (for locks)
func (r *RedisDB) SetNX(ctx context.Context, key string, value interface{}, ttl time.Duration) (bool, error) {
	return r.client.SetNX(ctx, key, value, ttl).Result()
}

// Del deletes a key
func (r *RedisDB) Del(ctx context.Context, key string) error {
	return r.client.Del(ctx, key).Err()
}

// Expire sets TTL on a key
func (r *RedisDB) Expire(ctx context.Context, key string, ttl time.Duration) error {
	return r.client.Expire(ctx, key, ttl).Err()
}

// Get gets a key value
func (r *RedisDB) Get(ctx context.Context, key string) (string, error) {
	return r.client.Get(ctx, key).Result()
}

// LPush pushes to the left of a list
func (r *RedisDB) LPush(ctx context.Context, key string, values ...interface{}) error {
	return r.client.LPush(ctx, key, values...).Err()
}

// LRange gets a range from a list
func (r *RedisDB) LRange(ctx context.Context, key string, start, stop int64) ([]string, error) {
	return r.client.LRange(ctx, key, start, stop).Result()
}

// LTrim trims a list to the specified range
func (r *RedisDB) LTrim(ctx context.Context, key string, start, stop int64) error {
	return r.client.LTrim(ctx, key, start, stop).Err()
}

// ExpireKey sets TTL on a key (alias for Expire)
func (r *RedisDB) ExpireKey(ctx context.Context, key string, ttl time.Duration) error {
	return r.client.Expire(ctx, key, ttl).Err()
}
