package channel

import (
	"sync"

	"github.com/rs/zerolog"
)

// Registry manages channel registrations
type Registry struct {
	mu       sync.RWMutex
	channels map[string]Info
	logger   zerolog.Logger
}

// NewRegistry creates a new channel registry
func NewRegistry(logger zerolog.Logger) *Registry {
	return &Registry{
		channels: make(map[string]Info),
		logger:   logger,
	}
}

// Register adds or updates a channel registration
func (r *Registry) Register(info Info) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.channels[info.Type] = info
	r.logger.Info().Str("type", info.Type).Msg("Channel registered")
}

// List returns all registered channels
func (r *Registry) List() []Info {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]Info, 0, len(r.channels))
	for _, info := range r.channels {
		result = append(result, info)
	}
	return result
}

// Get returns a specific channel by type
func (r *Registry) Get(channelType string) (Info, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	info, ok := r.channels[channelType]
	return info, ok
}
