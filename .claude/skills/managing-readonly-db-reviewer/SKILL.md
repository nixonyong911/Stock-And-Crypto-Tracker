---
name: managing-readonly-db-reviewer
description: Use when provisioning, rotating, modifying, or removing the alpha_readonly read-only Postgres reviewer access (SSH tunnel via alpha_tunnel system user, alpha_readonly DB role, pgAdmin fallback). Triggers on any mention of "alpha_readonly", "alpha_tunnel", "ALPHA_TUNNEL_SSH_PRIVATE_KEY", "ALPHA_READONLY_DB_PASSWORD", "Alpha DB access", "rotate the SSH key", "remove read-only access", "add a table to Alpha's view", or similar reviewer-access changes.
---

# Managing the `alpha_readonly` DB Reviewer Access

## Overview

A dedicated, **least-privilege**, **read-only** path into production Postgres for an outside reviewer ("Alpha"). Two independent enforcement layers: an SSH-level restricted user (`alpha_tunnel`) and a Postgres-level restricted role (`alpha_readonly`). Either layer alone denies abuse; together they survive accidental misedits to one of them.

**Primary path:** SSH local tunnel from reviewer's machine → loopback-bound Postgres on the VM.
**Fallback path:** pgAdmin web UI on `https://nxserver.malaysiawest.cloudapp.azure.com/pgadmin`.

**This is NOT a developer access path** — for general DB access, use the `postgres` superuser via the existing pgAdmin admin login or `docker exec -u postgres postgres psql`.

## Architecture

```
Reviewer's local machine                      VM (20.17.176.1)                 postgres container
┌────────────────────────┐                   ┌──────────────────────┐         ┌─────────────────────┐
│ ssh -N -L 5433:        │                   │ sshd                 │         │ stocktracker DB     │
│   127.0.0.1:5432       │ ──── port 22 ───>│ Match User           │         │                     │
│   alpha_tunnel@vm      │                   │   alpha_tunnel       │         │ role: alpha_readonly│
│                        │                   │ + key restrictions:  │         │  - SELECT only      │
│ psql ... 127.0.0.1:5433│ <── tunnel ────── │   permitopen=        │         │  - BYPASSRLS        │
│                        │                   │     127.0.0.1:5432   │ ──────> │  - default_txn=     │
└────────────────────────┘                   │   command=nologin    │         │      READ ONLY      │
                                             │                      │         │  - statement_       │
External: nc 5432 → BLOCKED                  │ docker-proxy         │         │     timeout=60s     │
(Azure NSG, public iface)                    │ 127.0.0.1:5432 ─────>│         └─────────────────────┘
                                             └──────────────────────┘
```

## Moving Parts (the things you may need to touch)

| Part | Where | Owned by | Purpose |
|---|---|---|---|
| Postgres role `alpha_readonly` | DB cluster, in-place | manual `psql` | The actual SQL identity. SELECT-only, BYPASSRLS, read-only transactions. |
| `ALPHA_READONLY_DB_PASSWORD` | Infisical PROD | rotate as needed | DB password for the role above. |
| Linux user `alpha_tunnel` | VM `/etc/passwd`, `/home/alpha_tunnel` | [`deployment/vm/scripts/setup-alpha-tunnel.sh`](deployment/vm/scripts/setup-alpha-tunnel.sh) | SSH gate, `nologin` shell, port-forward only. |
| `~/.ssh/authorized_keys` for alpha_tunnel | VM, not in git | setup-alpha-tunnel.sh | Per-key restrictions + the public key. |
| `ALPHA_TUNNEL_SSH_PRIVATE_KEY` | Infisical PROD | rotate as needed | The reviewer's SSH private key. |
| Public key | Embedded in `authorized_keys` (above) | rotate together with private key | Pubkey deployed to VM by setup script. |
| sshd Match block | [`deployment/vm/sshd/alpha_tunnel.conf`](deployment/vm/sshd/alpha_tunnel.conf) → installed at `/etc/ssh/sshd_config.d/alpha_tunnel.conf` | git, copied by setup script | Server-side enforcement (defence-in-depth). |
| Loopback port mapping | [`deployment/vm/docker-compose.yml`](deployment/vm/docker-compose.yml), `postgres` service: `ports: ["127.0.0.1:5432:5432"]` | git, deployed by Actions | Exposes Postgres on VM loopback only (NOT public). |
| pgAdmin user `alpha@stocktracker.local` | pgAdmin SQLite DB inside the pgadmin container | manual SQL `INSERT` | Fallback web access. |
| `ALPHA_PGADMIN_PASSWORD` | Infisical PROD | rotate as needed | pgAdmin login password. |

