# Cross-Ticker Indicator Architecture

## Status: Design Only (not yet implemented)

## Context

The backfill pipeline and indicator registry currently operate on a per-ticker basis. Each `IIndicatorCalculator` receives OHLCV data for a single ticker and returns indicator values for that ticker. Cross-ticker indicators (correlation, relative strength vs index, sector rotation) require data from multiple tickers simultaneously.

## Design Decisions

### Interface Extension

Single-ticker indicators use:
```csharp
public interface IIndicatorCalculator
{
    string Name { get; }
    int MinDataPoints { get; }
    string[] OutputColumns { get; }
    Dictionary<string, object?> Compute(List<OhlcvBar> bars);
}
```

Cross-ticker indicators need a separate interface:
```csharp
public interface IMultiTickerIndicatorCalculator
{
    string Name { get; }
    int MinDataPoints { get; }
    string[] OutputColumns { get; }
    string[] RequiredTickers { get; } // e.g., ["SPY"] for relative strength
    Dictionary<string, object?> Compute(
        string targetSymbol,
        Dictionary<string, List<OhlcvBar>> tickerBars);
}
```

### Pipeline Integration

The `BackfillPipelineExecutor` runs steps per-ticker. For cross-ticker indicators:

1. Single-ticker steps run per-ticker as usual
2. Cross-ticker steps run once after all single-ticker steps complete for a batch
3. The executor collects OHLCV data for all `RequiredTickers` before invoking cross-ticker calculators

### BackfillContext Extension

```csharp
public class BackfillContext
{
    // Existing (per-ticker)
    public int TickerId { get; set; }
    public string Symbol { get; set; }
    public string AssetType { get; set; }
    public int DaysToBackfill { get; set; }
    public Dictionary<string, object> StepData { get; set; } = new();

    // Cross-ticker extension
    public Dictionary<string, List<OhlcvBar>>? TickerGroupData { get; set; }
}
```

### Scheduler Integration

The 30-min scheduler currently iterates tickers sequentially. For cross-ticker indicators:
- Pre-fetch OHLCV data for all required reference tickers (e.g., SPY, QQQ) once per cycle
- Pass the reference data to cross-ticker calculators alongside each ticker's data

### Storage

Cross-ticker indicator values are stored in the same `analysis_indicators_stock_pro` / `analysis_indicators_crypto_pro` tables as regular indicators. They just have additional columns.

### Example Indicators

| Indicator | Required Tickers | Output Columns |
|-----------|-----------------|----------------|
| Relative Strength vs SPY | SPY | `rs_vs_spy` |
| Correlation (30-day) vs SPY | SPY | `corr_spy_30d` |
| Beta vs SPY | SPY | `beta_spy` |
| Sector Rotation Score | Sector ETF | `sector_rotation_score` |

## Dependencies

- Phase 2 (Indicator Registry) must be complete -- `IIndicatorCalculator` pattern established
- Phase 3 (Generic Asset Context) must be complete -- unified ticker access

## Implementation Steps (when ready)

1. Add `IMultiTickerIndicatorCalculator` interface
2. Add `CrossTickerBackfillStep` to pipeline (runs after single-ticker steps)
3. Add reference ticker pre-fetch to scheduler cycle
4. Implement first cross-ticker indicator (Relative Strength vs SPY) as proof of concept
5. Add tests: cross-ticker parity (backfill vs scheduled), reference data caching
