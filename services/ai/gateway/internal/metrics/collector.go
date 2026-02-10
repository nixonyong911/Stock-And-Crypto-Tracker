package metrics

import (
	"sync"
	"sync/atomic"
	"time"
)

// Collector gathers runtime metrics for the Gateway
type Collector struct {
	startTime time.Time

	// Request counters
	totalRequests   atomic.Int64
	successRequests atomic.Int64
	failedRequests  atomic.Int64

	// Security counters
	blockedInjections atomic.Int64

	// Queue stats
	queueEnqueues   atomic.Int64
	queueTimeouts   atomic.Int64
	queueFullErrors atomic.Int64

	// CLI stats
	cliExecutions    atomic.Int64
	cliTimeouts      atomic.Int64
	cliErrors        atomic.Int64
	cliTotalMs       atomic.Int64 // cumulative execution time in ms

	// Tier counters
	mu           sync.RWMutex
	tierRequests map[string]int64

	// Session pruner stats
	sessionsPruned atomic.Int64

	// Usage (free tier)
	usageRejections atomic.Int64
}

// New creates a new metrics collector
func New() *Collector {
	return &Collector{
		startTime:    time.Now(),
		tierRequests: make(map[string]int64),
	}
}

// --- Increment methods ---

func (c *Collector) IncTotalRequests()         { c.totalRequests.Add(1) }
func (c *Collector) IncSuccessRequests()       { c.successRequests.Add(1) }
func (c *Collector) IncFailedRequests()        { c.failedRequests.Add(1) }
func (c *Collector) IncBlockedInjections()     { c.blockedInjections.Add(1) }
func (c *Collector) IncQueueEnqueues()         { c.queueEnqueues.Add(1) }
func (c *Collector) IncQueueTimeouts()         { c.queueTimeouts.Add(1) }
func (c *Collector) IncQueueFullErrors()       { c.queueFullErrors.Add(1) }
func (c *Collector) IncCLIExecutions()         { c.cliExecutions.Add(1) }
func (c *Collector) IncCLITimeouts()           { c.cliTimeouts.Add(1) }
func (c *Collector) IncCLIErrors()             { c.cliErrors.Add(1) }
func (c *Collector) IncSessionsPruned(n int64) { c.sessionsPruned.Add(n) }
func (c *Collector) IncUsageRejections()       { c.usageRejections.Add(1) }

func (c *Collector) AddCLIDuration(ms int64) {
	c.cliTotalMs.Add(ms)
}

func (c *Collector) IncTierRequest(tier string) {
	c.mu.Lock()
	c.tierRequests[tier]++
	c.mu.Unlock()
}

// --- Snapshot ---

// Snapshot returns a point-in-time snapshot of all metrics
type Snapshot struct {
	UptimeSeconds     float64          `json:"uptime_seconds"`
	TotalRequests     int64            `json:"total_requests"`
	SuccessRequests   int64            `json:"success_requests"`
	FailedRequests    int64            `json:"failed_requests"`
	BlockedInjections int64            `json:"blocked_injections"`
	QueueEnqueues     int64            `json:"queue_enqueues"`
	QueueTimeouts     int64            `json:"queue_timeouts"`
	QueueFullErrors   int64            `json:"queue_full_errors"`
	CLIExecutions     int64            `json:"cli_executions"`
	CLITimeouts       int64            `json:"cli_timeouts"`
	CLIErrors         int64            `json:"cli_errors"`
	CLIAvgMs          float64          `json:"cli_avg_ms"`
	SessionsPruned    int64            `json:"sessions_pruned"`
	UsageRejections   int64            `json:"usage_rejections"`
	RequestsByTier    map[string]int64 `json:"requests_by_tier"`
}

func (c *Collector) Snapshot() Snapshot {
	execs := c.cliExecutions.Load()
	var avgMs float64
	if execs > 0 {
		avgMs = float64(c.cliTotalMs.Load()) / float64(execs)
	}

	c.mu.RLock()
	tierCopy := make(map[string]int64, len(c.tierRequests))
	for k, v := range c.tierRequests {
		tierCopy[k] = v
	}
	c.mu.RUnlock()

	return Snapshot{
		UptimeSeconds:     time.Since(c.startTime).Seconds(),
		TotalRequests:     c.totalRequests.Load(),
		SuccessRequests:   c.successRequests.Load(),
		FailedRequests:    c.failedRequests.Load(),
		BlockedInjections: c.blockedInjections.Load(),
		QueueEnqueues:     c.queueEnqueues.Load(),
		QueueTimeouts:     c.queueTimeouts.Load(),
		QueueFullErrors:   c.queueFullErrors.Load(),
		CLIExecutions:     execs,
		CLITimeouts:       c.cliTimeouts.Load(),
		CLIErrors:         c.cliErrors.Load(),
		CLIAvgMs:          avgMs,
		SessionsPruned:    c.sessionsPruned.Load(),
		UsageRejections:   c.usageRejections.Load(),
		RequestsByTier:    tierCopy,
	}
}
