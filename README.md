<div align="center">
  <img src="public/icons/icon-192.png" alt="Padelmaestro" width="96" height="96" />
  <h1>Padelmaestro</h1>
  <p>
    <strong>The web app that runs your Tuesday-night padel sessions.</strong><br/>
    Replaces the paper scoresheets and the XLSX ranking with a live, mobile-first PWA — balanced pairings, real-time scoring, season-long ranking with a Joker mechanic.
  </p>
  <p>
    <img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-000?logo=next.js" />
    <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white" />
    <img alt="Tailwind CSS 4" src="https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss&logoColor=white" />
    <img alt="Prisma" src="https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white" />
    <img alt="PostgreSQL 16" src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white" />
    <img alt="Auth.js v5" src="https://img.shields.io/badge/Auth.js-v5-7C3AED" />
    <img alt="Vitest" src="https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest&logoColor=white" />
    <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5A0FC8" />
  </p>
</div>

---

## What it does

A live game-day flow for 4–6 players. The admin opens a session, players confirm or pick a Joker before the deadline, the schedule generator builds a balanced 10–15 match plan, and everyone enters scores from their phone in real time. After the day is finished, the app shows the podium, the leaderboard, and how often each pair partnered as a team.

## Highlights

| | |
|:--|:--|
| 🏆 **Live game day** with SSE updates — no manual reload, every score lands on every phone within ~1 s | 📊 **Season ranking** sorted by points-per-game, with three medals on the season podium and per-day medals in the dashboard |
| 🃏 **Joker** mechanic with PPG-snapshot — 2 per season, locked once the roster locks | 🤝 **Partner-frequency view** on every finished day to surface fairness of pairing distribution |
| 📱 **Installable PWA** — Add-to-Home-Screen banner on iOS Safari, native install prompt on Chromium | 🔐 **Auth.js v5 credentials** with bcrypt password hashing, optimistic locking on score writes |
| 🖨️ **Printable scoresheet** for the admin in case the venue Wi-Fi is down | 📥 **Historical importer** to migrate years of XLSX data into a clean Postgres season |

## Screenshots

<table>
<tr>
  <td align="center" width="50%">
    <img src="docs/screenshots/dashboard-desktop.png" alt="Dashboard" /><br/>
    <sub><b>Dashboard</b> — next game day, your attendance, the season-progress card</sub>
  </td>
  <td align="center" width="50%">
    <img src="docs/screenshots/game-day-in-progress-desktop.png" alt="Game day in progress" /><br/>
    <sub><b>Game day in progress</b> — live tagesranking banner, match cards with inline score entry</sub>
  </td>
</tr>
<tr>
  <td align="center" width="50%">
    <img src="docs/screenshots/finished-day-desktop.png" alt="Finished game day" /><br/>
    <sub><b>Finished day</b> — podium, full leaderboard, partner-frequency bars, every match</sub>
  </td>
  <td align="center" width="50%">
    <img src="docs/screenshots/ranking-desktop.png" alt="Season ranking" /><br/>
    <sub><b>Season ranking</b> — points-per-game leaderboard with medals and Joker hints</sub>
  </td>
</tr>
</table>

### On mobile

<table>
<tr>
  <td align="center"><img src="docs/screenshots/dashboard-mobile.png" alt="Dashboard mobile" width="240" /></td>
  <td align="center"><img src="docs/screenshots/game-day-in-progress-mobile.png" alt="Game day mobile" width="240" /></td>
  <td align="center"><img src="docs/screenshots/finished-day-mobile.png" alt="Finished day mobile" width="240" /></td>
  <td align="center"><img src="docs/screenshots/ranking-mobile.png" alt="Ranking mobile" width="240" /></td>
</tr>
</table>

## Tech stack

- **Next.js 15** App Router with React 19 server components
- **TypeScript** with strict mode and zero `any`
- **Tailwind CSS 4** with custom design tokens
- **Prisma 6** on **PostgreSQL 16**
- **Auth.js v5** (credentials provider, JWT sessions)
- **In-process SSE** pub/sub for live game-day updates (single-Node deploy; swappable for Redis pub/sub if we ever scale out)
- **Vitest 4** for unit + integration tests, **Playwright** for end-to-end multi-user scenarios

## Quick start

You will need **Node.js 22 LTS**, **pnpm 9+**, and **Docker** for local Postgres.

```bash
# 1. Install dependencies
pnpm install

# 2. Local env (copy and fill in AUTH_SECRET via `openssl rand -base64 32`)
cp .env.example .env

# 3. Postgres
docker compose -f docker-compose.dev.yml up -d
pnpm db:migrate

# 4. Bootstrap your first admin (prints a temporary password)
pnpm bootstrap:admin you@example.com "Your Name"

# 5. (Optional) seed five demo players to play with
pnpm seed:demo

# 6. Start the dev server
pnpm dev
```

Open <http://localhost:3000> and log in.

## Common tasks

```bash
pnpm test                 # full Vitest suite (unit + integration)
pnpm test:watch           # watch mode
pnpm lint                 # next lint
pnpm e2e                  # multi-user Playwright driver (needs E2E_ADMIN_EMAIL/PASSWORD env)
pnpm db:reset             # nuke and reseed the local DB
pnpm import:historical    # import a years-old XLSX into a clean season (see docs/import-historical.md)
```

## Project layout

```
prisma/                  schema + migrations
src/app/                 App Router pages and route handlers
src/lib/                 pure logic — pairings, match validation, ranking, joker, auth
src/components/          shared UI (BottomTabs, Avatar, Stepper, …)
tests/unit/              pure-logic tests (Vitest, no DB)
tests/integration/       DB-backed tests (Vitest + Docker Postgres)
tests/e2e/               multi-user Playwright driver
scripts/                 one-off CLI helpers (seed, bootstrap, import)
docs/                    deployment notes, onboarding HTML, design specs
```

## Roadmap

- [x] Phase 1 — invitation + password auth, attendance, balanced pairings, score entry with optimistic locking, season ranking, Joker (2/season, PPG snapshot)
- [x] Phase 2 — live SSE updates, printable scoresheet, extra-match flow
- [x] Phase 3 — installable PWA (manifest, icons, install banner), partner-frequency view
- [ ] Pairing template generator that maximizes partner-coverage fairness within a single day
- [ ] Telegram bot for attendance reminders
- [ ] Per-player long-term stats page (head-to-head, partner affinity, joker history)

## License

Private. Not licensed for public reuse.
