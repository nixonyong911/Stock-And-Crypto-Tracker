# Memory curator: diagnostics log, VM verification, manual run, and follow-up improvements

This document completes the diagnostic and follow-up items from the memory curator failure analysis. It does **not** replace the original root-cause plan; it records what was verified and what to do next.

---

## 1. Read error snippet (Telegram + gateway logs)

### Telegram: `Memory Curator: FAILED`

Formatted by `formatCuratorNotification` in `services/ai/gateway-2.0/src/core/analysis/memory-curator.ts`:

- Line 1: `Memory Curator: FAILED` (HTML bold in payload).
- Line 2: **Full error message**, HTML-escaped, truncated to `CURATOR_TELEGRAM_ERROR_MAX_CHARS` (default **2000**, clamped 200–3500). This is the primary diagnostic string (not limited to 200 characters when defaults are used).
- Line 3: `Time: <ISO timestamp>`.

Example bodies (illustrative):

- Timeout: `Curator LLM call timed out | stderr: …`
- All batches rejected: `All 3 curator batches failed. Details: batch[0]: … | batch[1]: …`
- Spawn/auth: `spawn … ENOENT` or `cursor-agent exited with code 1 | stderr: …`

### Gateway logs

| Message | When | Useful fields |
|--------|------|----------------|
| `Curator batch failed` | One batch throws inside `curateMarketMemory` | `err`, `batchIndex`, `curatorRunId` |
| `Memory curation failed` | Outer `catch` of `curateMarketMemory` | `err`, `memoryCurationErrorMessage`, `stack` |
| `Memory curator failed — news processing result unaffected` | Curator fails after news in `news-processor.ts` | Same as above |
| `Error running memory curator` | `POST /internal/curate-memory` handler | `err`, `memoryCurationErrorMessage`, `stack` |

**Quick grep on a host with log access:**

```bash
docker logs gateway-2.0 2>&1 | grep -E 'Memory curation failed|Curator batch failed|memoryCurationErrorMessage|All [0-9]+ curator batches failed'
```

---

## 2. VM / container verification (executed 2026-04-15)

Commands were run over SSH against the production VM, then `docker exec gateway-2.0 …` (key copied to `/tmp` in the dev environment because the workspace could not `chmod` the read-only `.ssh` key).

| Check | Result |
|--------|--------|
| `cursor-agent` on `PATH` | `/usr/local/bin/cursor-agent` |
| `cursor-agent --version` | `2026.03.30-a5d3e17` |
| `CURATOR_MODEL` in container | `claude-4.6-sonnet-medium-thinking` |
| `CURSOR_API_KEY` | **Present** in container env (do not log or paste the value) |
| `CURATOR_SEQUENTIAL_BATCHES` | Not set in container env; gateway defaults to **sequential on** via `loadConfig` |
| Data under `/home/azureuser/.local/share/cursor-agent` | `versions` directory and related files visible (CLI operational) |
| OAuth/config tree `/root/.config/cursor` | Present with `auth.json` (writable layer) |

**Mount note:** On this check, `mount` reported those paths on `ext4` (`/dev/root`) rather than explicit `:` bind lines. If debugging “cursor-agent not mounted”, still compare running container `mount` output with `deployment/vm/docker-compose.yml` (expected bind: host `cursor-agent` versions dir **ro**, host `~/.config/cursor` → `/root/.config/cursor` **rw**).

**Readiness:** `GET /health/ready` exposes `memory_curator_model`, `memory_curator_sequential_batches`, `memory_curator_llm_timeout_ms`, `memory_curator_max_stories`, `memory_curator_max_stories_per_batch`, `cursor_api_key_configured`, and `cursor_agent`.

---

## 3. Optional mitigation (implemented in repo)

Already in place:

- **Sequential batches default on** (`CURATOR_SEQUENTIAL_BATCHES`, default `true`).
- **Larger Telegram error window** (`CURATOR_TELEGRAM_ERROR_MAX_CHARS`, default 2000).
- **Verbose stderr** (`CURATOR_VERBOSE_LOGS=true`) for deeper logs.

**Added in this follow-up:**

| Variable | Purpose |
|----------|---------|
| `CURATOR_LLM_TIMEOUT_MS` | Per-batch `cursor-agent` timeout (ms), clamped **60_000–900_000**, default **360_000** |
| `CURATOR_MAX_STORIES` | Max rows from `analysis_filtered_news` per run (clamped **5–50**), default **25** |
| `CURATOR_MAX_STORIES_PER_BATCH` | Batch size (clamped **3–20**, capped by max stories), default **10** |

Compose references: `deployment/vm/docker-compose.yml` under `gateway-2.0.environment`.

---

## 4. Manual run + full logs (when root cause is still unclear)

1. **SSH** to the VM (see your standard deployment workflow).
2. **Tail logs** before triggering:
   ```bash
   docker logs -f gateway-2.0 2>&1 | tee /tmp/gateway-curator-$(date -u +%Y%m%dT%H%M%SZ).log
   ```
3. **Optional:** set `CURATOR_VERBOSE_LOGS=true` (redeploy or override env), redeploy if needed, repeat tail.
4. **Trigger curation only** (does not re-run news):
   ```bash
   curl -sS -X POST "http://localhost:8083/internal/curate-memory" \
     -H "Content-Type: application/json" \
     -H "X-Service-Key: ${INTERNAL_SERVICE_KEY}"
   ```
   Use the real `INTERNAL_SERVICE_KEY` from secrets; internal port may be `8080` from inside Docker network—adjust host/port to match how you reach the gateway.
5. **Archive:** keep the `tee` file; include timestamps of the request, HTTP status, and any `Curator batch failed` / `Memory curation failed` blocks.

---

## 5. Follow-up improvement / prevention / observability (roadmap)

Ground next implementation in **concrete** `memoryCurationErrorMessage` strings and log excerpts from section 1.

| Theme | Ideas |
|--------|--------|
| **Reliability** | Jittered backoff between sequential batches on rate-limit stderr; optional retry of a single failed batch once. |
| **Prevention** | Startup warning if `cursor_agent` readiness fails; alert if `CURATOR_MODEL` changes without successful dry `cursor-agent -p`. |
| **Observability** | Prometheus counters: `curator_batches_total`, `curator_batch_failures_total`, histogram of batch duration; correlate `curatorRunId` in Telegram (short id). |
| **News → curator** | Log `batch_id` when triggering curator after news; if failures correlate with specific batches, add sampling of story sizes before LLM. |
| **Telegram** | Optional second message with **truncation continuation** if error length exceeds Telegram limits (separate from per-line max chars). |

---

## Deployment workflow (per your rules)

1. **Baseline check (SSH into VM)**  
   - `ssh -i "$HOME\.ssh\nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`  
   - `docker ps` → note current image version  

2. **Stage and push changes**  
   - `git status` → `git add <file1> <file2> ...` → `git commit -m "msg" && git push origin main`  
   - Never use `git add .`  

3. **Verify build**  
   - GitHub Actions: `gh run watch`  
   - If frontend modified: `vercel ls --scope=stocktracker`  
   - **Only proceed when all builds pass**  

4. **Verify VM deployment**  
   - SSH → `docker ps` → compare version  

5. **Done**
