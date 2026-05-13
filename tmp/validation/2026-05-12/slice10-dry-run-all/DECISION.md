# Slice 10 — Stage B dry-run DECISION

## Header

- **Date:** 2026-05-12T08:00 UTC
- **Run ID:** 7217ae92-2b74-43e6-a38a-158e97b900ed
- **Mode:** DRY-RUN (read-only, no DB writes)
- **Gateway image:** stocktracker-gateway-2.0:v1.2 (post-Slice-10 code)

## Summary

| Metric | Value |
|---|---|
| Total in-scope rows | 50 |
| Rows to apply | 6 (12.0%) |
| Rows skipped (identity) | 44 (88.0%) |
| Rows skipped (erasure guard) | 0 |
| Rows skipped (error) | 0 |
| Rows where primary_ticker nulled | 0 |
| Rows where kept=[] | 0 |

## Per-row review (6 applied rows)

### 1. GameStop $56B eBay Acquisition (theme_id: 1690bd7f)
- **Before:** `[GME, EBAY, SPX500]` → **After:** `[GME, EBAY]`, inferred `[SPX500]`
- **Mode:** zero_evidence_mixed (stories aged out)
- **Assessment:** CORRECT. SPX500 is broad boilerplate; GME and EBAY are the actual subjects.

### 2. US-EU Auto Tariff Escalation (theme_id: d08faa3c)
- **Before:** `[DAX, STOXX50, GM, F, TSLA, SPX500, GOLD]` → **After:** `[DAX, STOXX50, GM, F, TSLA]`, inferred `[SPX500, GOLD]`
- **Mode:** zero_evidence_mixed
- **Assessment:** CORRECT. SPX500 and GOLD are broad; the 5 non-broad tickers are genuinely about this theme.

### 3. Healthcare Sector Defensive Outperformance (theme_id: 1975350f)
- **Before:** `[AZN, JNJ, ROIV, WELL, GH, BLLN, ARGX, RDNT, SPX500]` → **After:** 8 kept, inferred `[SPX500]`
- **Mode:** zero_evidence_mixed
- **Assessment:** CORRECT. SPX500 is boilerplate; the 8 healthcare tickers are the actual subjects.

### 4. State-Sponsored Crypto Theft (theme_id: c6021149)
- **Before:** `[BTC, ETH, COIN, PANW, CRWD]` → **After:** `[COIN, PANW, CRWD]`, inferred `[BTC, ETH]`
- **Mode:** zero_evidence_mixed
- **Assessment:** CORRECT. BTC and ETH are v2 broad macro proxies. The theme is about cybersecurity firms (PANW, CRWD) and crypto exchange (COIN) — not about BTC/ETH price action.

### 5. Germany GDP Forecast Downgrade (theme_id: 4d870c73)
- **Before:** `[DAX, OIL, NATGAS, SPX500]` → **After:** `[DAX]`, inferred `[OIL, NATGAS, SPX500]`
- **Mode:** zero_evidence_mixed
- **Assessment:** CORRECT. DAX is the specific subject (German equity index). OIL, NATGAS, SPX500 are all v2 broad — no story evidence available.

### 6. US-Iran War Escalation (theme_id: d72c6b36)
- **Before:** `[CL=F, BNO, XLE, USO, SPY, QQQ, DIA, TLT, GLD, LMT, RTX, XOM, CVX, COP]` (14 tickers)
- **After:** `[CL=F, BNO, XLE, USO, QQQ, TLT, GLD, LMT, RTX, XOM, CVX, COP]` (12 kept), inferred `[SPY, DIA]`
- **Mode:** evidenced (140 stories)
- **Assessment:** CORRECT. SPY and DIA are broad index ETFs. 140 stories overlap this theme but none carry SPY/DIA as their own affected_tickers. QQQ remains because it IS evidenced by overlapping stories.

## Safety checks

- [x] No assertion violations (kept/inferred all subsets of original)
- [x] No erasure guards triggered (0/50)
- [x] No kept=[] rows (0/50)
- [x] No primaries nulled (0/50)
- [x] No row's cardinality increased (impossible by design — sanitizer only removes or reclassifies)
- [x] 11 validation symbols spot-check:
  - AAPL chosen row (theme 4ad47421): identity, untouched — `[AAPL, MSFT, GOOGL, META, NSDQ100]` stays as-is because NSDQ100 is evidenced by overlapping stories
  - NVDA chosen row (theme 1b6cbff7): identity, untouched — `[NVDA, AMD, SOXX, NSDQ100, RTY, SPX500]` stays because all broad tickers are evidenced
  - BTC/USD, ETH/USD, GOLD, GOOGL, SPX500 rows: all identity
- [x] Erasure rate: 0% (well under 10% threshold)

## Verdict

**APPROVED for Stage C.**

The dry-run confirms:
1. Only 6 of 50 rows would be touched — extremely conservative
2. All 6 changes remove only unevidenced broad boilerplate tickers
3. No anchor tickers for any validation symbol are lost
4. No primary_ticker coherence issues introduced
5. Identity guard correctly passes through all already-clean rows