## Critical Rules (read these before changing anything)

1. **The compose port mapping MUST stay `127.0.0.1:5432:5432`.** If anyone ever changes it to `5432:5432` (without the prefix), Postgres becomes publicly reachable on the Azure interface. **CI does NOT catch this.** Always re-verify with `sudo ss -tlnp | grep 5432` after touching that file.
2. **Never use `restrict` in `authorized_keys` here.** `restrict` includes `no-port-forwarding` which `permitopen=` cannot re-narrow — they don't compose; `restrict` wins and blocks all forwarding entirely. Use the explicit `no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,permitopen=...,command=...` form (already encoded in `setup-alpha-tunnel.sh`).
3. **Two layers must agree.** Whatever you allow at the SSH layer (Match block + authorized_keys) and the Postgres layer (role grants + RLS bypass) must match. If you change one, audit the other.
4. **Never put the SSH private key in git, ever.** It must round-trip through Infisical or a one-shot chat surface only. Local copies must be `shred -u`'d before the turn ends.

---

## Recipe 1: Initial Provisioning (already done, kept for reference)

> If you're reading this because access already exists and works, **skip to Recipe 2/3/4**. This recipe is what was run to create everything from scratch.

### 1.1 — Ensure the loopback port mapping is in `docker-compose.yml`

```yaml
postgres:
  ...
  ports:
    - "127.0.0.1:5432:5432"
```

Commit, push, wait for `gh run watch` to go green. Verify on VM:

```bash
sudo ss -tlnp | grep 5432
# MUST show: 127.0.0.1:5432  ... docker-proxy
# MUST NOT show: 0.0.0.0:5432
```

### 1.2 — Provision the Postgres role `alpha_readonly`

Run from `azureuser` SSH session on the VM:

```bash
docker exec -i -u postgres postgres psql -d stocktracker <<'EOF'
-- Generate the password OUT-OF-BAND, replace the literal below
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='alpha_readonly') THEN
    CREATE ROLE alpha_readonly LOGIN NOINHERIT BYPASSRLS PASSWORD '<PASTE_PASSWORD>';
  END IF;
END $$;

-- Connect + schema usage
GRANT CONNECT ON DATABASE stocktracker TO alpha_readonly;
GRANT USAGE ON SCHEMA public, extensions TO alpha_readonly;

-- SELECT on all current tables in public
GRANT SELECT ON ALL TABLES IN SCHEMA public TO alpha_readonly;

-- SELECT on future tables created in public
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO alpha_readonly;

-- Lock down: no writes, no DDL, no function execution
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM alpha_readonly;
REVOKE CREATE ON SCHEMA public, extensions FROM alpha_readonly;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM alpha_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM alpha_readonly;

-- Per-role safety defaults
ALTER ROLE alpha_readonly SET default_transaction_read_only = on;
ALTER ROLE alpha_readonly SET search_path = public, extensions;
ALTER ROLE alpha_readonly SET statement_timeout = '60s';
EOF
```

**Why `BYPASSRLS`:** several Smart Digest tables (`user_watchlist`, `gateway_sessions`, `channel_accounts`, etc.) have RLS policies tied to a `clerk_user_id` claim. Without bypass, the reviewer would see zero rows. This is acceptable because all writes are already blocked by the SELECT-only grant + `default_transaction_read_only=on` (verified by Recipe 5).

### 1.3 — Provision the Linux user `alpha_tunnel`

Generate the keypair locally:

```bash
ssh-keygen -t ed25519 -C "alpha-tunnel" -f /tmp/alpha_tunnel_ed25519 -N "" -q
```

Push the public key to the VM and run the setup script:

