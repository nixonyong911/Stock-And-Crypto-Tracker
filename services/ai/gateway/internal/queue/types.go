package queue

import (
	"time"

	"github.com/stocktracker/gateway/internal/config"
)

// Item represents a queued request
type Item struct {
	Tier      config.Tier
	Priority  int
	Timestamp time.Time
	Ready     chan struct{} // Closed when the item can proceed
	index     int          // For heap interface
}
