# Verification Runbook

Manual investigation procedures for when automated scripts flag issues.

## Prerequisites

- SSH access to VM: `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
- Docker access on VM (all services run as containers)
- `psql` via: `docker exec -it postgres psql -U postgres -d stocktracker`

> **VM Postgres is the live source of truth** for all runtime verification,
> ad-hoc queries, and debugging. Supabase is a once-daily backup mirror —
> never query Supabase to answer "what is the system doing right now."

---

## Database Topology & Mirror Health

**Live database:** Self-hosted PostgreSQL 17 in the Docker `postgres`
container on the VM (`127.0.0.1:5432`). All runtime services connect here.

**Backup mirror:** Supabase cloud, refreshed once daily by VM-host cron:

| Schedule | Script | Action |
|----------|--------|--------|
| `0 3 * * *` | `/opt/stocktracker/scripts/backup-postgres.sh` | `pg_dump` full + public-schema dumps |
| `0 4 * * *` | `/opt/stocktracker/scripts/mirror-to-supabase.sh` | `pg_restore` public dump → Supabase |

Some lag between VM and Supabase is expected (up to one daily mirror cycle).
The mirror script verifies row counts for key tables and sends Telegram
alerts on success (🟢), mismatch (🟡), or failure (🔴).

**Mirror health checks:**

```bash
# Most recent backup dump (should be from the latest 03:00 cycle)
docker exec postgres ls -1t /backups/stocktracker_public_*.custom | head -1

# Most recent mirror log (should end with "Mirror complete" from today)
sudo tail -20 /var/log/stocktracker/mirror.log

# Cron entries (both must be present)
crontab -l | grep -E 'backup-postgres|mirror-to-supabase'
```

---

## 1. Price Fetching (30-Min Interval)

### Check recent prices for a stock

```sql
SELECT sp.id, st.symbol, sp.price_time, sp.open_price, sp.high_price,
       sp.low_price, sp.close_price, sp.volume, sp.created_at
FROM stock_prices sp
JOIN stock_tickers st ON st.id = sp.stock_ticker_id
WHERE st.symbol = 'AAPL'
ORDER BY sp.price_time DESC
LIMIT 20;
```

### Verify 30-min intervals

```sql
WITH ordered AS (
  SELECT sp.price_time,
         LAG(sp.price_time) OVER (ORDER BY sp.price_time DESC) AS prev_time
  FROM stock_prices sp
  JOIN stock_tickers st ON st.id = sp.stock_ticker_id
  WHERE st.symbol = 'AAPL'
  ORDER BY sp.price_time DESC
  LIMIT 50
)
SELECT price_time, prev_time,
       EXTRACT(EPOCH FROM (prev_time - price_time)) / 60 AS gap_minutes
FROM ordered
WHERE prev_time IS NOT NULL
ORDER BY price_time DESC;
```

Expect ~30 min gaps during market hours. Larger gaps overnight/weekends are normal.

### Check indicator freshness

```sql
SELECT st.symbol,
       MAX(sp.price_time)    AS latest_price_time,
       MAX(si.indicator_time) AS latest_indicator_time,
       MAX(sp.price_time) - MAX(si.indicator_time) AS indicator_lag
FROM stock_tickers st
JOIN stock_prices sp ON sp.stock_ticker_id = st.id
LEFT JOIN analysis_indicators_stock_free si ON si.stock_ticker_id = st.id
WHERE st.symbol = 'AAPL'
GROUP BY st.symbol;
```

Indicator lag should be ≤ 35 minutes (price fetch + 5-min offset for indicator calculation).

### Check worker schedule status

```sql
SELECT wfs.name, wfs.is_enabled, wfs.interval_minutes, wfs.offset_minutes,
       wfs.last_run_at, wfs.last_run_status, wfs.last_run_message,
       NOW() - wfs.last_run_at AS time_since_last_run
