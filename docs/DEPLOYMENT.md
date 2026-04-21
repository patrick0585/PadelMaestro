# VPS Deployment Runbook

Deploy Padel Tracker to a single Debian 12 / Ubuntu 24.04 VPS with system Postgres, systemd, and Caddy for auto-TLS. Follow sections in order. Every command block is copy-paste ready — only the values in `<angle brackets>` need substitution.

**Substitutions you will need throughout:**

| Placeholder | Example | Where to get it |
|---|---|---|
| `<DOMAIN>` | `padel.example.com` | Your DNS record pointing at the VPS |
| `<DB_PASSWORD>` | — | Generate in step 3.1 |
| `<AUTH_SECRET>` | — | Generate in step 4.2 |
| `<ADMIN_EMAIL>` | `you@example.com` | Your login email |
| `<ADMIN_NAME>` | `"Your Name"` | Displayed in the UI |

After initial deployment, subsequent updates are a single command: `sudo -u padel /srv/padel/app/scripts/deploy.sh`. See [Section 8](#8-ongoing-updates).

---

## Prerequisites

- SSH access to the VPS (as `root` or with `sudo`)
- DNS A/AAAA record for `<DOMAIN>` pointing at the VPS public IP
- Ports 80 and 443 open on the provider firewall

---

## 1. Create app user and directories

Run as root (or with sudo).

```bash
sudo adduser --system --group --home /srv/padel padel
sudo mkdir -p /srv/padel/logs
sudo chown padel:padel /srv/padel/logs
```

---

## 2. Install Node 22, pnpm, Postgres 16, Caddy

```bash
# Node 22 from NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# pnpm via corepack
sudo corepack enable
sudo corepack prepare pnpm@10.13.1 --activate

# Postgres 16
sudo apt-get install -y postgresql postgresql-contrib

# Caddy
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo apt-get update
sudo apt-get install -y caddy
```

**Firewall (optional but recommended):**

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

---

## 3. Create database and user

### 3.1 Generate `<DB_PASSWORD>`

```bash
openssl rand -hex 24
```

Copy the output. You will paste it twice: once into psql, once into `.env`.

> **Use `-hex`, not `-base64`.** Base64 output can contain `+`, `/`, and `@`, which break the `DATABASE_URL` connection string without URL-encoding. Hex is URL-safe.

### 3.2 Create the role and database

```bash
sudo -u postgres psql <<SQL
CREATE USER padel WITH PASSWORD '<DB_PASSWORD>';
CREATE DATABASE padel_tracker OWNER padel;
GRANT ALL PRIVILEGES ON DATABASE padel_tracker TO padel;
SQL
```

Expected output: `CREATE ROLE`, `CREATE DATABASE`, `GRANT`.

---

## 4. Clone and configure the app

### 4.1 Clone the repo

```bash
sudo -u padel -H git clone https://github.com/patrick0585/padel-tracker.git /srv/padel/app
```

### 4.2 Generate `<AUTH_SECRET>`

```bash
openssl rand -base64 32
```

Copy the output.

### 4.3 Create `.env`

> **Replace all three placeholders below before running the block.** The heredoc does not do substitution for you — if you paste it verbatim, `.env` will literally contain the strings `<DB_PASSWORD>`, `<AUTH_SECRET>`, and `<DOMAIN>`, and every database/auth call will fail.

```bash
sudo tee /srv/padel/app/.env > /dev/null <<ENV
DATABASE_URL="postgresql://padel:<DB_PASSWORD>@localhost:5432/padel_tracker?schema=public"
AUTH_SECRET="<AUTH_SECRET>"
AUTH_URL="https://<DOMAIN>"
AUTH_TRUST_HOST="true"
NODE_ENV="production"
ENV
sudo chown padel:padel /srv/padel/app/.env
sudo chmod 600 /srv/padel/app/.env

# Verify no placeholders remain:
sudo grep -E '<[A-Z_]+>' /srv/padel/app/.env && echo "❌ placeholders still present" || echo "✅ .env clean"
```

`AUTH_TRUST_HOST=true` is required because next-auth sits behind Caddy.

### 4.4 Install, migrate, build

```bash
sudo -u padel -H bash -c '
  cd /srv/padel/app
  pnpm install --frozen-lockfile
  pnpm prisma migrate deploy
  pnpm prisma generate
  pnpm build
'
```

The build takes 30-60 seconds and produces `.next/standalone/server.js`.

### 4.5 Create the standalone symlinks

Next.js' standalone output does not include `public/` or `.next/static/` — symlink them.

```bash
sudo -u padel ln -sfn /srv/padel/app/public       /srv/padel/app/.next/standalone/public
sudo -u padel ln -sfn /srv/padel/app/.next/static /srv/padel/app/.next/standalone/.next/static
```

### 4.6 Bootstrap the first admin user

```bash
sudo -u padel -H bash -c '
  cd /srv/padel/app
  pnpm bootstrap:admin <ADMIN_EMAIL> <ADMIN_NAME>
'
```

The script prints a one-time password. **Copy it now** — it is only shown once.

---

## 5. Create the systemd service

### 5.1 Service unit

```bash
sudo tee /etc/systemd/system/padel.service > /dev/null <<'UNIT'
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
UNIT
```

### 5.2 Allow the padel user to restart itself (for `deploy.sh`)

```bash
sudo tee /etc/sudoers.d/padel-restart > /dev/null <<'SUDO'
padel ALL=(root) NOPASSWD: /bin/systemctl restart padel, /bin/systemctl is-active padel
SUDO
sudo chmod 440 /etc/sudoers.d/padel-restart
```

### 5.3 Start it

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now padel
sudo systemctl status padel --no-pager
curl -I http://127.0.0.1:3000/login
```

Expected: `active (running)` and `HTTP/1.1 200 OK`.

---

## 6. Configure Caddy (TLS + reverse proxy)

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'CADDY'
<DOMAIN> {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000

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
sudo sed -i "s/<DOMAIN>/<DOMAIN>/g" /etc/caddy/Caddyfile   # substitutes the placeholder
sudo systemctl reload caddy
sudo journalctl -u caddy -n 30 --no-pager
```

Caddy fetches a Let's Encrypt cert automatically on the first request (~10 seconds). Tail the journal if something looks off.

---

## 7. Smoke test

Open `https://<DOMAIN>/login` in a browser. Expect:

- Valid TLS certificate (padlock icon)
- Sky-blue login card
- After login with `<ADMIN_EMAIL>` + bootstrap password → redirect to `/ranking`
- Admin tab (⚙️) visible in the bottom-nav
- Spieler → "Spieler hinzufügen" works, new player appears in the list

If any step fails: `sudo journalctl -u padel -n 100 --no-pager`.

---

## 8. Ongoing updates

From then on, every redeploy is:

```bash
sudo -u padel /srv/padel/app/scripts/deploy.sh
```

The script (`scripts/deploy.sh` in the repo) does exactly this:

1. `git pull --ff-only` on `main`
2. `pnpm install --frozen-lockfile`
3. `pnpm prisma migrate deploy`
4. `pnpm build`
5. Refresh the standalone symlinks
6. `sudo systemctl restart padel` (allowed by the sudoers rule in 5.2)
7. Curl `/login` as a smoke check

If any step fails the script exits non-zero and the service stays on the previous build (no broken restart).

---

## 9. Backups

### 9.1 Daily `pg_dump` via cron

```bash
sudo mkdir -p /var/backups/padel
sudo chown postgres:postgres /var/backups/padel
sudo -u postgres crontab -l 2>/dev/null > /tmp/pgcron || true
echo '0 3 * * * pg_dump padel_tracker | gzip > /var/backups/padel/dump-$(date +\%F).sql.gz && find /var/backups/padel -name "dump-*.sql.gz" -mtime +30 -delete' >> /tmp/pgcron
sudo -u postgres crontab /tmp/pgcron
rm /tmp/pgcron
```

### 9.2 Restore

```bash
gunzip -c /var/backups/padel/dump-YYYY-MM-DD.sql.gz \
  | sudo -u postgres psql padel_tracker
```

---

## 10. Operations cheat sheet

| Task | Command |
|---|---|
| Service logs | `sudo journalctl -u padel -f` |
| App file logs | `sudo tail -f /srv/padel/logs/app.log` |
| Caddy logs | `sudo journalctl -u caddy -f` |
| DB console | `sudo -u padel psql $DATABASE_URL` |
| Restart app | `sudo systemctl restart padel` |
| Reload Caddy | `sudo systemctl reload caddy` |
| Run ad-hoc migration | `sudo -u padel -H bash -c 'cd /srv/padel/app && pnpm prisma migrate deploy'` |
| Rotate `AUTH_SECRET` | Edit `.env`, `sudo systemctl restart padel`. **Invalidates all sessions.** |

---

## Troubleshooting

**`padel.service` fails with `EACCES` writing to `.next/`:**
`ReadWritePaths` in the unit lists `/srv/padel/app/.next`. Ensure the path exists and is owned by `padel`. If the symlink target disappeared, rerun step 4.5.

**Login redirects to `/` instead of `/ranking`:**
`AUTH_URL` does not match the browser URL. Edit `.env`, confirm no trailing slash, `systemctl restart padel`.

**"Invalid host" on login:**
`AUTH_TRUST_HOST=true` is missing from `.env`. Add it, restart.

**Caddy says "TLS handshake error" in the journal:**
Wait 60 seconds — Let's Encrypt retries. If it keeps failing, DNS is likely not pointing at the VPS yet (`dig +short <DOMAIN>`).

**Migrations fail with `P1001` (cannot reach database):**
Postgres is not running, or `DATABASE_URL` has the wrong password. `sudo systemctl status postgresql` and re-paste from step 3.

**"Authentication failed against database server" during migrate or bootstrap-admin:**
Either the `<DB_PASSWORD>` placeholder in `.env` was never replaced, or the password contains URL-unsafe characters. Check first:

```bash
sudo grep -E '<[A-Z_]+>' /srv/padel/app/.env   # should print nothing
sudo -u padel -H bash -c 'set -a; source /srv/padel/app/.env; set +a; psql "$DATABASE_URL" -c "\\dt"'
```

To reset cleanly with a URL-safe hex password:

```bash
NEW_PW=$(openssl rand -hex 24)
sudo -u postgres psql -c "ALTER USER padel WITH PASSWORD '$NEW_PW';"
sudo sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://padel:${NEW_PW}@localhost:5432/padel_tracker?schema=public\"|" /srv/padel/app/.env
```