```bash
PUBKEY=$(cat /tmp/alpha_tunnel_ed25519.pub)
ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 \
  "sudo ALPHA_TUNNEL_PUBKEY='$PUBKEY' bash /opt/stocktracker/repo/deployment/vm/scripts/setup-alpha-tunnel.sh"
```

The script is idempotent: re-running it overwrites `authorized_keys` and reinstalls the sshd Match block. It validates `sshd -t` before reloading; if validation fails, it aborts without touching the live sshd.

### 1.4 — Surface secrets ONCE, then shred

Surface in chat for the user to paste into Infisical PROD:

- `ALPHA_TUNNEL_SSH_PRIVATE_KEY` ← contents of `/tmp/alpha_tunnel_ed25519`
- `ALPHA_READONLY_DB_PASSWORD` ← the password from step 1.2

Then:

```bash
shred -u /tmp/alpha_tunnel_ed25519 /tmp/alpha_tunnel_ed25519.pub
```

---

## Recipe 2: Rotate the SSH Private Key (`ALPHA_TUNNEL_SSH_PRIVATE_KEY`)

Use when: reviewer's machine was compromised, key may have leaked, or scheduled rotation.

```bash
# 1. Generate fresh keypair
rm -f /tmp/alpha_tunnel_ed25519 /tmp/alpha_tunnel_ed25519.pub
ssh-keygen -t ed25519 -C "alpha-tunnel" -f /tmp/alpha_tunnel_ed25519 -N "" -q

# 2. Push the new pubkey to the VM (overwrites authorized_keys atomically)
PUBKEY=$(cat /tmp/alpha_tunnel_ed25519.pub)
ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 \
  "sudo ALPHA_TUNNEL_PUBKEY='$PUBKEY' bash /opt/stocktracker/repo/deployment/vm/scripts/setup-alpha-tunnel.sh"

# 3. Verify the new key works (see Recipe 5 for the full matrix)
ssh -i /tmp/alpha_tunnel_ed25519 -N -L 5433:127.0.0.1:5432 alpha_tunnel@20.17.176.1 &
TUN=$!; sleep 2
PGPASSWORD='<from Infisical>' psql -h 127.0.0.1 -p 5433 -U alpha_readonly -d stocktracker -c "SELECT 1"
kill $TUN

# 4. Surface the new private key ONCE in chat for Infisical paste, then:
shred -u /tmp/alpha_tunnel_ed25519 /tmp/alpha_tunnel_ed25519.pub
```

**Important:** the moment step 2 finishes, the OLD key is invalid. The reviewer must re-fetch `ALPHA_TUNNEL_SSH_PRIVATE_KEY` from Infisical before their next session.

---

## Recipe 3: Rotate the DB Password (`ALPHA_READONLY_DB_PASSWORD`)

Use when: password may have leaked, scheduled rotation, or you want to lock out the reviewer faster than full removal.

```bash
NEW_PWD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
echo "New password length: ${#NEW_PWD}"

# Apply via the postgres superuser (runs inside the container)
cat > /tmp/rotate.sql <<EOF
ALTER ROLE alpha_readonly WITH PASSWORD '$NEW_PWD';
EOF
scp -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" /tmp/rotate.sql azureuser@20.17.176.1:/tmp/rotate.sql
ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 \
  'docker cp /tmp/rotate.sql postgres:/tmp/rotate.sql && \
   docker exec -u postgres postgres psql -d stocktracker -f /tmp/rotate.sql && \
   rm /tmp/rotate.sql'
shred -u /tmp/rotate.sql

# Surface NEW_PWD ONCE in chat for Infisical paste as ALPHA_READONLY_DB_PASSWORD
echo "$NEW_PWD"
```

The pgAdmin pre-saved server connection will prompt for the new password on next reconnect — no pgAdmin-side change needed.

---

## Recipe 4: Rotate the pgAdmin Password (`ALPHA_PGADMIN_PASSWORD`)

Use when: rotating fallback access. pgAdmin keeps its users in a SQLite DB inside the container.