FROM worker_fetch_schedules wfs
ORDER BY wfs.last_run_at DESC;
```

### Troubleshooting

- **Prices are stale**: SSH to VM, check data-fetcher logs:
  ```bash
  docker logs data-fetcher-2.0 --tail 100 --since 1h
  ```
- **Indicators missing**: Verify candlestick analysis ran first (it has `offset_minutes = 5` to wait for prices):
  ```sql
  SELECT name, offset_minutes, last_run_at, last_run_status
  FROM worker_fetch_schedules
  WHERE name ILIKE '%candlestick%' OR name ILIKE '%indicator%'
  ORDER BY name;
  ```
- **Worker not running**: Check container health:
  ```bash
  docker ps --filter name=data-fetcher
  curl -sf https://nxserver.malaysiawest.cloudapp.azure.com/api/data-fetcher-2.0/health/live
  ```

---

## 2. Backfill Verification

### Check if ticker exists and has data

```sql
SELECT
  st.id, st.symbol, st.name, st.is_active, st.created_at,
  (SELECT COUNT(*) FROM stock_prices sp WHERE sp.stock_ticker_id = st.id) AS price_count,
  (SELECT COUNT(*) FROM analysis_stock_candlestick_pattern cp WHERE cp.stock_ticker_id = st.id) AS pattern_count,
  (SELECT COUNT(*) FROM analysis_indicators_stock_free si WHERE si.stock_ticker_id = st.id) AS indicator_count,
  (SELECT COUNT(*) FROM analysis_ticker_price_targets pt WHERE pt.ticker_symbol = st.symbol) AS price_target_count
FROM stock_tickers st
WHERE st.symbol = 'AAPL';
```

For crypto:

```sql
SELECT
  ct.id, ct.symbol, ct.name, ct.is_active, ct.created_at,
  (SELECT COUNT(*) FROM crypto_prices cp WHERE cp.crypto_ticker_id = ct.id) AS price_count,
  (SELECT COUNT(*) FROM analysis_crypto_candlestick_pattern ap WHERE ap.crypto_ticker_id = ct.id) AS pattern_count,
  (SELECT COUNT(*) FROM analysis_indicators_crypto_free ci WHERE ci.crypto_ticker_id = ct.id) AS indicator_count,
  (SELECT COUNT(*) FROM analysis_ticker_price_targets pt WHERE pt.ticker_symbol = ct.symbol) AS price_target_count
FROM crypto_tickers ct
WHERE ct.symbol = 'BTC';
```

### Check backfill queue

SSH to VM and inspect RabbitMQ:

```bash
docker exec rabbitmq rabbitmqctl list_queues name messages consumers
```

Look for queues with accumulated messages and zero consumers (indicates stuck consumer).

### Check webhook configuration

Supabase webhooks trigger backfill when new tickers are inserted. Verify via Supabase dashboard:

1. Go to **Database > Webhooks** in Supabase dashboard
2. Confirm webhooks exist for `stock_tickers` and `crypto_tickers` on `INSERT`
3. Verify the webhook URL points to the data-fetcher backfill endpoint

Or check via SQL:

```sql
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgrelid IN ('stock_tickers'::regclass, 'crypto_tickers'::regclass);
```

---

## 3. Free Trial One-Time Enforcement

### Check for duplicate phone_hash claims

```sql
SELECT phone_hash, COUNT(*) AS claim_count
FROM trial_claims
GROUP BY phone_hash
HAVING COUNT(*) > 1;
```

### Check for duplicate user_id claims

```sql
SELECT user_id, COUNT(*) AS claim_count
FROM trial_claims
GROUP BY user_id
HAVING COUNT(*) > 1;
```

Both queries should return **zero rows**. Any results indicate a constraint bypass.

### Check specific user's trial status

```sql
SELECT
  u.id AS user_id, u.clerk_user_id, u.phone_hash,
  tc.claimed_at, tc.trial_end_at, tc.source, tc.stripe_subscription_id AS trial_stripe_sub,
  us.stripe_subscription_id, us.status AS sub_status, us.plan_type,
  us.trial_start, us.trial_end, us.current_period_end
FROM users u
LEFT JOIN trial_claims tc ON tc.user_id = u.id
LEFT JOIN users_subscriptions us ON us.user_id = u.id
WHERE u.clerk_user_id = 'user_REPLACE_ME';
```

### Verify DB constraint exists

```sql
SELECT conname, conrelid::regclass, contype
FROM pg_constraint
WHERE conname LIKE '%trial%';
```

Expected: `uq_trial_claims_phone_hash` (unique constraint on `phone_hash`).

### Test eligibility API

```bash
curl -s https://www.stocktracker.com/api/trial/eligibility \
  -H "Authorization: Bearer <CLERK_SESSION_TOKEN>" | jq .
