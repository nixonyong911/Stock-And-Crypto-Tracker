package calc

import "math"

// DisplayMode constants
const (
	ModeRate                  = "rate"
	ModeYoYPct                = "yoy_pct"
	ModeTrillionsFromBillions = "trillions_from_billions"
	ModeTrillionsFromMillions = "trillions_from_millions"
)

// CalculateMediaValue computes the media-friendly display value
// based on the display mode and raw value
func CalculateMediaValue(displayMode string, rawValue float64, yearAgoValue *float64, divisor float64) *float64 {
	switch displayMode {
	case ModeRate:
		// Rate values are already in the correct format
		return &rawValue

	case ModeYoYPct:
		// Calculate Year-over-Year percentage change
		if yearAgoValue == nil || *yearAgoValue == 0 {
			return nil
		}
		yoyPct := ((rawValue - *yearAgoValue) / *yearAgoValue) * 100
		// Round to 1 decimal place (e.g., 2.7%)
		rounded := math.Round(yoyPct*10) / 10
		return &rounded

	case ModeTrillionsFromBillions:
		// Convert billions to trillions
		trillions := rawValue / 1000
		// Round to 2 decimal places
		rounded := math.Round(trillions*100) / 100
		return &rounded

	case ModeTrillionsFromMillions:
		// Convert millions to trillions
		trillions := rawValue / 1000000
		// Round to 2 decimal places
		rounded := math.Round(trillions*100) / 100
		return &rounded

	default:
		// Unknown mode, return raw value
		return &rawValue
	}
}

// NeedsYearAgoData returns true if the display mode requires YoY calculation
func NeedsYearAgoData(displayMode string) bool {
	return displayMode == ModeYoYPct
}