```bash
NEW_PWD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)

ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 bash -s <<EOF
docker exec pgadmin /venv/bin/python -c "
from pgadmin import create_app
from pgadmin.model import db, User
from werkzeug.security import generate_password_hash
app = create_app()
with app.app_context():
    u = User.query.filter_by(email='alpha@stocktracker.local').first()
    u.password = generate_password_hash('$NEW_PWD')
    db.session.commit()
    print('rotated')
"
EOF

# Surface NEW_PWD ONCE in chat for Infisical paste as ALPHA_PGADMIN_PASSWORD
echo "$NEW_PWD"
```

---

## Recipe 5: Verify the Read-Only Path End-to-End

Run after any change. **All 14 checks must pass.** If any fail, revert the change before letting the reviewer back in.

```bash
# Setup
ALPHA_PWD='<from Infisical>'
KEY=/tmp/alpha_tunnel_ed25519   # restored from Infisical for the test

ssh -i $KEY -N -L 5433:127.0.0.1:5432 alpha_tunnel@20.17.176.1 &
TUN=$!; sleep 2

# A — Reads work
psql_a() { PGPASSWORD="$ALPHA_PWD" psql -h 127.0.0.1 -p 5433 -U alpha_readonly -d stocktracker "$@"; }
psql_a -c "SELECT current_user, current_setting('default_transaction_read_only');"
psql_a -c "SELECT count(*) FROM analysis_ticker_price_targets;"  # ~9k rows
psql_a -c "SELECT count(*) FROM analysis_market_memory;"
psql_a -c "SELECT count(*) FROM user_watchlist;"
psql_a -c "SELECT count(*) FROM user_recommendation_log;"
psql_a -c "SELECT count(*) FROM channel_accounts;"
psql_a -c "SELECT count(*) FROM gateway_sessions;"

# B — Writes blocked at TWO layers
psql_a -c "INSERT INTO user_watchlist VALUES ('x','stock','XXX');"  # ERROR: read-only transaction
psql_a -c "BEGIN; SET TRANSACTION READ WRITE; INSERT INTO user_watchlist VALUES ('x','stock','XXX'); ROLLBACK;"  # ERROR: permission denied
psql_a -c "DROP TABLE user_watchlist;"  # ERROR: read-only transaction

# C — SSH restrictions
ssh -i $KEY alpha_tunnel@20.17.176.1                    # "This account is currently not available."
ssh -i $KEY alpha_tunnel@20.17.176.1 'docker ps'        # same — ForceCommand
ssh -i $KEY -t alpha_tunnel@20.17.176.1                 # PermitTTY no
# The forward-restriction tests below need actual data through the channel:
ssh -i $KEY -N -L 6379:127.0.0.1:6379 alpha_tunnel@20.17.176.1 -v 2>&1 | grep "administratively prohibited" &
sleep 2; echo PING | nc -w1 127.0.0.1 6379 >/dev/null

# D — Public exposure
ssh -i ".../nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 'sudo ss -tlnp | grep 5432'
# MUST show 127.0.0.1:5432 only
nc -zv -w 5 20.17.176.1 5432   # MUST timeout (Azure NSG closed)

kill $TUN
```

If any A/B/C/D check regresses, **the access is unsafe** — revert the most recent change (compose, setup script, or sshd drop-in) before continuing.

---

## Recipe 6: Modify the Read-Only Permissions

### 6a. Add a new schema to the reviewer's view

```sql
GRANT USAGE ON SCHEMA <new_schema> TO alpha_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA <new_schema> TO alpha_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA <new_schema>
  GRANT SELECT ON TABLES TO alpha_readonly;
ALTER ROLE alpha_readonly SET search_path = public, extensions, <new_schema>;
```

### 6b. Hide a specific table from the reviewer (revoke after-the-fact)

```sql
REVOKE SELECT ON <schema>.<table> FROM alpha_readonly;
-- And block future re-grant via default privileges:
ALTER DEFAULT PRIVILEGES IN SCHEMA <schema>
  REVOKE SELECT ON TABLES FROM alpha_readonly;
-- Then explicitly re-grant only the specific tables you want visible.
```

### 6c. Allow forwarding to a NEW port (e.g. add Redis read-only inspection)