```

Response should include `eligible: true/false` and `reason` if ineligible.

---

## 4. SmartDigest Verification

### Recent recommendations sent

```sql
SELECT recommendation_type, artifact_kind, delivery_status,
       COUNT(*) AS total,
       MIN(sent_at) AS earliest, MAX(sent_at) AS latest
FROM user_recommendation_log
WHERE sent_at > NOW() - INTERVAL '24 hours'
GROUP BY recommendation_type, artifact_kind, delivery_status
ORDER BY total DESC;
```

Post-15.3 the `priority` column is always NULL on new rows, so it was
dropped from this audit in favour of `artifact_kind`, which distinguishes
flag-on rows (`smart_digest` / `daily_overview`) from flag-off rows
(`NULL`).

### Artifact-linked delivery rows (Step 15)

```sql
SELECT u.sent_at, u.delivery_status, u.artifact_kind, u.artifact_id,
       u.channel_type, u.delivery_failure_reason, u.ticker_symbol,
       CASE
         WHEN u.artifact_kind = 'smart_digest' THEN
           (SELECT a.symbol FROM analysis_smart_digest a WHERE a.id = u.artifact_id)
         WHEN u.artifact_kind = 'daily_overview' THEN
           (SELECT o.session_type FROM analysis_daily_overview o WHERE o.id = u.artifact_id)
       END AS artifact_detail
FROM user_recommendation_log u
WHERE u.sent_at > NOW() - INTERVAL '24 hours'
  AND u.artifact_kind IS NOT NULL
ORDER BY u.sent_at DESC
LIMIT 20;
```

### Delivery failure audit

```sql
SELECT delivery_failure_reason, COUNT(*) AS total,
       MIN(sent_at) AS earliest, MAX(sent_at) AS latest
FROM user_recommendation_log
WHERE delivery_status = 'failed'
  AND sent_at > NOW() - INTERVAL '7 days'
GROUP BY delivery_failure_reason
ORDER BY total DESC;
```

**Step 15.2 vocabulary** (the only values that should appear on rows
written by the post-15.2 code):

| value                  | source                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| `telegram_unavailable` | Telegram extension missing or `sendPhoto` not registered              |
| `render_failed`        | Smart Digest card render returned no buffer (split from old `render_or_send_error`) |
| `send_failed`          | Channel resolved with `{ ok: false }`                                 |
| `send_error`           | Channel call threw                                                    |

The pre-15.2 value `render_or_send_error` should not appear on rows
written after the Step 15.2 deploy. The `OVERVIEW_ALLOWED_USERS` env was
also removed in 15.2 — daily overview now respects only the
`daily_overview_enabled` preference column.

**Step 15.3 denorm normalization:** As of Step 15.3, both Smart Digest
and Daily Overview write NULL for `priority`, `headline`,
`message_body`, and `timeframe_alignment` on every new ledger row. The
artifact tables (`analysis_smart_digest`, `analysis_daily_overview`) are
the source of truth for content. The `*_CANONICAL_ARTIFACT_ENABLED` env
flags remain available as an emergency rollback mechanism.

**Step 15.4 operator alignment:** The audit queries in this section
have been aligned with the post-15.3 ledger — `priority` was removed
from the recommendations breakdown (always NULL), the cap query is now
scoped to Smart Digest + sent-only deliveries, and the rolling
denorm-clean audit below is the operator-facing counterpart of the
`No recent row has non-NULL legacy denorms (last 48 h)` invariant that
`verify-digest.ts` now enforces on every run.

### Rolling denorm-clean audit (Step 15.4)

There are two related questions an operator may ask. Use the right
query for the right question.

#### Strict regression invariant (last 48 h) — must be zero

```sql
SELECT COUNT(*) AS recent_denorm_leaks_48h
FROM user_recommendation_log
WHERE sent_at > NOW() - INTERVAL '48 hours'
  AND (priority IS NOT NULL OR headline IS NOT NULL
       OR message_body IS NOT NULL OR timeframe_alignment IS NOT NULL);
