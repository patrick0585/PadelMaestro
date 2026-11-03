# VPS Deployment Runbook

Deploy Padel Tracker to a single Debian 12 / Ubuntu 24.04 VPS with system Postgres, systemd, and Caddy for auto-TLS.

## Fast path: one-shot provisioning script

If you just want it running, skip the manual steps and use `scripts/provision-vps.sh`. It handles everything in sections 1-7 below, plus the admin bootstrap and firewall. Supports both a domain (Caddy + Let's Encrypt) and a plain IP:port mode (HTTP only, for preview/testing).

```bash
# Fetch the repo first
sudo git clone https://github.com/patrick0585/padel-tracker.git /tmp/padel-bootstrap
sudo bash /tmp/padel-bootstrap/scripts/provision-vps.sh
```

The script prompts for admin email, display name, and either a domain or an IP + port. It is idempotent — safe to re-run if the first attempt fails partway. Set `FORCE=1` to rotate secrets on a re-run.

Non-interactive example (IP mode):

```bash
sudo ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" \
     DEPLOY_MODE=ip VPS_IP=203.0.113.5 APP_PORT=8080 \
     bash /tmp/padel-bootstrap/scripts/provision-vps.sh
```

When the script finishes, it prints the URL to log in at and the admin bootstrap password. Save the password — it is only shown once.

The manual steps below are the same work, broken out for the case where you want fine control or the script fails at a specific stage.

---

## Manual path

Follow sections in order. Every command block is copy-paste ready — only the values in `<angle brackets>` need substitution.

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
MAIL_TRANSPORT="console"
MAIL_FROM="Padelmaestro <noreply@padelmaestro.de>"
RESEND_API_KEY=""
APP_URL="https://<DOMAIN>"
ENV
sudo chown padel:padel /srv/padel/app/.env
sudo chmod 600 /srv/padel/app/.env

# Verify no placeholders remain:
sudo grep -E '<[A-Z_]+>' /srv/padel/app/.env && echo "❌ placeholders still present" || echo "✅ .env clean"
```

`AUTH_TRUST_HOST=true` is required because next-auth sits behind Caddy.

Mail variables: `MAIL_TRANSPORT` is mandatory in production (`resend` or `console`; `memory` is rejected). With `console`, mails are only written to the journal as `[mail]` lines, so nothing is delivered. Switch to `resend` after section 11. `APP_URL` is the base for links in mails and falls back to `AUTH_URL`.

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

The first admin becomes the owner of the group "Padelmaestro"; any admin bootstrapped later is a plain admin. To hand the owner role to someone else, run `pnpm tenancy:set-owner <EMAIL>` the same way (the previous owner becomes admin).

Every multi-tenancy migration (PR 1, 2, 4 and 6; PR 3 and 5 had no migration) was rehearsed against a production dump; see `docs/superpowers/plans/2026-11-02-tenancy-pr*-rehearsal.md` for the protocols. Migrations that drop columns (PR 6) need the service stopped during the deploy, see the PR 6 rehearsal doc.

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

**Env changes.** `deploy.sh` does not touch `.env`. If a release needs new variables, edit `/srv/padel/app/.env` *before* running it. The mail release (migration only adds columns/tables, no downtime needed) requires `MAIL_TRANSPORT=console` (or `resend`) in `.env` first: without it the service refuses to start (check in `src/instrumentation.ts`) and the restart fails.

---

## 9. Backups

### 9.1 Daily `pg_dump` via systemd timer

The repo ships the backup as a script plus a systemd service/timer in
`scripts/backup/`. The timer runs `pg_dump -Fc` as user `postgres` every
night at 03:15 into `/var/backups/padel/` and keeps 30 days of dumps.
Each run verifies the dump with `pg_restore --list` before it replaces
the previous one.

Install (or update) from your machine:

```bash
ssh root@<host> 'mkdir -p /root/padel-backup'
scp scripts/backup/padel-db-backup.{sh,service,timer} scripts/backup/install.sh root@<host>:/root/padel-backup/
ssh root@<host> 'bash /root/padel-backup/install.sh'
```

`install.sh` is idempotent: it copies the files, enables the timer, runs
one backup immediately as a smoke test and prints the timer status plus
the directory listing.

Check it later:

```bash
systemctl list-timers 'padel-db-backup*'
journalctl -u padel-db-backup.service -n 5 --no-pager
ls -lh /var/backups/padel
```

### 9.2 Restore

Dumps are in `pg_dump` custom format. Restore into the existing database
(stop the app first so no writes race the restore; `--role=padel` makes the
restored objects belong to the app role instead of `postgres`):

```bash
sudo systemctl stop padel
sudo -u postgres pg_restore --clean --if-exists --no-owner --no-acl --role=padel \
  -d padel_tracker /var/backups/padel/padel_tracker-YYYY-MM-DD_HHMM.dump
sudo systemctl start padel
```

### 9.3 Offsite copy

The dumps live on the VPS disk only. Before the app accepts data from
groups outside the original one, a nightly copy to an external storage
(rclone to an S3-compatible bucket or a Hetzner Storage Box) has to be
added. Provider and credentials are still to be decided; the script's
output directory is the source for that sync.

---

## 9.4 Keep Postgres out of unattended-upgrades

Ubuntu's `unattended-upgrades` will silently update `postgresql-*` packages overnight, which restarts Postgres and severs every active connection (`E57P01: terminating connection due to administrator command`). Symptom in the app: every JWT renewal that happens during the restart fails, and users get logged out.

Two steps. First, confirm whether this is what's happening:

```bash
sudo journalctl -u postgresql --since '7 days ago' | grep -iE 'restart|stopped|received'
sudo journalctl -u unattended-upgrades --since '7 days ago' | grep -i postgres
```

If you see Postgres receiving a stop signal followed by an unattended-upgrades log line for a `postgresql-*` package, blacklist it:

```bash
# Both keys are written: "Package-Blacklist" is the historic name (Ubuntu
# 20.04 and earlier), "Package-Block-List" is the renamed key on 22.04+.
# Either one is silently ignored by the version that doesn't recognise it,
# so writing both is safe and keeps the file portable across releases.
sudo tee /etc/apt/apt.conf.d/52padel-blacklist > /dev/null <<'APT'
Unattended-Upgrade::Package-Blacklist {
    "postgresql";
    "postgresql-.*";
};
Unattended-Upgrade::Package-Block-List {
    "postgresql";
    "postgresql-.*";
};
APT
sudo unattended-upgrade --dry-run --debug 2>&1 | grep -iE 'postgresql|skip' | head
```

The dry-run should now print `Skipping … postgresql…` for every Postgres package. From this point onward, Postgres updates need to be applied manually with a maintenance window:

```bash
sudo apt-get update
sudo apt-get install --only-upgrade postgresql postgresql-16
sudo systemctl restart padel   # reconnect the app to the freshly-restarted Postgres
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

## 11. Mail (Resend)

Transactional mails (address confirmation, password reset, change notice) go out through Resend. The production domain is `padelmaestro.de`, DNS at IONOS. The existing IONOS mailbox (MX `mx00.ionos.de` / `mx01.ionos.de`, SPF `v=spf1 include:_spf-eu.ionos.com ~all`) must stay untouched.

1. In the Resend dashboard, add the domain `padelmaestro.de`. Choose the EU region if offered.
2. Resend shows the DNS records to create. Typically these are on a subdomain (e.g. `send.padelmaestro.de`: one MX and one SPF TXT) plus a DKIM TXT at `resend._domainkey.padelmaestro.de`. Use the exact values from the dashboard.
3. In IONOS DNS, add only those records. Do not edit or replace the existing root MX or root SPF records.
4. Click "Verify" in Resend and wait until the domain shows as verified (DNS propagation can take a while).
5. Create an API key in Resend and set in `/srv/padel/app/.env`:
   ```
   MAIL_TRANSPORT="resend"
   RESEND_API_KEY="<key from Resend>"
   ```
   `MAIL_FROM` defaults to `Padelmaestro <noreply@padelmaestro.de>` and must use the verified domain.
6. `sudo systemctl restart padel`
7. Test: on the profile page click "Mail erneut senden" and check the inbox.
8. On problems: `sudo journalctl -u padel -n 100 --no-pager | grep '\[mail\]'`.

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