**Strongly discouraged** — Redis has no read-only ACL on this stack. If you must:

1. Edit BOTH layers (must match):
   - [`deployment/vm/sshd/alpha_tunnel.conf`](deployment/vm/sshd/alpha_tunnel.conf) — change `PermitOpen 127.0.0.1:5432` to `PermitOpen 127.0.0.1:5432 127.0.0.1:6379`
   - [`deployment/vm/scripts/setup-alpha-tunnel.sh`](deployment/vm/scripts/setup-alpha-tunnel.sh) — change the `RESTRICTIONS` line, e.g. `permitopen="127.0.0.1:5432",permitopen="127.0.0.1:6379"`
2. Bind the redis container to loopback in compose: `ports: ["127.0.0.1:6379:6379"]`
3. Commit, push, wait for green deploy
4. Re-run the setup script on the VM with the same pubkey to reinstall the Match block + authorized_keys
5. Run **Recipe 5 in full** to confirm nothing else regressed

### 6d. Tighten the statement timeout (e.g. for noisy reviewer)

```sql
ALTER ROLE alpha_readonly SET statement_timeout = '15s';
```

Reviewer can still bump per-session with `SET statement_timeout = '5min';` unless you also drop their `SET` privilege (which is awkward — this control is mainly a guardrail, not a wall).

### 6e. Add a SECOND reviewer

