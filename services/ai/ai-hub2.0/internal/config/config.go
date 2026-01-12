// Package config provides environment-based configuration for ai-hub2.0
package config

import (
	"fmt"
	"time"

	"github.com/kelseyhightower/envconfig"
)

// Config holds all configuration values for the service
type Config struct {
	// Server settings
	Port int `envconfig:"PORT" default:"8080"`

	// API Key authentication
	APIKey string `envconfig:"AI_HUB_API_KEY"`

	// CLI execution settings
	DefaultContextPath string        `envconfig:"AI_HUB_DEFAULT_CONTEXT_PATH" default:"/home/azureuser/stock-tracker"`
	CLITimeoutSeconds  int           `envconfig:"AI_HUB_CLI_TIMEOUT_SECONDS" default:"120"`
	MaxConcurrent      int           `envconfig:"AI_HUB_MAX_CONCURRENT" default:"3"`
	CLITimeout         time.Duration // Computed from CLITimeoutSeconds

	// Database settings
	DatabaseURL string `envconfig:"DATABASE_URL" required:"true"`

	// Redis settings (optional, for future use)
	RedisURL string `envconfig:"REDIS_URL" default:"redis://redis:6379"`
}

// CLIEndpoint defines a pre-configured CLI endpoint
type CLIEndpoint struct {
	Path              string
	InstructionFolder string
	ContextPath       string
	Agent             string
	Mode              string
	Description       string
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	var cfg Config
	if err := envconfig.Process("", &cfg); err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	// Compute duration from seconds
	cfg.CLITimeout = time.Duration(cfg.CLITimeoutSeconds) * time.Second

	return &cfg, nil
}

// GetCLIEndpoints returns the list of available CLI endpoints
func (c *Config) GetCLIEndpoints() []CLIEndpoint {
	return []CLIEndpoint{
		{
			Path:              "/cli/stock-tracker/claude/opus-4.5",
			InstructionFolder: "stock-tracker",
			ContextPath:       c.DefaultContextPath,
			Agent:             "claude",
			Mode:              "opus-4.5",
			Description:       "Stock Tracker analysis with Claude Opus 4.5",
		},
		{
			Path:              "/cli/stock-tracker/cursor/opus-4.5",
			InstructionFolder: "stock-tracker",
			ContextPath:       c.DefaultContextPath,
			Agent:             "cursor",
			Mode:              "opus-4.5",
			Description:       "Stock Tracker analysis with Cursor Opus 4.5",
		},
		{
			Path:              "/cli/telegram-agent/cursor/sonnet-4.5",
			InstructionFolder: "stock-tracker",
			ContextPath:       c.DefaultContextPath,
			Agent:             "cursor",
			Mode:              "sonnet-4.5",
			Description:       "Telegram AI Chat Agent - Stock analysis with MCP tools",
		},
		{
			Path:              "/cli/telegram-agent-test/cursor/sonnet-4.5",
			InstructionFolder: "stock-tracker",
			ContextPath:       c.DefaultContextPath,
			Agent:             "cursor",
			Mode:              "sonnet-4.5",
			Description:       "Telegram AI Chat Agent TEST - For testing without affecting production",
		},
	}
}
