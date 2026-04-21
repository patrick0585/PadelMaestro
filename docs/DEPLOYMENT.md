# VPS Deployment

This guide deploys Padel Tracker to a single Linux VPS as a native Node.js service behind Caddy, with Postgres running on the same host. Targeted at a small, single-instance install (≤50 users).

If you prefer a fully containerized stack, see [Alternative: Docker Compose](#alternative-docker-compose) at the end.

---

## 1. Assumptions

- VPS with root / sudo access (Debian 12 or Ubuntu 24.04 LTS recommended)
- Public DNS record pointing to the VPS (e.g. `padel.example.com`)
- Port 80 and 443 open (UFW or provider firewall)

---

## 2. Prepare the server

### 2.1 Create a non-root app user

```bash
sudo adduser --system --group --home /srv/padel padel
sudo mkdir -p /srv/padel/app /srv/padel/logs
sudo chown -R padel:padel /srv/padel
```

### 2.2 Install Node 22, pnpm, Postgres 16, Caddy

```bash
# Node 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm (global)
sudo corepack enable
sudo corepack prepare pnpm@10.13.1 --activate

# Postgres 16
sudo apt-get install -y postgresql postgresql-contrib

# Caddy (auto-TLS reverse proxy)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

### 2.3 Firewall (optional but recommended)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 3. Set up Postgres

### 3.1 Create database + user

Generate a strong password first (save it — you need it in `.env`):

```bash
openssl rand -base64 24
```

Then:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER padel WITH PASSWORD '<paste-generated-password>';
CREATE DATABASE padel_tracker OWNER padel;
GRANT ALL PRIVILEGES ON DATABASE padel_tracker TO padel;
SQL
```

### 3.2 Local-only access

Postgres on Debian/Ubuntu binds to `localhost` by default — no changes needed. Do NOT open 5432 on the firewall.

---

## 4. Deploy the app

### 4.1 Clone

```bash
sudo -u padel -H bash -c '
  cd /srv/padel/app
  git clone <your-repo-url> .
'
```

### 4.2 Create `.env`

```bash
sudo -u padel -H bash -c '
  cd /srv/padel/app
  cp .env.example .env
  # Generate AUTH_SECRET:
  echo "AUTH_SECRET=\"$(openssl rand -base64 32)\"" >> .env.tmp
  cat .env.tmp
'
```

Edit `/srv/padel/app/.env` manually. It must contain:

```env
DATABASE_URL="postgresql://padel:<password-from-step-3.1>@localhost:5432/padel_tracker?schema=public"
AUTH_SECRET="<openssl-rand-base64-32-output>"
AUTH_URL="https://padel.example.com"
AUTH_TRUST_HOST="true"
NODE_ENV="production"
```

> `AUTH_TRUST_HOST=true` is required when next-auth runs behind Caddy. Without it sign-in fails with a host-mismatch error.

### 4.3 Install, migrate, build

```bash
sudo -u padel -H bash -c '
  cd /srv/padel/app
  pnpm install --frozen-lockfile
  pnpm prisma migrate deploy
  pnpm prisma generate
  pnpm build
'
```

`pnpm build` produces `.next/standalone/` (a minimal Node bundle) plus `.next/static/` and `public/`.

### 4.4 Bootstrap the first admin

```bash
sudo -u padel -H bash -c '
  cd /srv/padel/app
  pnpm bootstrap:admin you@example.com "Your Name"
'
```

The script prints a one-time password. Save it — you need it for the first login.

---

## 5. Run the app as a systemd service

Create `/etc/systemd/system/padel.service`:

```ini
[Unit]
Description=Padel Tracker (Next.js)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=padel
Group=padel
WorkingDirectory=/srv/padel/app
EnvironmentFile=/srv/padel/app/.env
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node .next/standalone/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/srv/padel/logs/app.log
StandardError=append:/srv/padel/logs/app.err.log

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/srv/padel/logs /srv/padel/app/.next

[Install]
WantedBy=multi-user.target
```

Next.js' standalone server does NOT copy `public/` or `.next/static/`. Symlink them so the standalone server finds them:

```bash
sudo -u padel ln -sfn /srv/padel/app/public /srv/padel/app/.next/standalone/public
sudo -u padel ln -sfn /srv/padel/app/.next/static /srv/padel/app/.next/standalone/.next/static
```

Start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now padel
sudo systemctl status padel
```

Check it's listening on `127.0.0.1:3000`:

```bash
curl -I http://127.0.0.1:3000
# Expected: HTTP/1.1 200 (or 307 redirect to /login)
```

---

## 6. Caddy reverse proxy with auto-TLS

Replace `/etc/caddy/Caddyfile`:

```
padel.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000

    # Security headers
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
```

Reload Caddy:

```bash
sudo systemctl reload caddy
sudo journalctl -u caddy -f   # watch TLS cert issuance
```

Caddy fetches a Let's Encrypt cert automatically on first request. Visit `https://padel.example.com/login` — you should see the sky-blue login card.

Log in with the admin email + the password printed in step 4.4.

---

## 7. Updates (redeploy flow)

```bash
sudo -u padel -H bash -c '
  cd /srv/padel/app
  git pull --ff-only
  pnpm install --frozen-lockfile
  pnpm prisma migrate deploy
  pnpm build
'

# Refresh the standalone symlinks if static chunks changed
sudo -u padel ln -sfn /srv/padel/app/.next/static /srv/padel/app/.next/standalone/.next/static

sudo systemctl restart padel
```

A restart takes ~1–2 seconds; active sessions stay valid (JWT cookies).

---

## 8. Backups

### 8.1 Daily `pg_dump` via cron

```bash
sudo -u postgres crontab -e
```

Add:

```
0 3 * * * pg_dump padel_tracker | gzip > /var/backups/padel-$(date +\%F).sql.gz && find /var/backups -name 'padel-*.sql.gz' -mtime +30 -delete
```

### 8.2 Restore (disaster recovery)

```bash
gunzip -c /var/backups/padel-2026-04-21.sql.gz \
  | sudo -u postgres psql padel_tracker
```

---

## 9. Operational notes

- **Logs:** `journalctl -u padel -f` for systemd-captured output; `/srv/padel/logs/` for file-logged output.
- **DB console:** `sudo -u padel psql $DATABASE_URL` (reads the VPS `.env`; confirm with `source /srv/padel/app/.env && psql $DATABASE_URL`).
- **Change your admin password:** currently there is no in-app "change my password" UI. Use the admin "Passwort" button on your own row, or bootstrap a second admin and reset via the API.
- **Monitoring:** the app has no health endpoint yet. A simple probe: `curl -fs https://padel.example.com/login > /dev/null || alert`.
- **Secret rotation:** rotating `AUTH_SECRET` invalidates all active sessions. Do it only during a maintenance window.

---

## Alternative: Docker Compose

If you'd rather not maintain Node + Postgres on the host directly, see the dev compose file (`docker-compose.dev.yml`) as a starting point. A production `docker-compose.yml` would need:

- An app service built from a multi-stage Dockerfile (install → build → copy `.next/standalone` + `public` + `.next/static` to a slim runtime stage)
- A Postgres service with a named volume
- A Caddy service with its own volume for TLS certs
- `env_file: .env`
- `depends_on` with a Postgres healthcheck

This repo does not yet ship a Dockerfile or production compose file. If you want that path, open an issue / ask and we'll add one.

---

## 10. First-login smoke checklist

After the first deploy, verify on the real domain:

1. `https://padel.example.com/login` renders the sky-blue card, TLS cert is valid.
2. Log in with bootstrap admin → redirected to `/ranking`.
3. Bottom-tab navigation works on mobile viewport; top-nav on desktop.
4. Admin → Spieler hinzufügen creates a player; the new player can log in.
5. Admin → Passwort resets the password; the new password works.
6. Create a game day → attendance toggles → start → enter a match score.

If any step fails: `journalctl -u padel -n 200 --no-pager`.