Add their pubkey to the existing `authorized_keys` (one line per key). The setup script as written **overwrites** authorized_keys, so for multi-reviewer you must either:
- Hand-edit `/home/alpha_tunnel/.ssh/authorized_keys` directly on the VM (and remember it'll be wiped next time the script runs), OR
- Modify the setup script to accept multiple keys and append rather than overwrite

For most cases, just give the second reviewer a copy of the same key from Infisical — one shared key is fine for short-lived reviews. Real multi-tenant access deserves a separate Linux user (`beta_tunnel`), separate Postgres role (`beta_readonly`), and separate Match block.

---

## Recipe 7: Remove the Read-Only Access (Full Teardown)

Use when: review is finished, reviewer is no longer trusted, or after-incident cleanup.

The kill-switches are **independent** — pick one for fast lockout, do all of them for full removal.

### 7a. Fast lockout (under 10 seconds)

Disable the SSH user. The tunnel stops working immediately for any open OR new connections.

```bash
ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 \
  'sudo usermod --lock alpha_tunnel'
```

To re-enable later: `sudo usermod --unlock alpha_tunnel`. The Postgres role and pgAdmin user are untouched.

### 7b. Remove the SSH key but keep the user

Equivalent effect to 7a, slightly more surgical:

```bash
ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 \
  'sudo truncate -s 0 /home/alpha_tunnel/.ssh/authorized_keys'
```

To re-grant: re-run `setup-alpha-tunnel.sh` with the pubkey.

### 7c. Drop the Postgres role

This kills BOTH the SSH-tunnel path AND the pgAdmin-fallback path (both authenticate as `alpha_readonly`):

```bash
ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 bash -s <<'EOF'
docker exec -i -u postgres postgres psql -d stocktracker <<'SQL'
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM alpha_readonly;
  REVOKE ALL ON SCHEMA public, extensions FROM alpha_readonly;
  REVOKE CONNECT ON DATABASE stocktracker FROM alpha_readonly;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE SELECT ON TABLES FROM alpha_readonly;
  REASSIGN OWNED BY alpha_readonly TO postgres;
  DROP OWNED BY alpha_readonly;
  DROP ROLE alpha_readonly;
SQL
EOF
```

### 7d. Remove the Linux user, sshd Match block, and pgAdmin user

For full cleanup with no orphan accounts:

```bash
ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1 bash -s <<'EOF'
# Linux user (also wipes /home/alpha_tunnel)
sudo userdel -r alpha_tunnel 2>/dev/null || true

# sshd Match block
sudo rm -f /etc/ssh/sshd_config.d/alpha_tunnel.conf
sudo sshd -t && sudo systemctl reload ssh

# pgAdmin user (alpha@stocktracker.local, user_id=2)
docker exec pgadmin sqlite3 /var/lib/pgadmin/pgadmin4.db \
  "DELETE FROM user WHERE email='alpha@stocktracker.local';
   DELETE FROM server WHERE user_id=2;"
EOF
```

### 7e. (Optional) Close the loopback exposure entirely

If no reviewer access will be needed for the foreseeable future, revert the compose port mapping so even local SSH tunneling is impossible without redeploying:

1. Edit [`deployment/vm/docker-compose.yml`](deployment/vm/docker-compose.yml), remove the `ports:` block under `postgres`
2. Commit, push, wait for green deploy
3. On VM: `sudo ss -tlnp | grep 5432` should show NOTHING (port no longer bound on host)

### 7f. Retire the secrets in Infisical

After 7c/7d (so the secrets are dead in production):
- Delete `ALPHA_TUNNEL_SSH_PRIVATE_KEY`, `ALPHA_READONLY_DB_PASSWORD`, `ALPHA_PGADMIN_PASSWORD` from Infisical PROD
- Or rotate them to random nonsense values if you want them flagged-but-present for audit history

---

## Common Failure Modes and How to Recognize Them

| Symptom | Cause | Fix |
|---|---|---|
| `psql: server closed the connection unexpectedly` via tunnel | Forward channel rejected by sshd. Almost always: `restrict` or wrong `permitopen` in `authorized_keys`. | Check `sudo cat /home/alpha_tunnel/.ssh/authorized_keys`; rerun `setup-alpha-tunnel.sh` to restore the explicit `no-*` form. Verify with `sshd -T -C user=alpha_tunnel`. |
| `channel N: open failed: administratively prohibited` in `ssh -v` | Forward destination not in `permitopen`. Either reviewer is forwarding to wrong host:port, or `permitopen=` was removed. | Confirm reviewer is using `-L 5433:127.0.0.1:5432` exactly. If correct, audit `authorized_keys` and `alpha_tunnel.conf`. |
| `permission denied for table <T>` even on SELECT | Table was created OUTSIDE `public` schema, or default privileges weren't applied. | `GRANT SELECT ON <schema>.<T> TO alpha_readonly;` and ensure `ALTER DEFAULT PRIVILEGES IN SCHEMA <schema> GRANT SELECT ON TABLES TO alpha_readonly;` for that schema. |
| Reviewer sees zero rows from `user_watchlist`/etc. | RLS is filtering. `BYPASSRLS` was dropped from the role. | `ALTER ROLE alpha_readonly BYPASSRLS;` |
| `ss -tlnp` shows `0.0.0.0:5432` | Compose `ports:` lost the `127.0.0.1:` prefix. **PUBLIC EXPOSURE.** | Revert immediately: `git revert` the compose change, redeploy. Then audit external port: `nc -zv 20.17.176.1 5432` from outside. |
| Setup script fails: `sshd -t failed; not reloading` | Malformed Match block in `alpha_tunnel.conf`. | Script aborts BEFORE replacing live config — safe state. Fix the source file in git, redeploy, rerun script. |
| Reviewer's tunnel disconnects every ~2 minutes | Working as designed. `ClientAliveInterval 30 / ClientAliveCountMax 4` in the Match block kills idle/abandoned tunnels. | Reviewer should run psql actively, or wrap the SSH command in `autossh` on their side. |

## Operational Workflow Tail

After any change in this skill that touches `deployment/vm/*`:

1. **Baseline check (SSH into VM):**
   - `ssh -i "$HOME/.ssh/nx-linux-server-azure_key (1).pem" azureuser@20.17.176.1`
   - `docker ps` → note current `postgres` container status; `sudo ss -tlnp | grep 5432` → snapshot baseline
2. **Stage and push changes:**
   - `git status` → `git add` ONLY the specific files you intended to change (other agents may have uncommitted work — never `git add .`)
   - `git commit -m "<conventional msg>"` → `git push origin main`
3. **Verify build:** `gh run watch <run-id>` until green; on failure `gh run view <run-id> --log` → fix → step 2.
4. **Verify VM deployment:** SSH back, `docker ps` → confirm postgres healthy and port mapping is `127.0.0.1:5432->5432/tcp`. Run **Recipe 5** in full.
5. **Done.**
