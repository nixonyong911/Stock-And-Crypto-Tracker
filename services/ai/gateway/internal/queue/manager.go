package queue

import (
	"container/heap"
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/rs/zerolog"

	"github.com/stocktracker/gateway/internal/config"
)

// Manager manages the priority queue with CLI concurrency control
type Manager struct {
	config        *config.Config
	logger        zerolog.Logger
	mu            sync.Mutex
	pq            priorityQueue
	running       int // currently executing CLI processes
	maxConcurrent int
	cond          *sync.Cond
	stopped       bool
}

// NewManager creates a new queue manager
func NewManager(cfg *config.Config, logger zerolog.Logger) *Manager {
	m := &Manager{
		config:        cfg,
		logger:        logger,
		pq:            make(priorityQueue, 0),
		maxConcurrent: cfg.MaxConcurrent,
	}
	m.cond = sync.NewCond(&m.mu)
	heap.Init(&m.pq)
	return m
}

// Start begins the queue processor
func (m *Manager) Start(ctx context.Context) {
	go func() {
		<-ctx.Done()
		m.Stop()
	}()
	m.logger.Info().Int("max_concurrent", m.maxConcurrent).Msg("Queue manager started")
}

// Stop signals the queue to stop
func (m *Manager) Stop() {
	m.mu.Lock()
	m.stopped = true
	m.cond.Broadcast()
	m.mu.Unlock()
	m.logger.Info().Msg("Queue manager stopped")
}

// Enqueue adds a request to the priority queue and waits for a CLI slot
// Returns a release function to call when done
func (m *Manager) Enqueue(ctx context.Context, tier config.Tier) (func(), error) {
	tierCfg := m.config.GetTierConfig(tier)

	m.mu.Lock()

	// Check queue depth for this tier
	tierCount := 0
	for _, item := range m.pq {
		if item.Tier == tier {
			tierCount++
		}
	}
	if tierCount >= tierCfg.QueueDepth {
		m.mu.Unlock()
		return nil, fmt.Errorf("queue full for tier %s", tier)
	}

	// Add to priority queue
	item := &Item{
		Tier:      tier,
		Priority:  tierCfg.QueuePriority,
		Timestamp: time.Now(),
		Ready:     make(chan struct{}),
	}
	heap.Push(&m.pq, item)
	m.mu.Unlock()

	// Try to dispatch immediately
	m.tryDispatch()

	// Wait for our turn or timeout
	select {
	case <-item.Ready:
		// We got a slot!
		release := func() {
			m.mu.Lock()
			m.running--
			m.mu.Unlock()
			m.tryDispatch()
		}
		return release, nil
	case <-ctx.Done():
		// Context cancelled/timeout
		m.removeItem(item)
		return nil, ctx.Err()
	case <-time.After(60 * time.Second):
		// Queue wait timeout
		m.removeItem(item)
		return nil, fmt.Errorf("queue wait timeout")
	}
}

// tryDispatch checks if we can dispatch the next item
func (m *Manager) tryDispatch() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for m.running < m.maxConcurrent && m.pq.Len() > 0 {
		item := heap.Pop(&m.pq).(*Item)
		m.running++
		close(item.Ready) // Signal that this item can proceed
	}
}

// removeItem removes an item from the queue (for cancellation)
func (m *Manager) removeItem(item *Item) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, qi := range m.pq {
		if qi == item {
			heap.Remove(&m.pq, i)
			break
		}
	}
}

// Stats returns current queue statistics
type Stats struct {
	QueueDepth    int `json:"queue_depth"`
	Running       int `json:"running"`
	MaxConcurrent int `json:"max_concurrent"`
}

func (m *Manager) Stats() Stats {
	m.mu.Lock()
	defer m.mu.Unlock()
	return Stats{
		QueueDepth:    m.pq.Len(),
		Running:       m.running,
		MaxConcurrent: m.maxConcurrent,
	}
}

// priorityQueue implements heap.Interface
type priorityQueue []*Item

func (pq priorityQueue) Len() int { return len(pq) }

func (pq priorityQueue) Less(i, j int) bool {
	// Higher priority first
	if pq[i].Priority != pq[j].Priority {
		return pq[i].Priority > pq[j].Priority
	}
	// Same priority: FIFO (earlier timestamp first)
	return pq[i].Timestamp.Before(pq[j].Timestamp)
}

func (pq priorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}

func (pq *priorityQueue) Push(x interface{}) {
	item := x.(*Item)
	item.index = len(*pq)
	*pq = append(*pq, item)
}

func (pq *priorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[:n-1]
	return item
}
