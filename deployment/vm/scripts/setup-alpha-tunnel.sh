#!/bin/bash
# ===========================================
# Alpha Tunnel User Setup
# ===========================================
# Idempotent provisioning for the restricted SSH-tunnel-only system user
# `alpha_tunnel`. Used by Alpha (read-only Smart Digest source-of-truth review)
# to forward 127.0.0.1:5432 -> the loopback-bound postgres container.
#
# Usage (on the VM, as root):
#   sudo ALPHA_TUNNEL_PUBKEY="ssh-ed25519 AAAA... alpha-tunnel" \
#        bash /opt/stocktracker/repo/deployment/vm/scripts/setup-alpha-tunnel.sh
#
# Companion files:
#   - deployment/vm/sshd/alpha_tunnel.conf  (sshd Match-block drop-in)
#   - deployment/vm/docker-compose.yml      (loopback port binding on postgres)
#
# Pairs with the Postgres role `alpha_readonly` (provisioned manually via psql).
# ===========================================

set -euo pipefail

USER_NAME="alpha_tunnel"
SSH_DROPIN_SRC="$(dirname "$(readlink -f "$0")")/../sshd/alpha_tunnel.conf"
SSH_DROPIN_DST="/etc/ssh/sshd_config.d/alpha_tunnel.conf"

if [ "${EUID}" -ne 0 ]; then
    echo "ERROR: must be run as root (sudo)" >&2
    exit 1
fi

if [ -z "${ALPHA_TUNNEL_PUBKEY:-}" ]; then
    echo "ERROR: ALPHA_TUNNEL_PUBKEY env var is required" >&2
    echo "Example:" >&2
    echo "  sudo ALPHA_TUNNEL_PUBKEY=\"\$(cat alpha_tunnel.pub)\" bash $0" >&2
    exit 1
fi

# Sanity-check the public key shape (ssh-ed25519 / ssh-rsa / ecdsa-sha2-*)
if ! printf '%s' "$ALPHA_TUNNEL_PUBKEY" | grep -Eq '^(ssh-(ed25519|rsa)|ecdsa-sha2-[a-z0-9-]+) [A-Za-z0-9+/=]+( .*)?$'; then
    echo "ERROR: ALPHA_TUNNEL_PUBKEY does not look like a valid OpenSSH public key" >&2
    exit 1
fi

echo "=========================================="
echo "Alpha Tunnel User Setup"
echo "=========================================="

# ===========================================
# 1. System user (no shell, system account)
# ===========================================
if id "$USER_NAME" &>/dev/null; then
    echo "[user] $USER_NAME already exists; ensuring shell is /usr/sbin/nologin"
    usermod -s /usr/sbin/nologin "$USER_NAME"
else
    echo "[user] creating $USER_NAME"
    useradd --system --create-home --shell /usr/sbin/nologin "$USER_NAME"
fi

HOME_DIR="$(getent passwd "$USER_NAME" | cut -d: -f6)"
if [ -z "$HOME_DIR" ] || [ ! -d "$HOME_DIR" ]; then
    echo "ERROR: home directory for $USER_NAME not found" >&2
    exit 1
fi

# ===========================================
# 2. authorized_keys with hard restrictions
#    Enumerate restrictions explicitly instead of using `restrict`: the
#    umbrella `restrict` keyword adds `no-port-forwarding` which CANNOT be
#    re-narrowed by `permitopen=` (they don't compose; `restrict` wins and
#    blocks all forwarding entirely). So we list the no-* options we actually
#    want and rely on `permitopen=` to constrain forwarding to 127.0.0.1:5432.
#    `command=` makes any shell attempt land in /usr/sbin/nologin instead of
#    bash. Server-side `Match User alpha_tunnel` block (sshd_config drop-in)
#    enforces the same constraints independently for defence-in-depth.
# ===========================================
SSH_DIR="$HOME_DIR/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

install -d -o "$USER_NAME" -g "$USER_NAME" -m 700 "$SSH_DIR"

RESTRICTIONS='no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc,permitopen="127.0.0.1:5432",command="/usr/sbin/nologin"'

# Atomic write: build new content in a temp file, then mv into place
TMP_AUTH="$(mktemp)"
trap 'rm -f "$TMP_AUTH"' EXIT
printf '%s %s\n' "$RESTRICTIONS" "$ALPHA_TUNNEL_PUBKEY" > "$TMP_AUTH"
chown "$USER_NAME:$USER_NAME" "$TMP_AUTH"
chmod 600 "$TMP_AUTH"
mv "$TMP_AUTH" "$AUTH_KEYS"
trap - EXIT

echo "[ssh] wrote $AUTH_KEYS"
echo "      restrictions: $RESTRICTIONS"

# ===========================================
# 3. sshd_config drop-in (defence-in-depth Match block)
# ===========================================
if [ ! -f "$SSH_DROPIN_SRC" ]; then
    echo "ERROR: sshd drop-in source not found at $SSH_DROPIN_SRC" >&2
    exit 1
fi

install -o root -g root -m 644 "$SSH_DROPIN_SRC" "$SSH_DROPIN_DST"
echo "[sshd] installed $SSH_DROPIN_DST"

# Validate sshd config before reload (fail fast if drop-in is malformed)
if ! sshd -t; then
    echo "ERROR: sshd -t failed; not reloading. Inspect $SSH_DROPIN_DST" >&2
    exit 1
fi
echo "[sshd] config valid (sshd -t passed)"

systemctl reload ssh 2>/dev/null || systemctl reload sshd
echo "[sshd] reloaded"

# ===========================================
# 4. Proof of restrictions
# ===========================================
echo ""
echo "=========================================="
echo "Effective sshd settings for $USER_NAME"
echo "=========================================="
sshd -T -C "user=$USER_NAME,host=localhost,addr=127.0.0.1" 2>/dev/null \
    | grep -iE '^(allowtcpforwarding|permitopen|forcecommand|allowstreamlocalforwarding|x11forwarding|allowagentforwarding|permittunnel|gatewayports) ' \
    || true

echo ""
echo "Done. Alpha can now connect with:"
echo "  ssh -i <alpha_private_key> -N -L 5433:127.0.0.1:5432 $USER_NAME@<vm>"
echo "Then point any psql client at: postgresql://alpha_readonly@127.0.0.1:5433/stocktracker"
