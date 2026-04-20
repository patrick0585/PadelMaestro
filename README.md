# Padel Tracker

Webapp that replaces the group's paper scoresheets and XLSX ranking for Tuesday-night padel sessions. Supports 4, 5, or 6 players with balanced pairing schedules and a season-long ranking with Joker mechanics.

## Tech Stack

- Next.js 15 + React 19 + TypeScript
- Tailwind CSS 4
- Prisma + PostgreSQL 16
- Auth.js v5 (credentials)
- Vitest for unit + integration tests

## Prerequisites

- Node.js 22 LTS
- pnpm 9+
- Docker + Docker Compose

## Local Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Copy env template and fill in secrets:
   ```bash
   cp .env.example .env
   # Generate AUTH_SECRET: openssl rand -base64 32
   ```

3. Start local Postgres:
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

4. Run migrations:
   ```bash
   pnpm db:migrate
   ```

5. Create the first admin:
   ```bash
   pnpm bootstrap:admin you@example.com "Your Name"
   ```
   Note the printed password.

6. Start the dev server:
   ```bash
   pnpm dev
   ```

7. Open http://localhost:3000 and log in.

## Common Tasks

- Run all tests: `pnpm test`
- Watch tests: `pnpm test:watch`
- Reset DB: `pnpm db:reset`
- Regenerate Prisma client: `pnpm db:generate`
- Import historical data: `pnpm import:historical <path.json>` (see `docs/import-historical.md`)

## Project Layout

- `prisma/` — database schema + migrations
- `src/app/` — Next.js App Router pages + API routes
- `src/lib/` — pure logic (pairings, match, ranking, joker, auth helpers)
- `src/components/` — shared UI
- `tests/unit/` — pure-logic tests (Vitest)
- `tests/integration/` — DB-backed tests (Vitest + Docker Postgres)
- `scripts/` — one-off CLI scripts
- `docs/superpowers/` — design spec + implementation plans

## Phase 1 Scope (MVP)

- Invitation-based login, password auth
- Attendance coordination per game day
- Balanced pairing generation for 4/5/6 players
- Match score entry with optimistic locking + 2-minute undo
- Season ranking with points-per-game sort
- Joker mechanic (2 per season, ppg snapshot)
- Admin panel for player invitations + game-day lifecycle

Phase 2 (Telegram bot + realtime) and Phase 3 (PWA, extended stats, deployment) follow in separate plans.
