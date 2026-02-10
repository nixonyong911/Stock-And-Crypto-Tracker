package security

import (
	"regexp"
	"strings"
	"unicode"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/config"
	"github.com/stocktracker/gateway/internal/db"
)

// Service handles prompt injection detection and input sanitization
type Service struct {
	config   *config.Config
	database *db.PostgresDB
	logger   zerolog.Logger
	patterns []*regexp.Regexp
}

// NewService creates a new security service
func NewService(cfg *config.Config, database *db.PostgresDB, logger zerolog.Logger) *Service {
	// Compile injection detection patterns
	rawPatterns := []string{
		`(?i)ignore\s+(all\s+)?previous\s+instructions`,
		`(?i)ignore\s+(all\s+)?prior\s+instructions`,
		`(?i)disregard\s+(all\s+)?previous`,
		`(?i)forget\s+(all\s+)?previous`,
		`(?i)you\s+are\s+now\s+a`,
		`(?i)act\s+as\s+(a\s+)?`,
		`(?i)pretend\s+(you\s+are|to\s+be)`,
		`(?i)system\s*prompt\s*:`,
		`(?i)new\s+instructions?\s*:`,
		`(?i)\bDAN\b.*\bmode\b`,
		`(?i)jailbreak`,
		`(?i)bypass\s+(your\s+)?(restrictions|rules|filters|safety)`,
		`(?i)override\s+(your\s+)?(instructions|rules|programming)`,
		`(?i)reveal\s+(your\s+)?(system|instructions|prompt|rules)`,
		`(?i)what\s+(are|is)\s+your\s+(system\s+)?prompt`,
		`(?i)show\s+me\s+your\s+(system\s+)?prompt`,
		`(?i)repeat\s+(your\s+)?(system\s+)?(prompt|instructions)`,
		`(?i)execute\s+(this\s+)?(command|code|script)`,
		`(?i)run\s+(this\s+)?(command|code|shell|bash)`,
		`(?i)(sudo|rm\s+-rf|chmod|wget|curl\s+-o)`,
	}

	patterns := make([]*regexp.Regexp, 0, len(rawPatterns))
	for _, p := range rawPatterns {
		compiled, err := regexp.Compile(p)
		if err != nil {
			logger.Warn().Str("pattern", p).Err(err).Msg("Failed to compile security pattern")
			continue
		}
		patterns = append(patterns, compiled)
	}

	logger.Info().Int("patterns", len(patterns)).Msg("Security service initialized")

	return &Service{
		config:   cfg,
		database: database,
		logger:   logger,
		patterns: patterns,
	}
}

// Check performs security checks on a message
// Returns (blocked bool, reason string)
func (s *Service) Check(message string) (bool, string) {
	// Step 1: Sanitize input
	sanitized := s.sanitize(message)

	// Step 2: Check message length
	if len(sanitized) > s.config.MaxMessageLength {
		return true, "Message exceeds maximum length"
	}

	// Step 3: Pattern matching against known injection attempts
	for _, pattern := range s.patterns {
		if pattern.MatchString(sanitized) {
			return true, "Potential prompt injection detected"
		}
	}

	// Step 4: Check for base64 encoded content (potential obfuscation)
	if s.hasBase64Block(sanitized) {
		return true, "Encoded content detected"
	}

	return false, ""
}

// sanitize cleans the input message
func (s *Service) sanitize(message string) string {
	// Strip zero-width characters
	cleaned := strings.Map(func(r rune) rune {
		// Remove zero-width spaces, joiners, and other invisible characters
		if r == '\u200B' || r == '\u200C' || r == '\u200D' || r == '\uFEFF' {
			return -1
		}
		// Remove right-to-left override and other bidi controls
		if r == '\u202A' || r == '\u202B' || r == '\u202C' || r == '\u202D' || r == '\u202E' {
			return -1
		}
		// Remove other invisible formatting chars
		if unicode.Is(unicode.Cf, r) && r != '\n' && r != '\t' {
			return -1
		}
		return r
	}, message)

	// Normalize whitespace (collapse multiple spaces)
	spaceRegex := regexp.MustCompile(`\s+`)
	cleaned = spaceRegex.ReplaceAllString(cleaned, " ")

	return strings.TrimSpace(cleaned)
}

// hasBase64Block checks for suspicious base64 encoded blocks
func (s *Service) hasBase64Block(message string) bool {
	// Look for long base64-like strings (>50 chars of base64 alphabet)
	b64Regex := regexp.MustCompile(`[A-Za-z0-9+/=]{50,}`)
	return b64Regex.MatchString(message)
}
