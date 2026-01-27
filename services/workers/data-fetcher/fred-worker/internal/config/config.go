package config

import (
	"fmt"
	"os"
)

// Config holds all configuration for the worker
type Config struct {
	DatabaseURL       string
	FredAPIKey        string
	ScheduleTime      string // HH:MM format
	ScheduleTimezone  string // IANA timezone
	HTTPPort          string
	MetricsServiceURL string
}

// Load reads configuration from environment variables
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		FredAPIKey:        os.Getenv("FRED_API_KEY"),
		ScheduleTime:      getEnvOrDefault("SCHEDULE_TIME", "08:00"),
		ScheduleTimezone:  getEnvOrDefault("SCHEDULE_TIMEZONE", "America/New_York"),
		HTTPPort:          getEnvOrDefault("HTTP_PORT", "8080"),
		MetricsServiceURL: getEnvOrDefault("METRICS_SERVICE_URL", "http://metrics:8080"),
	}

	// Validate required fields
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}
	if cfg.FredAPIKey == "" {
		return nil, fmt.Errorf("FRED_API_KEY is required")
	}

	return cfg, nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