```

Must return **zero** on any run more than 48 hours after the Step 15.3
runtime rollout (`2026-05-19 06:35 UTC`; confirmed against container
start time and `MAX(sent_at)` over denorm-bearing rows). This is the
operator-facing counterpart of the
`No recent row has non-NULL legacy denorms (last 48 h)` check
`verify-digest.ts` enforces on every run. A non-zero result here is a
real regression — investigate immediately.

#### Historical aging-tail view (last 7 d) — informational

```sql
SELECT
  date_trunc('day', sent_at) AS day,
  COUNT(*)                   AS rows_with_denorms,
  MIN(sent_at)               AS earliest,
  MAX(sent_at)               AS latest
FROM user_recommendation_log
WHERE sent_at > NOW() - INTERVAL '7 days'
  AND (priority IS NOT NULL OR headline IS NOT NULL
       OR message_body IS NOT NULL OR timeframe_alignment IS NOT NULL)
GROUP BY 1
ORDER BY 1;
```

Pre-15.3 rows naturally remain inside this rolling window for up to 7
days after the Step 15.3 runtime rollout (`2026-05-19 06:35 UTC`).
Non-zero results are expected and acceptable while
`MAX(sent_at) < 2026-05-19 06:35 UTC` and the day-over-day count is
decreasing. The total reaches zero around **2026-05-26** and stays
there.

A row with `sent_at >= 2026-05-19 06:35 UTC` in this output is the
same regression signal as a non-zero strict invariant above.

### Check daily cap enforcement

No user should receive more than 6 Smart Digest recommendations per day.
The cap applies only to Smart Digest deliveries that actually went out —
daily-overview rows and failed deliveries do not count. This matches the
scoping used by `verify-digest.ts`:

```sql
SELECT clerk_user_id, (sent_at AT TIME ZONE 'UTC')::date AS day_utc,
       COUNT(*) AS daily_count
FROM user_recommendation_log
WHERE sent_at > NOW() - INTERVAL '7 days'
  AND recommendation_type != 'daily_overview'
  AND delivery_status = 'sent'
GROUP BY clerk_user_id, (sent_at AT TIME ZONE 'UTC')::date
HAVING COUNT(*) > 6
ORDER BY daily_count DESC;
```

Should return **zero rows**.

**Known exception — `force-send-digest` bypass.** The
`POST /internal/force-send-digest` endpoint deliberately bypasses the
Redis cap check (`applyThrottle: false`) and does not increment the cap
counter (`recordDigestSent` is never called). This is the intended
manual verification path for operator testing. Any cap violation
surfaced by this query should be cross-checked against force-send usage
before treating it as a runtime cap bug. Hallmarks of a force-send
violation: tight time clustering (multiple sends within minutes),
repeated identical ticker/signal type, and — after Step 15.1 — mixed
artifact-linked and legacy format rows on the same day.

### Check Redis dedup keys (via SSH)

```bash
docker exec gateway-2.0 node -e "
  const Redis = require('ioredis');
  const r = new Redis(process.env.REDIS_URL);
  r.keys('digest:signal:*').then(k => { console.log('Signal keys:', k.length); k.slice(0,10).forEach(x => console.log(' ', x)); });
  r.keys('digest:count:*').then(k => { console.log('Count keys:', k.length); k.slice(0,10).forEach(x => console.log(' ', x)); r.quit(); });
"
```

Or if Redis is accessible directly:

```bash
docker exec redis redis-cli KEYS "digest:signal:*"
docker exec redis redis-cli KEYS "digest:count:*"
```

### Check gateway health

```bash
curl -s http://localhost:8080/internal/check-recommendations \
  -H "X-Service-Key: $GATEWAY_SERVICE_KEY" | jq .
```

Run this from inside the VM (the internal endpoint is not exposed externally).

---

## 5. Affiliate System

### Active affiliate members

```sql
SELECT am.id, u.clerk_user_id, am.affiliate_code, am.status, am.created_at,
       (SELECT COUNT(*) FROM affiliate_referrals ar WHERE ar.affiliate_member_id = am.id) AS referral_count
FROM affiliate_members am
JOIN users u ON u.id = am.user_id
WHERE am.status = 'active'
ORDER BY am.created_at DESC;
```

### Referral lifecycle

```sql
SELECT
  am.affiliate_code,
  u_promoter.clerk_user_id AS promoter,
  u_referred.clerk_user_id AS referred_user,
  ar.status AS referral_status,
  ar.created_at AS referred_at,
  ar.updated_at AS last_status_change
