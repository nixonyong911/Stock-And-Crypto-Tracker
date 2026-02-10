package config

import (
	"fmt"
	"time"

	"github.com/kelseyhightower/envconfig"
)

// Tier represents a user subscription tier
type Tier string

const (
	TierFree Tier = "free"
	TierPro  Tier = "pro"
	TierMax  Tier = "max"
	TierDev  Tier = "dev"
)

// TierConfig holds per-tier configuration
type TierConfig struct {
	MaxResponseLength int
	CLITimeoutSeconds int
	CLITimeout        time.Duration
	QueueDepth        int
	QueuePriority     int // higher = more priority
	HomePath          string
}

// Config holds all configuration values
type Config struct {
	// Server
	Port int `envconfig:"PORT" default:"8080"`

	// API Key authentication
	APIKey string `envconfig:"GATEWAY_API_KEY"`

	// CLI execution
	ContextPath    string `envconfig:"GATEWAY_CONTEXT_PATH" default:"/app/agent-context"`
	TierHomesPath  string `envconfig:"GATEWAY_TIER_HOMES_PATH" default:"/app/tier-homes"`
	MaxConcurrent  int    `envconfig:"GATEWAY_MAX_CONCURRENT" default:"3"`
	DefaultCLI     string `envconfig:"GATEWAY_DEFAULT_CLI" default:"cursor-agent"`
	DefaultModel   string `envconfig:"GATEWAY_DEFAULT_MODEL" default:"sonnet-4.5"`

	// Free tier usage recharge
	FreeMaxMessages      int `envconfig:"GATEWAY_FREE_MAX_MESSAGES" default:"5"`
	FreeRechargeHours    int `envconfig:"GATEWAY_FREE_RECHARGE_HOURS" default:"5"`

	// Session
	SessionExpiryDays    int `envconfig:"GATEWAY_SESSION_EXPIRY_DAYS" default:"7"`
	SessionPruneInterval int `envconfig:"GATEWAY_SESSION_PRUNE_MINUTES" default:"30"`

	// Timeouts (defaults, overridden per tier)
	DefaultCLITimeoutSeconds int `envconfig:"GATEWAY_CLI_TIMEOUT_SECONDS" default:"120"`

	// Database
	DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`

	// Redis
	RedisURL string `envconfig:"REDIS_URL" default:"redis://redis:6379"`

	// Security
	MaxMessageLength int `envconfig:"GATEWAY_MAX_MESSAGE_LENGTH" default:"4000"`

	// Computed fields
	DefaultCLITimeout time.Duration
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	cfg.DefaultCLITimeout = time.Duration(cfg.DefaultCLITimeoutSeconds) * time.Second

	return &cfg, nil
}

// GetTierConfig returns configuration for a specific tier
func (c *Config) GetTierConfig(tier Tier) TierConfig {
	switch tier {
	case TierFree:
		return TierConfig{
			MaxResponseLength: 2000,
			CLITimeoutSeconds: 60,
			CLITimeout:        60 * time.Second,
			QueueDepth:        1,
			QueuePriority:     1,
			HomePath:          c.TierHomesPath + "/free",
		}
	case TierPro:
		return TierConfig{
			MaxResponseLength: 4000,
			CLITimeoutSeconds: 120,
			CLITimeout:        120 * time.Second,
			QueueDepth:        3,
			QueuePriority:     2,
			HomePath:          c.TierHomesPath + "/pro",
		}
	case TierMax:
		return TierConfig{
			MaxResponseLength: 8000,
			CLITimeoutSeconds: 180,
			CLITimeout:        180 * time.Second,
			QueueDepth:        5,
			QueuePriority:     3,
			HomePath:          c.TierHomesPath + "/max",
		}
	case TierDev:
		return TierConfig{
			MaxResponseLength: 0, // unlimited
			CLITimeoutSeconds: 300,
			CLITimeout:        300 * time.Second,
			QueueDepth:        5,
			QueuePriority:     3,
			HomePath:          c.TierHomesPath + "/dev",
		}
	default:
		return c.GetTierConfig(TierFree)
	}
}

// ParseTier converts a string to a Tier, defaulting to TierFree
func ParseTier(s string) Tier {
	switch s {
	case "pro":
		return TierPro
	case "max":
		return TierMax
	case "dev":
		return TierDev
	default:
		return TierFree
	}
}
