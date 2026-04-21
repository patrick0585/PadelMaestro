#!/usr/bin/env bash
# Padel Tracker — first-time VPS provisioning.
#
# Supports two deployment modes:
#   - domain: HTTPS via Caddy + Let's Encrypt (public production)
#   - ip:     HTTP on <VPS-IP>:<PORT> (no TLS — test / internal only)
#
# Run as root or with sudo on Debian 12 / Ubuntu 24.04:
#   sudo bash scripts/provision-vps.sh
#
# Non-interactive usage (all values as env vars):
#   sudo ADMIN_EMAIL=... ADMIN_NAME=... DEPLOY_MODE=ip VPS_IP=... APP_PORT=8080 \
#     bash scripts/provision-vps.sh
#
# Idempotent: safe to re-run after a partial failure. Reuses a valid
# existing .env unless FORCE=1 is set (FORCE rotates all secrets and
# invalidates all active sessions).

set -euo pipefail

# ─── Config (override via env; interactive prompts fill the rest) ───

REPO_URL="${REPO_URL:-https://github.com/patrick0585/padel-tracker.git}"
APP_USER="${APP_USER:-padel}"
APP_HOME="${APP_HOME:-/srv/padel}"
APP_DIR="${APP_DIR:-$APP_HOME/app}"
LOGS_DIR="${LOGS_DIR:-$APP_HOME/logs}"
DB_NAME="${DB_NAME:-padel_tracker}"
DB_USER="${DB_USER:-padel}"
SERVICE_NAME="${SERVICE_NAME:-padel}"
FORCE="${FORCE:-0}"

log()  { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Must run as root (use sudo)."

command -v apt-get >/dev/null || die "This script expects Debian/Ubuntu (apt-get not found)."

# ─── Gather inputs ───

if [[ -z "${ADMIN_EMAIL:-}" ]]; then
  read -r -p "Admin email: " ADMIN_EMAIL
fi
if [[ -z "${ADMIN_NAME:-}" ]]; then
  read -r -p "Admin display name: " ADMIN_NAME
fi
[[ -n "$ADMIN_EMAIL" && -n "$ADMIN_NAME" ]] || die "Admin email and name are required."

if [[ -z "${DEPLOY_MODE:-}" ]]; then
  printf 'Deployment mode:\n  1) domain   HTTPS via Caddy + Let'\''s Encrypt\n  2) ip       HTTP on <VPS-IP>:<PORT> (no TLS)\n'
  read -r -p "Choose [1/2]: " _choice
  case "$_choice" in
    1) DEPLOY_MODE=domain ;;
    2) DEPLOY_MODE=ip ;;
    *) die "Invalid choice." ;;
  esac
fi

case "$DEPLOY_MODE" in
  domain)
    if [[ -z "${DOMAIN:-}" ]]; then
      read -r -p "Domain (e.g. padel.example.com): " DOMAIN
    fi
    [[ -n "$DOMAIN" ]] || die "DOMAIN required in domain mode."
    AUTH_URL_VALUE="https://$DOMAIN"
    BIND_HOST="127.0.0.1"
    APP_PORT="${APP_PORT:-3000}"
    ;;
  ip)
    if [[ -z "${VPS_IP:-}" ]]; then
      read -r -p "VPS public IP: " VPS_IP
    fi
    if [[ -z "${APP_PORT:-}" ]]; then
      read -r -p "App port (e.g. 8080): " APP_PORT
    fi
    [[ -n "$VPS_IP" && -n "$APP_PORT" ]] || die "VPS_IP and APP_PORT required in ip mode."
    AUTH_URL_VALUE="http://$VPS_IP:$APP_PORT"
    BIND_HOST="0.0.0.0"
    ;;
  *)
    die "Unknown DEPLOY_MODE: $DEPLOY_MODE (use 'domain' or 'ip')." ;;
esac

# ─── 1. System packages ───

log "Installing base packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git ufw

if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v22'; then
  log "Installing Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

log "Activating pnpm via corepack"
corepack enable
corepack prepare pnpm@10.13.1 --activate

log "Installing Postgres 16"
apt-get install -y -qq postgresql postgresql-contrib

