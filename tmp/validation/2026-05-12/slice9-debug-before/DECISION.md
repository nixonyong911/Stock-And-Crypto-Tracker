# Slice 9 — Stage B fixture-replay DECISION

## Header

- **Date:** 2026-05-12T06:20 UTC
- **Evidence source:** 25 stories from `analysis_filtered_news` (last 6h), 50 active/fading rows
- **Environment:** `MEMORY_CURATOR_RESANITIZE_ON_UPDATE=false` (dormant; this is a read-only simulation)
- **Replay script:** `services/ai/gateway-2.0/scripts/slice9-replay.ts`

## Summary

| Metric | Value |
|---|---|
| Total rows simulated | 50 |
| Rows where sanitizer would apply | 2 (4%) |
| Rows where identity guard fires (no change) | 48 (96%) |
| Rows where erasure guard fires | 0 |
| Rows where primary_ticker would be nulled | 0 |

## Affected rows detail

### Row 1: d72c6b36 (US-Iran War Escalation & Strait of Hormuz Blockade Threat)

- **Before:** `[CL=F, BNO, XLE, USO, SPY, QQQ, DIA, TLT, GLD, LMT, RTX, XOM, CVX, COP]` (14 tickers)
- **After kept:** `[CL=F, BNO, XLE, USO, TLT, GLD, LMT, RTX, XOM, CVX, COP]` (11 tickers)
- **Moved to inferred:** `[SPY, QQQ, DIA]`
- **Primary:** null → stays null (no coherence issue)
- **Assessment:** CORRECT. SPY/QQQ/DIA are broad index ETFs with no specific evidence from the batch. The theme is about energy/defense.

### Row 2: 4d870c73 (Germany GDP Forecast Downgrade — Iran Energy Shock)

- **Before:** `[DAX, OIL, NATGAS, SPX500]` (4 tickers)
- **After kept:** `[DAX, OIL, SPX500]` (3 tickers)
- **Moved to inferred:** `[NATGAS]`
- **Primary:** null → stays null (no coherence issue)
- **Assessment:** CORRECT. NATGAS is a macro proxy without evidence from the current batch. DAX, OIL, and SPX500 have story overlap evidence.

## Safety assessment

- No erasure guards triggered (0/50)
- No rows would have their primary_ticker nulled (0/50)
- No rows would have their kept list emptied unexpectedly (0/50)
- All 48 identity-guard rows are correctly left unchanged (their existing tickers are either already narrow or have full evidence support from the batch)

## Verdict

**APPROVED for Stage C.**

The replay confirms:
1. The sanitizer produces correct, conservative changes (only 2 of 50 rows affected)
2. Both affected rows have clear, defensible reasons for the ticker-to-inferred moves
3. No safety guards fire unexpectedly
4. The high identity rate (96%) confirms that the sanitizer is appropriately conservative — it only strips what it can prove is unevidenced

Note: The low application rate (4%) is because most existing rows are already narrow post-Slice-8 new INSERTs or because the batch stories happen to overlap with the existing broad tickers. When the flag is live on actual curator runs, the contributing stories will be the specific stories grouped into that update — potentially different from the "all recent stories" view used in this replay. The real-world application rate may be higher when contaminated rows match their specific batch stories.

## Sign-off

Proceed to Stage C: flip `MEMORY_CURATOR_RESANITIZE_ON_UPDATE=true` via Infisical.