FROM affiliate_referrals ar
JOIN affiliate_members am ON am.id = ar.affiliate_member_id
JOIN users u_promoter ON u_promoter.id = am.user_id
JOIN users u_referred ON u_referred.id = ar.referred_user_id
ORDER BY ar.created_at DESC
LIMIT 50;
```

### Check for self-referrals

```sql
SELECT ar.id, am.affiliate_code, am.user_id AS promoter_user_id,
       ar.referred_user_id
FROM affiliate_referrals ar
JOIN affiliate_members am ON am.id = ar.affiliate_member_id
WHERE ar.referred_user_id = am.user_id;
```

Should return **zero rows**. Any results mean a user referred themselves.

### Verify Stripe coupon

Check via Stripe dashboard or CLI:

```bash
# If stripe CLI is installed:
stripe coupons retrieve AFFILIATE_5_OFF

# Or via API:
curl -s https://api.stripe.com/v1/coupons/AFFILIATE_5_OFF \
  -u "$STRIPE_SECRET_KEY:" | jq '{id, valid, amount_off, currency, percent_off, duration}'
```

Verify the coupon is `valid: true` and has the expected discount amount.

---

## Artifact ops (Smart Digest + Daily Overview)

The gateway exposes `/internal/artifacts/*` endpoints for inspecting and managing canonical artifact rows in `analysis_smart_digest` and `analysis_daily_overview`. All require `x-service-key` header matching `INTERNAL_SERVICE_KEY`.

### List recent artifacts (triage view)

```bash
# Summary projection (omits payload/truth_refs) — fast triage
curl -s -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  "https://<gateway>/internal/artifacts/recent?kind=smart_digest&summary=true&limit=10"

# Filter by status
curl -s -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  "https://<gateway>/internal/artifacts/recent?kind=smart_digest&status=failed&limit=20"

# Daily overviews by session type
curl -s -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  "https://<gateway>/internal/artifacts/recent?kind=daily_overview&sessionType=pre_market&summary=true"
```

### List inflight (stuck-row detection)

```bash
# Rows stuck in pending/generating for >10 minutes
curl -s -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  "https://<gateway>/internal/artifacts/inflight?kind=smart_digest&olderThanSec=600"
```

Treat inflight rows older than 10 minutes as stuck. Root-cause before acting — there is no auto-sweep. If a stuck row is blocking slot acquisition (via the partial unique index), it must be manually resolved at the DB level until Step 16 adds a sweeper.

### Fetch artifact by id

```bash
curl -s -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  "https://<gateway>/internal/artifacts/smart_digest/42"

curl -s -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  "https://<gateway>/internal/artifacts/daily_overview/15"
```

### Explain current-artifact selection

```bash
# "Which artifact would be chosen for this slot + fingerprint, and why?"
curl -s -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  "https://<gateway>/internal/artifacts/explain-current?kind=smart_digest&symbol=AAPL&truthHash=abc123&contextHash=def456&generatorVersion=1"

curl -s -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  "https://<gateway>/internal/artifacts/explain-current?kind=daily_overview&overviewDate=2026-05-15&snapshotHash=snap123&contextHash=ctx456&generatorVersion=1&modelName=claude-4.6-sonnet-medium"
```

Response includes:
- `current` — the chosen row (or null)
- `candidates` — up to 5 rows matching the full fingerprint
- `slotPeers` — up to 3 same-slot `ready` rows with different fingerprints (for "why didn't reuse?" diagnostics)

### Invalidate a ready artifact

```bash
curl -s -X POST -H "x-service-key: $INTERNAL_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"reason": "corrupt payload detected in manual review"}' \
  "https://<gateway>/internal/artifacts/smart_digest/42/invalidate"
```

- Only `ready` rows can be invalidated (CAS guard). Returns 409 if the row is not in `ready` status.
- `reason` is required (1–500 chars) and stored in `error_message`. `invalidated_at` is set to NOW.
- The invalidated row is immediately excluded from future reuse queries.
- The next generation trigger for that slot will produce a fresh artifact.
