#!/usr/bin/env bash
# Redeploy Padel Tracker on the VPS.
# Run as the `padel` user from /srv/padel/app.
# Idempotent — safe to re-run.

set -euo pipefail

APP_DIR="${APP_DIR:-/srv/padel/app}"
SERVICE="${SERVICE:-padel}"

cd "$APP_DIR"

if [[ "$(whoami)" != "padel" ]]; then
  echo "This script must run as the padel user (got $(whoami))." >&2
  exit 1
fi

echo "==> Pulling latest main"
git fetch --tags
git checkout main
git pull --ff-only

echo "==> Installing dependencies (frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> Applying database migrations"
pnpm prisma migrate deploy

echo "==> Generating Prisma client"
pnpm prisma generate

echo "==> Building Next.js"
pnpm build

echo "==> Refreshing standalone symlinks"
ln -sfn "$APP_DIR/public"       "$APP_DIR/.next/standalone/public"
ln -sfn "$APP_DIR/.next/static" "$APP_DIR/.next/standalone/.next/static"

echo "==> Restarting ${SERVICE} service"
sudo -n /bin/systemctl restart "$SERVICE"

echo "==> Waiting for service to settle"
sleep 2
sudo -n /bin/systemctl is-active "$SERVICE"

echo "==> Checking HTTP reachability"
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:3000/login || {
  echo "Local health check failed — run: journalctl -u $SERVICE -n 50 --no-pager" >&2
  exit 1
}

echo "==> Deployment complete"
