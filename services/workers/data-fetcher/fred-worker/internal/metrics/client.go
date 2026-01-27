package metrics

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client sends metrics to the central Metrics service
type Client struct {
	baseURL    string
	workerName string
	httpClient *http.Client
}

// MetricPayload represents the JSON payload for metric submission
type MetricPayload struct {
	Name       string            `json:"name"`
	Value      float64           `json:"value"`
	Labels     map[string]string `json:"labels,omitempty"`
	WorkerName string            `json:"worker_name"`
	Timestamp  int64             `json:"timestamp"`
}

// NewClient creates a new metrics client
func NewClient(baseURL, workerName string) *Client {
	return &Client{
		baseURL:    baseURL,
		workerName: workerName,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// SetGauge sets a gauge metric value
func (c *Client) SetGauge(ctx context.Context, name string, value float64, labels map[string]string) error {
	return c.sendMetric(ctx, "gauge", name, value, labels)
}

// IncrementCounter increments a counter metric
func (c *Client) IncrementCounter(ctx context.Context, name string, labels map[string]string) error {
	return c.sendMetric(ctx, "counter", name, 1, labels)
}

// RecordHistogram records a histogram observation
func (c *Client) RecordHistogram(ctx context.Context, name string, value float64, labels map[string]string) error {
	return c.sendMetric(ctx, "histogram", name, value, labels)
}

func (c *Client) sendMetric(ctx context.Context, metricType, name string, value float64, labels map[string]string) error {
	if labels == nil {
		labels = make(map[string]string)
	}
	labels["worker"] = c.workerName

	payload := MetricPayload{
		Name:       fmt.Sprintf("%s_%s", c.workerName, name),
		Value:      value,
		Labels:     labels,
		WorkerName: c.workerName,
		Timestamp:  time.Now().Unix(),
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal metric: %w", err)
	}

	url := fmt.Sprintf("%s/api/metrics/%s", c.baseURL, metricType)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		// Don't fail the worker if metrics service is unavailable
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		// Log but don't fail
		return nil
	}

	return nil
}
