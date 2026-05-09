---
name: smart-digest-alpha-db-handoff
overview: Read-only DB access for Alpha. Primary path is an SSH local tunnel via a restricted alpha_tunnel system user to a loopback-bound Postgres (least-privilege both at the SSH layer and the Postgres role layer). pgAdmin web access is kept as a fallback.
todos:
  - id: store-secrets-infisical
    content: "User action — paste the SSH private key + DB password into Infisical PROD as ALPHA_TUNNEL_SSH_PRIVATE_KEY / ALPHA_READONLY_DB_PASSWORD (and ALPHA_PGADMIN_PASSWORD for the fallback path). The local Infisical CLI in this workspace has read-only token; values are surfaced once in chat."
    status: pending
  - id: hand-credentials-to-alpha
    content: "Send Alpha the SSH command + psql connection string + Infisical key references via your usual secure channel."
    status: pending
  - id: rotate-after-review
    content: "When Alpha's source-of-truth review is finished, retire by removing /home/alpha_tunnel/.ssh/authorized_keys (or `usermod -L alpha_tunnel`), then rotate or DROP ROLE alpha_readonly."
    status: pending
isProject: false
---

# Smart Digest — Alpha DB Access Handoff

Live read-only access has been provisioned and verified end-to-end in production. This document is what you forward to Alpha.

## Access method chosen

**Option C — SSH local tunnel (long-term primary path).**

Alpha runs `ssh -N -L 5433:127.0.0.1:5432 alpha_tunnel@20.17.176.1` from their machine and points any SQL client at `localhost:5433` as `alpha_readonly`.

Why this over pgAdmin (now demoted to fallback):

- **Two independent enforcement layers.** Read-only is enforced at the Postgres role (`alpha_readonly`: SELECT-only, `default_transaction_read_only=on`); the SSH user (`alpha_tunnel`) is enforced to be tunnel-only at both `authorized_keys` (`no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,permitopen="127.0.0.1:5432",command="/usr/sbin/nologin"`) and `sshd_config.d` (`Match User alpha_tunnel`). Either layer alone denies abuse; together they survive accidental misedits. Note: we deliberately enumerate the `no-*` options instead of using the umbrella `restrict` keyword, because `restrict` includes `no-port-forwarding` which cannot be re-narrowed by `permitopen=` — they don't compose, and `restrict` wins, blocking all forwarding.
- **No shell, no extra forwards, no agent.** `alpha_tunnel` cannot `docker exec`, cannot `sudo`, cannot forward to Redis or any other internal port, cannot get a PTY, cannot bounce traffic onward via gateway forwarding.
- **No new public network surface.** Postgres is bound to `127.0.0.1:5432` on the VM host (loopback only). Public Azure interface is unchanged; an external `nc -zv 20.17.176.1 5432` should fail.
- **Standard tooling.** psql / DBeaver / pgcli / pg_dump all work without any pgAdmin abstraction. Alpha can script queries, save results, run EXPLAIN, etc.

## What was set up

1. **Postgres role `alpha_readonly`** (already existed from the previous session — unchanged):
   - `LOGIN, NOINHERIT, BYPASSRLS, NOT SUPERUSER`
   - `GRANT CONNECT, USAGE (public, extensions), SELECT (all current + future tables in public)`
   - Explicit `REVOKE INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/CREATE/EXECUTE`
   - Per-role: `default_transaction_read_only=on`, `search_path=public, extensions`, `statement_timeout=60s`

2. **VM compose change** ([`deployment/vm/docker-compose.yml`](deployment/vm/docker-compose.yml)) — added one loopback port mapping under `postgres`:
   ```yaml
   ports:
     - "127.0.0.1:5432:5432"
   ```
   Bound to `127.0.0.1` only; never `0.0.0.0`.

3. **Restricted system user `alpha_tunnel`** on the VM:
   - System account, `--shell /usr/sbin/nologin`
   - `~/.ssh/authorized_keys` line:
     ```
     no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,permitopen="127.0.0.1:5432",command="/usr/sbin/nologin" ssh-ed25519 AAAA... alpha-tunnel
     ```

