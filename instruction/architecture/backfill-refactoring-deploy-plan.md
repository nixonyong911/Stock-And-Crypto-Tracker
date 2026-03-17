# Backfill Refactoring — Deployment Plan

## 1. Pre-Deploy Checklist

- [ ] All unit tests pass: `dotnet test` in `services/workers/data-fetcher-2.0/`
- [ ] Golden reference / snapshot tests pass (indicator output matches baseline)
- [ ] `AnalysisBackfillRequest` schema is **backward-compatible** — no breaking changes, new fields are optional with defaults
- [ ] Queue drain completed (see §2)
- [ ] PR reviewed and merged to `main`

## 2. Queue Drain

RabbitMQ queues must be empty (or message loss accepted) before deploying, because the new worker may deserialize in-flight messages differently.

### 2.1 SSH into VM

```bash
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
```

### 2.2 Check queue depths

```bash
docker exec rabbitmq rabbitmqctl list_queues
```

### 2.3 Wait or accept loss

- **Preferred:** wait until all queues show `0` messages.
- **Acceptable:** if the system tolerates day-level downtime, accept message loss and proceed. Backfill jobs can be re-triggered after deploy.

> **Note:** Message format must remain backward-compatible. The `AnalysisBackfillRequest` schema must NOT change in a breaking way. Any new fields must be optional with sensible defaults so that messages enqueued by the old producer can still be consumed by the new worker.

## 3. Deploy

### 3.1 Stage and push

```bash
git status
git add <specific files>   # Never use `git add .`
git commit -m "refactor: backfill service extraction"
git push origin main
```

### 3.2 Monitor GitHub Actions

```bash
gh run watch
```

If the build fails:

```bash
gh run view <run-id> --log
```

Fix issues, then repeat from §3.1.

### 3.3 Verify VM deployment

```bash
ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1
docker ps          # compare image version — must be incremented
docker images      # confirm new image pulled
```

- Image version incremented → proceed to §4.
- Version unchanged or container down → investigate, fix, return to §3.1.

## 4. Post-Deploy Verification

### 4.1 Check worker logs

```bash
docker logs data-fetcher-worker --tail 100
```

### 4.2 Confirm all 17 BackgroundService workers started

Look for startup log lines for each worker:

| # | Worker |
|---|--------|
| 1 | AdvancedIndicatorWorker |
| 2 | AlpacaBackfillQueueConsumer |
| 3 | AlpacaCryptoBackfillQueueConsumer |
| 4 | AlpacaCryptoFetchWorker |
| 5 | AlpacaStockFetchWorker |
| 6 | AnalysisBackfillQueueConsumer |
| 7 | CandlestickAnalysisWorker |
| 8 | EarningsSyncWorker |
| 9 | EtoroFetchWorker |
| 10 | FinnhubFetchWorker |
| 11 | FredCalendarSyncWorker |
| 12 | FredFetchWorker |
| 13 | LocalIndicatorWorker |
| 14 | MarketAuxNewsWorker |
| 15 | MassiveFetchWorker |
| 16 | MassiveQueueConsumer |
| 17 | PriceTargetWorker |

### 4.3 Check queue consumers are connected

```bash
docker exec rabbitmq rabbitmqctl list_consumers
```

Verify consumers exist for all expected queues.

## 5. Rollback Plan

If critical issues are found after deploy:

1. **Revert the commit:**
   ```bash
   git revert HEAD
   git push origin main
   ```
2. **Wait for CI/CD** to rebuild and redeploy (`gh run watch`).
3. **SSH into VM** and confirm the previous image version is running:
   ```bash
   docker ps
   docker logs data-fetcher-worker --tail 50
   ```
4. **Re-drain queues** if rollback introduced message format issues (§2).

## 6. Backward Compatibility Contract

| Rule | Detail |
|------|--------|
| `AnalysisBackfillRequest` schema must NOT break | Existing messages in the queue must deserialize correctly with the new code |
| New fields must be optional | Use nullable types or provide default values |
| Removed fields must be ignored | Use `[JsonIgnore]` or tolerant deserialization settings |
| Test coverage | Golden reference tests must validate serialization round-trips |