if [[ "$DEPLOY_MODE" == "domain" ]] && ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# ─── 2. App user + directories ───

if ! id "$APP_USER" &>/dev/null; then
  log "Creating user '$APP_USER'"
  adduser --system --group --home "$APP_HOME" "$APP_USER"
fi
mkdir -p "$APP_HOME" "$LOGS_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_HOME"

# ─── 3. Repo checkout ───

if [[ -d "$APP_DIR/.git" ]]; then
  log "Updating repo at $APP_DIR"
  sudo -u "$APP_USER" -H git -C "$APP_DIR" fetch --tags
  sudo -u "$APP_USER" -H git -C "$APP_DIR" checkout main
  sudo -u "$APP_USER" -H git -C "$APP_DIR" pull --ff-only
else
  log "Cloning $REPO_URL to $APP_DIR"
  sudo -u "$APP_USER" -H git clone "$REPO_URL" "$APP_DIR"
fi

# ─── 4. .env (reuse valid existing one unless FORCE=1) ───

ENV_PATH="$APP_DIR/.env"
REUSE_ENV=0
if [[ -f "$ENV_PATH" ]] && ! grep -qE '<[A-Z_]+>' "$ENV_PATH"; then
  if [[ "$FORCE" == "1" ]]; then
    warn "FORCE=1: rotating all secrets (invalidates existing sessions)"
  else
    REUSE_ENV=1
    log "Reusing existing $ENV_PATH (set FORCE=1 to rotate secrets)"
  fi
fi

if [[ "$REUSE_ENV" == "0" ]]; then
  NEW_DB_PW=$(openssl rand -hex 24)
  NEW_AUTH_SECRET=$(openssl rand -base64 32)
  log "Writing $ENV_PATH with fresh secrets"
  cat > "$ENV_PATH" <<ENV
DATABASE_URL="postgresql://$DB_USER:$NEW_DB_PW@localhost:5432/$DB_NAME?schema=public"
AUTH_SECRET="$NEW_AUTH_SECRET"
AUTH_URL="$AUTH_URL_VALUE"
AUTH_TRUST_HOST="true"
NODE_ENV="production"
ENV
  chown "$APP_USER:$APP_USER" "$ENV_PATH"
  chmod 600 "$ENV_PATH"
else
  # Extract DB password from the existing URL so we can ALTER USER to match.
  DB_URL=$(awk -F= '/^DATABASE_URL=/{sub(/^DATABASE_URL="/,""); sub(/"$/,""); print}' "$ENV_PATH" | head -1)
  NEW_DB_PW=$(printf '%s' "$DB_URL" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
  [[ -n "$NEW_DB_PW" && "$NEW_DB_PW" != "$DB_URL" ]] \
    || die "Could not parse DB password from existing .env; delete it and re-run."
fi

grep -qE '<[A-Z_]+>' "$ENV_PATH" && die ".env still contains placeholders — aborting."

# ─── 5. Postgres: user + database, sync password to .env ───

log "Ensuring Postgres role '$DB_USER' with password from .env"
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  sudo -u postgres psql -c "ALTER USER \"$DB_USER\" WITH PASSWORD '$NEW_DB_PW';" >/dev/null
else
  sudo -u postgres psql -c "CREATE USER \"$DB_USER\" WITH PASSWORD '$NEW_DB_PW';" >/dev/null
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  log "Creating database '$DB_NAME'"
  sudo -u postgres psql -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" >/dev/null
fi

# PG15+: public schema is locked down by default. Grant explicitly.
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO \"$DB_USER\";" >/dev/null

log "Verifying DB connectivity"
PGPASSWORD="$NEW_DB_PW" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c '\q' \
  || die "psql login failed — check pg_hba.conf (default on Debian/Ubuntu allows scram-sha-256 on localhost)."

# ─── 6. Install deps, migrate, build ───

log "Installing Node dependencies (this takes a minute)"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile"

log "Applying Prisma migrations"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && pnpm prisma migrate deploy"

log "Generating Prisma client"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && pnpm prisma generate"

log "Building Next.js"
sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && pnpm build"

log "Refreshing standalone symlinks"
sudo -u "$APP_USER" ln -sfn "$APP_DIR/public"       "$APP_DIR/.next/standalone/public"
sudo -u "$APP_USER" ln -sfn "$APP_DIR/.next/static" "$APP_DIR/.next/standalone/.next/static"

# ─── 7. systemd unit + sudoers for deploy.sh ───

log "Writing systemd unit"
cat > "/etc/systemd/system/$SERVICE_NAME.service" <<UNIT
[Unit]
Description=Padel Tracker (Next.js)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=PORT=$APP_PORT
Environment=HOSTNAME=$BIND_HOST
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:$LOGS_DIR/app.log
StandardError=append:$LOGS_DIR/app.err.log

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$LOGS_DIR $APP_DIR/.next

[Install]
WantedBy=multi-user.target
UNIT

log "Writing sudoers rule so '$APP_USER' can restart itself via deploy.sh"
cat > "/etc/sudoers.d/$SERVICE_NAME-restart" <<SUDO
$APP_USER ALL=(root) NOPASSWD: /bin/systemctl restart $SERVICE_NAME, /bin/systemctl is-active $SERVICE_NAME
SUDO
chmod 440 "/etc/sudoers.d/$SERVICE_NAME-restart"

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"

log "Waiting for service to settle"
sleep 3
systemctl is-active "$SERVICE_NAME" >/dev/null \
  || die "Service failed to start. Check: journalctl -u $SERVICE_NAME -n 100 --no-pager"

# ─── 8. Caddy (domain mode) ───

if [[ "$DEPLOY_MODE" == "domain" ]]; then
  log "Configuring Caddy for $DOMAIN"
  cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    encode zstd gzip
    reverse_proxy 127.0.0.1:$APP_PORT

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "same-origin"
    }

    log {
        output file /var/log/caddy/padel.log
        format json
    }
}
CADDY
  systemctl reload caddy
