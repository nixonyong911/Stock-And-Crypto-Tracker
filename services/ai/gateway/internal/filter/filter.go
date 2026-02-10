package filter

import (
	"regexp"
	"strings"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/config"
)

const aiDisclaimer = "\n\n_This is AI generated content and should only be used for educational purposes._"

// Filter handles per-tier output filtering
type Filter struct {
	config        *config.Config
	logger        zerolog.Logger
	stripPatterns []*regexp.Regexp
}

// NewFilter creates a new output filter
func NewFilter(cfg *config.Config, logger zerolog.Logger) *Filter {
	// Patterns to strip from non-DEV output
	rawPatterns := []string{
		`(?i)^Tool:\s.*$`,
		`(?i)^MCP:\s.*$`,
		`(?i)^Function:\s.*$`,
		`(?i)^Calling tool:\s.*$`,
		`(?i)^tool_call\s.*$`,
		`/home/azureuser/[^\s]+`,
		`/root/[^\s]+`,
		`/app/[^\s]+`,
		`/opt/cursor-agent/[^\s]+`,
		`(?i)^Error:\s.*$`,
		`(?i)^at Object\..*$`,
		`(?i)^\s+at\s+.*\(.*:\d+:\d+\)$`,
		`(?i)^Stack trace:.*$`,
	}

	patterns := make([]*regexp.Regexp, 0, len(rawPatterns))
	for _, p := range rawPatterns {
		compiled, err := regexp.Compile(p)
		if err != nil {
			logger.Warn().Str("pattern", p).Err(err).Msg("Failed to compile filter pattern")
			continue
		}
		patterns = append(patterns, compiled)
	}

	return &Filter{config: cfg, logger: logger, stripPatterns: patterns}
}

// Apply filters the CLI output based on user tier
func (f *Filter) Apply(output string, tier config.Tier) string {
	// DEV tier: no filtering, just add disclaimer
	if tier == config.TierDev {
		return output + aiDisclaimer
	}

	tierCfg := f.config.GetTierConfig(tier)

	// Strip sensitive patterns
	lines := strings.Split(output, "\n")
	var filtered []string
	for _, line := range lines {
		stripped := false
		for _, pattern := range f.stripPatterns {
			if pattern.MatchString(line) {
				stripped = true
				break
			}
		}
		if !stripped {
			filtered = append(filtered, line)
		}
	}

	result := strings.TrimSpace(strings.Join(filtered, "\n"))

	// Truncate if needed
	if tierCfg.MaxResponseLength > 0 && len(result) > tierCfg.MaxResponseLength {
		result = result[:tierCfg.MaxResponseLength] + "\n\n... (response truncated, upgrade for longer responses)"
	}

	// Add disclaimer
	result += aiDisclaimer

	return result
}
