# Slice 9 — UPDATE-path replay summary

Date: 2026-05-12T06:20:05.848Z
Evidence: 25 stories from analysis_filtered_news (last 6h)

## Counts

Total active/fading rows: 50
Rows where sanitizer would apply: 2
Rows where primary_ticker would be nulled: 0

## Safety guards triggered

| Guard | Count |
|---|---|
| none (applied) | 2 |
| identity (no change) | 48 |
| empty_existing | 0 |
| erasure | 0 |

## Cardinality distribution

Mean existing cardinality: 3.88
Mean kept_after (applied rows only): 7.00