fi

# ─── 9. Firewall ───

if ufw status >/dev/null 2>&1; then
  log "Opening firewall ports (ufw)"
  ufw allow OpenSSH >/dev/null
  if [[ "$DEPLOY_MODE" == "domain" ]]; then
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
  else
    ufw allow "$APP_PORT/tcp" >/dev/null
  fi
fi

# ─── 10. Bootstrap admin (only if not present) ───

ADMIN_EXISTS=$(PGPASSWORD="$NEW_DB_PW" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT 1 FROM \"Player\" WHERE email = '$ADMIN_EMAIL' LIMIT 1" 2>/dev/null || echo "")

if [[ "$ADMIN_EXISTS" == "1" ]]; then
  warn "Admin $ADMIN_EMAIL already exists — skipping bootstrap."
  warn "To reset their password: log in as another admin or use: sudo -u $APP_USER psql \$DATABASE_URL"
else
  log "Bootstrapping admin $ADMIN_EMAIL"
  sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && pnpm bootstrap:admin '$ADMIN_EMAIL' '$ADMIN_NAME'"
fi

# ─── 11. Smoke test ───

log "Smoke test"
sleep 1
curl -fsS -o /dev/null -w "  Local HTTP (127.0.0.1:$APP_PORT): %{http_code}\n" \
  "http://127.0.0.1:$APP_PORT/login" \
  || warn "Local HTTP check failed — journalctl -u $SERVICE_NAME"

if [[ "$DEPLOY_MODE" == "ip" ]]; then
  curl -fsS -o /dev/null -w "  Public HTTP (http://$VPS_IP:$APP_PORT): %{http_code}\n" \
    "http://$VPS_IP:$APP_PORT/login" \
    || warn "Public HTTP check failed — check firewall / provider firewall"
fi

log "✓ Provisioning complete"
printf '\n'
if [[ "$DEPLOY_MODE" == "domain" ]]; then
  printf '  App URL:  https://%s/login\n' "$DOMAIN"
else
  printf '  App URL:  http://%s:%s/login\n' "$VPS_IP" "$APP_PORT"
fi
printf '  Admin:    %s\n' "$ADMIN_EMAIL"
printf '  Logs:     journalctl -u %s -f\n' "$SERVICE_NAME"
printf '  Redeploy: sudo -u %s %s/scripts/deploy.sh\n\n' "$APP_USER" "$APP_DIR"