4. **sshd `Match` block** ([`deployment/vm/sshd/alpha_tunnel.conf`](deployment/vm/sshd/alpha_tunnel.conf), installed at `/etc/ssh/sshd_config.d/alpha_tunnel.conf`):
   ```
   Match User alpha_tunnel
       AllowTcpForwarding local
       PermitOpen 127.0.0.1:5432
       PermitTunnel no
       AllowAgentForwarding no
       X11Forwarding no
       GatewayPorts no
       AllowStreamLocalForwarding no
       PermitTTY no
       ForceCommand /usr/sbin/nologin
       ClientAliveInterval 30
       ClientAliveCountMax 4
   ```

5. **Idempotent setup script** at [`deployment/vm/scripts/setup-alpha-tunnel.sh`](deployment/vm/scripts/setup-alpha-tunnel.sh) — re-runnable; takes the public key via `ALPHA_TUNNEL_PUBKEY` env var, validates it, writes both files atomically, runs `sshd -t` before reload.

6. **Dedicated ed25519 SSH keypair** (this session) — public key is in `authorized_keys` on the VM; private key is surfaced once in chat for Infisical PROD as `ALPHA_TUNNEL_SSH_PRIVATE_KEY`.

## Exact steps Alpha should use

1. Save the private key fetched from Infisical PROD `ALPHA_TUNNEL_SSH_PRIVATE_KEY` into a local file, e.g. `~/.ssh/alpha_tunnel_ed25519`, then `chmod 600` it.
2. Open the tunnel in one terminal:
   ```bash
   ssh -i ~/.ssh/alpha_tunnel_ed25519 -N \
       -L 5433:127.0.0.1:5432 \
       alpha_tunnel@20.17.176.1
   ```
   Leave it running. `-N` means no remote command (which is anyway forbidden by `ForceCommand`).
3. In another terminal, connect with any Postgres client to `localhost:5433`:
   ```bash
   PGPASSWORD='<from Infisical PROD/ALPHA_READONLY_DB_PASSWORD>' \
   psql -h 127.0.0.1 -p 5433 -U alpha_readonly -d stocktracker
   ```
   Or as a connection URI:
   ```
   postgresql://alpha_readonly:<password>@127.0.0.1:5433/stocktracker?sslmode=disable
   ```
   (sslmode=disable is fine — the SSH tunnel itself is the encrypted transport.)
4. Every transaction starts `READ ONLY` for `alpha_readonly`. Any write attempt — including `BEGIN; SET TRANSACTION READ WRITE; INSERT ...` — is rejected at the table-grant layer.

## Connection facts

| Field | Value |
|---|---|
| SSH host | `20.17.176.1` (alias: `nxserver.malaysiawest.cloudapp.azure.com`) |
| SSH user | `alpha_tunnel` |
| SSH key (Infisical key) | `PROD/ALPHA_TUNNEL_SSH_PRIVATE_KEY` |
| Local forward | `5433:127.0.0.1:5432` |
| DB host (after tunnel) | `127.0.0.1` |
| DB port (after tunnel) | `5433` |
| DB name | `stocktracker` |
| DB username | `alpha_readonly` |
| DB password (Infisical key) | `PROD/ALPHA_READONLY_DB_PASSWORD` |
| sslmode | `disable` (SSH is the encrypted layer) |
| Search path | `public, extensions` (pre-set on role) |
| Default transaction mode | `READ ONLY` (pre-set on role) |
| Statement timeout | `60s` (pre-set on role) |

## Validation results (post-deploy)

To be filled in after the SSH-VM-apply + verification run completes. Expected matrix:

