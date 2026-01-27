package fred

import "time"

// Observation represents a single data point from FRED
type Observation struct {
	Date  time.Time
	Value float64
}

// APIResponse represents the FRED API response structure
type APIResponse struct {
	RealtimeStart    string              `json:"realtime_start"`
	RealtimeEnd      string              `json:"realtime_end"`
	ObservationStart string              `json:"observation_start"`
	ObservationEnd   string              `json:"observation_end"`
	Units            string              `json:"units"`
	OutputType       int                 `json:"output_type"`
	FileType         string              `json:"file_type"`
	OrderBy          string              `json:"order_by"`
	SortOrder        string              `json:"sort_order"`
	Count            int                 `json:"count"`
	Offset           int                 `json:"offset"`
	Limit            int                 `json:"limit"`
	Observations     []ObservationRecord `json:"observations"`
}

// ObservationRecord represents a single observation in the API response
type ObservationRecord struct {
	RealtimeStart string `json:"realtime_start"`
	RealtimeEnd   string `json:"realtime_end"`
	Date          string `json:"date"`
	Value         string `json:"value"`
}