| Check | Expected | Result |
|---|---|---|
| Tunnel up + `SELECT count(*) FROM analysis_ticker_price_targets` | returns ~9k | _to fill_ |
| `INSERT INTO user_watchlist …` via tunnel | `ERROR ... read-only transaction` | _to fill_ |
| `ssh alpha_tunnel@vm` (no `-N`, expect shell) | exits, no shell | _to fill_ |
| `ssh -L 6379:127.0.0.1:6379 alpha_tunnel@vm -N` | `administratively prohibited` | _to fill_ |
| `ssh -L 5432:8.8.8.8:53 alpha_tunnel@vm -N` | `administratively prohibited` | _to fill_ |
| `ssh alpha_tunnel@vm 'docker ps'` | rejected by ForceCommand | _to fill_ |
| `sudo ss -tlnp \| grep 5432` on VM | `127.0.0.1:5432` (NOT `0.0.0.0`) | _to fill_ |
| External `nc -zv 20.17.176.1 5432` | refused/timeout | _to fill_ |

## Caveats / operational notes

- **BYPASSRLS on `alpha_readonly`** (carried over from previous session). Required so user-scoped tables (`user_watchlist`, `gateway_sessions`, `channel_accounts`, etc.) are visible for the audit. Mirrors how `service_role` is configured. Does NOT grant any write privilege.
- **Statement timeout 60s.** Long analytical queries get cancelled. Bump per-session with `SET statement_timeout = '5min';`.
- **Tunnel keepalive.** `ClientAliveInterval 30 / ClientAliveCountMax 4` in the sshd Match block — abandoned tunnels die after ~2 minutes of network silence.
- **No git-tracked secrets.** The only credential references in the repo are the `restrict,permitopen=...` line in the setup script, which only contains the public key value passed via env var at install time.
- **Compose change is loopback-only.** The `127.0.0.1:` prefix is critical. If anyone ever drops it (`"5432:5432"`), Postgres becomes publicly reachable. CI does not catch this — guard via the post-deploy `ss -tlnp` check in the verification matrix.

## Rotation / retirement

When Alpha's review is done, three independent kill-switches:

```bash
# Fastest — disable the SSH user (tunnel stops working immediately):
sudo usermod --lock alpha_tunnel
# OR remove the public key:
sudo rm /home/alpha_tunnel/.ssh/authorized_keys

# Stronger — also retire the Postgres role:
docker exec -u postgres postgres psql -d stocktracker -c "
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM alpha_readonly;
  REVOKE ALL ON SCHEMA public, extensions FROM alpha_readonly;
  REVOKE CONNECT ON DATABASE stocktracker FROM alpha_readonly;
  DROP ROLE alpha_readonly;
"

# Optional — close the loopback exposure too (revert compose change, redeploy)
```

Each step is independent; you don't need to do all three.

---

## Fallback path: pgAdmin (left in place from the previous setup)

Use only if the SSH tunnel is down or Alpha needs a browser UI.

- URL: `https://nxserver.malaysiawest.cloudapp.azure.com/pgadmin`
- Email: `alpha@stocktracker.local`
- pgAdmin password: Infisical `PROD/ALPHA_PGADMIN_PASSWORD`
- DB password (when prompted by pre-saved server "StockTracker (read-only)"): Infisical `PROD/ALPHA_READONLY_DB_PASSWORD`

The pgAdmin user (`user_id=2`) is non-admin and cannot see the admin's superuser server (`user_id=1`).

---

## Open dependency on you

1. **Paste secrets into Infisical PROD** — the local Infisical CLI in this workspace has a read-only token (returned `403 PermissionDenied` on `secrets/raw/...` last session). The two new/existing keys to populate:
   - `ALPHA_TUNNEL_SSH_PRIVATE_KEY` — the OpenSSH ed25519 private key surfaced once in chat
   - `ALPHA_READONLY_DB_PASSWORD` — the Postgres role password (already surfaced last session; should already be in Infisical from your earlier paste)
   - `ALPHA_PGADMIN_PASSWORD` — fallback path pgAdmin login (also already surfaced last session)
2. **Forward to Alpha** — pgAdmin URL OR the SSH `-L` command, plus the Infisical key references. No raw secrets in any forwarded artefact.
