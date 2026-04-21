# UI Redesign & Admin User Management — Design Spec

**Status:** Approved
**Date:** 2026-04-20
**Branch target:** `feature/ui-redesign` (from `feature/phase-1-mvp`)

## Goal

Replace the current dark-auto theme with a light-only, modern, mobile-first UI in a soft Sky-Blue palette. Introduce a bottom-tab navigation on mobile and a top-navigation on desktop. Replace the invitation-link signup flow with direct admin-driven user creation (email + password), plus password-reset from the admin panel.

## Non-Goals

- Dark-mode toggle (explicitly out of scope — light only)
- User self-service password change (admin-driven only in this phase)
- Admin-flag toggle / user deactivation / user deletion (deferred; create-only + password-reset now)
- Screenshot / visual regression tests (manual smoke test remains the gate)
- Visual overhaul of `scripts/import-historical.ts` flow beyond an info card in admin

## Visual System

### Color Tokens

Wired into Tailwind v4 via `@theme inline` in `src/app/globals.css`. Replaces the current HSL-based tokens and removes the `@media (prefers-color-scheme: dark)` block entirely.

| Role | Token | Hex |
|---|---|---|
| Primary | `--color-primary` | `#0ea5e9` (Sky-500) |
| Primary Hover | `--color-primary-hover` | `#0284c7` (Sky-600) |
| Primary Soft | `--color-primary-soft` | `#f0f9ff` (Sky-50) |
| Primary Border | `--color-primary-border` | `#bae6fd` (Sky-200) |
| Foreground | `--color-foreground` | `#0f172a` (Slate-900) |
| Muted Foreground | `--color-muted-foreground` | `#64748b` (Slate-500) |
| Background | `--color-background` | `#ffffff` |
| Surface | `--color-surface` | `#ffffff` |
| Surface Muted | `--color-surface-muted` | `#f8fafc` (Slate-50) |
| Border | `--color-border` | `#e2e8f0` (Slate-200) |
| Destructive | `--color-destructive` | `#dc2626` (Red-600) |
| Success | `--color-success` | `#16a34a` (Green-600) |

### Typography

- System font stack: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
- H1: 24px / bold
- H2: 20px / bold
- Body: 15px / regular
- Caption / Label: 12px / uppercase / `letter-spacing: 0.08em`

### Shape

- Card border-radius: `rounded-2xl` (16px)
- Badges / pills: `rounded-full`
- Buttons: `rounded-xl` (12px)
- Inputs: `rounded-xl` (12px)

### Shadows

- `shadow-sm` only, defined as `0 1px 3px rgba(15,23,42,0.06)`. Used on cards.

## UI Component Library

New shared components under `src/components/ui/`:

| File | Component | Responsibility |
|---|---|---|
| `src/components/ui/button.tsx` | `<Button>` | Variants: `primary`, `secondary`, `ghost`, `destructive`. Sizes: `sm`, `md`. Handles disabled + loading. |
| `src/components/ui/card.tsx` | `<Card>`, `<CardHeader>`, `<CardBody>` | Rounded container, optional header, consistent padding. |
| `src/components/ui/badge.tsx` | `<Badge>` | Color variants: `primary`, `neutral`, `success`, `destructive`. |
| `src/components/ui/input.tsx` | `<Input>`, `<Label>` | Form inputs with focus ring in Sky-500. |
| `src/components/ui/dialog.tsx` | `<Dialog>` | Modal with Escape-to-close, backdrop click, `aria-modal`, focus trap. Replaces the hand-rolled score dialog markup. |

All components are Client Components (`"use client"`) only where they need interactivity (`Dialog`, interactive `Button`). `Card`, `Badge`, `Input`, `Label` stay as server-renderable pure markup with props.

## Navigation & Layout

### AppShell

`src/components/app-shell.tsx` — Server Component that:

- Reads `auth()` session
- If unauthenticated: renders `{children}` only (login page renders itself)
- If authenticated: wraps `{children}` with `<TopNav>` (desktop-only via CSS) above content and `<BottomTabs>` (mobile-only via CSS) below

### Mobile (<768px)

```
┌────────────────────────────────────┐
│  Padel Tracker              [PK]   │  Top header
├────────────────────────────────────┤
│                                    │
│  Page content (scrolls)            │
│                                    │
├────────────────────────────────────┤
│  🏆 Rangliste  🎾 Spieltag  ⚙️ Admin│  Bottom tab-bar
└────────────────────────────────────┘
```

- Top header: logo left, avatar right
- Bottom-tabs sticky with `pb-safe` for iPhone home indicator
- Active tab: Sky-500 icon + label, weight 600
- Inactive tab: Slate-500 icon + label, weight 500
- Admin tab only rendered when `session.user.isAdmin === true`

### Desktop (≥768px)

```
┌──────────────────────────────────────────────┐
│ Padel Tracker   Rangliste  Spieltag  Admin  [PK]
├──────────────────────────────────────────────┤
│ Content (max-w-4xl mx-auto)                  │
```

- Top nav: logo + horizontal links + avatar dropdown
- No bottom-bar
- Admin link only when `isAdmin`

### Components

| File | Component | Notes |
|---|---|---|
| `src/components/app-shell.tsx` | `<AppShell>` | Server Component. Used in `src/app/layout.tsx`. |
| `src/components/bottom-tabs.tsx` | `<BottomTabs>` | Client Component. Uses `usePathname()` for active state. Accepts `isAdmin: boolean` prop. |
| `src/components/top-nav.tsx` | `<TopNav>` | Client Component. Uses `usePathname()`. Accepts `isAdmin: boolean` prop. |
| `src/components/user-menu.tsx` | `<UserMenu>` | Client Component. Avatar button, click opens dropdown with "Abmelden" action. |

## Page Updates

### `/login`

- Full-viewport Sky-Gradient background (`linear-gradient(135deg, #f0f9ff, #eff6ff)`)
- Centered `<Card>` (max-width 400px): logo, H1 "Padel Tracker", email `<Input>`, password `<Input>`, primary `<Button>` "Anmelden"
- Error displayed as red pill below the button
- No "Konto erstellen" link (self-signup never existed, and we just removed invites)

### `/ranking`

- Header: caption "Saison 2026" (Sky-600, uppercase), H1 "Rangliste", tennis-ball icon tile top-right
- Top 3 rows: highlight card (Sky-50 background, Sky-200 border) with medal emoji 🥇🥈🥉, player name, percentage, games played
- Rows 4+: white card with neutral Slate-200 border, numeric badge in Slate pill
- Empty state: single centered card: "Noch keine gewerteten Spiele in dieser Saison"

### `/game-day`

- Header card: date of the session, status `<Badge>` (`Geplant` / `Roster locked` / `Gestartet` / `Finished`)
- Attendance section as a card with toggle chips (confirmed / declined / unknown)
- Match list: one card per match with match number, team 1 vs team 2, either score display or "Ergebnis eintragen" primary button
- Score dialog converted to the new `<Dialog>` component; a11y features from Phase 1 preserved (Escape, backdrop, `aria-modal`, sr-only labels)
- Undo button (`ghost` variant) top-right of each match card when a score is present

### `/admin`

Single page with three sections (simple vertical sections, not tabs — keeps things honest on mobile):

1. **Spieler** (new)
   - List of all players as cards: name, email, Admin badge if applicable, "Bearbeiten" ghost button
   - "Spieler hinzufügen" primary button opens a `<Dialog>` with fields: Name, Email, Passwort (8+ chars), Admin-Checkbox
   - "Bearbeiten" opens a `<Dialog>` with "Passwort zurücksetzen" field (new password) and a save button. No admin-flag toggle in the edit dialog in this phase — admin can only be set at create time. (If a non-admin needs promotion, admin bootstraps them again through a DB edit or a future UI addition.)
2. **Spieltage**
   - List of game days as cards (date + status + link)
   - "Spieltag anlegen" primary button opens the existing create flow (restyled)
3. **Historische Daten**
   - Info card: "Import läuft über die CLI: `pnpm import:historical <file>`". Link to `docs/import-historical.md`.

All forms use `router.refresh()` on success (pattern from Phase 1 admin fixes).

## Backend Changes

### Prisma Schema

- **Remove** `model Invitation`
- **Remove** the back-relation field `invitationsSent Invitation[] @relation("InvitedBy")` on `model Player`
- No other changes to `Player` (field `passwordHash String?` remains — historical-import players keep `null`, newly admin-created players get a bcrypt hash)
- Migration: `20260420_drop_invitations` — `DROP TABLE "Invitation"`. No enum to drop; no data migration needed because the table only held in-flight invites.

### New API Routes

All routes guarded by `session.user.isAdmin`; non-admin responses are `403`.

| Route | Body / Query | Response | Description |
|---|---|---|---|
| `POST /api/players` | `{ email, name, password, isAdmin? }` | `{ id, email, name, isAdmin }` | Creates new player with bcrypt-hashed password. Validates email (strict zod), password min 8 chars. Rejects duplicate email with `409`. Writes audit log `player.create` with `{ email, name, isAdmin }`. |
| `GET /api/players` | — | `Player[]` with `hasPassword: boolean` flag | Lists all players for the admin UI. |
| `PATCH /api/players/[id]/password` | `{ password }` | `204` | Sets a new bcrypt-hashed password on the specified player. Writes audit log `player.password_reset` with `{ playerId }`. **Never logs the password.** 404 for unknown id. |

### Removed API Routes

- `POST /api/invitations`
- `GET /api/invitations/[token]`
- `POST /api/invitations/[token]`

### Lib Files

| File | Export | Purpose |
|---|---|---|
| `src/lib/players/create.ts` | `createPlayer({ email, name, password, isAdmin, actorId })` | Hash password, insert player, write audit log. Throws on duplicate email. |
| `src/lib/players/reset-password.ts` | `resetPlayerPassword({ playerId, password, actorId })` | Hash new password, update player, write audit log. Throws on unknown id. |

Both functions use Prisma transactions so the audit log and the write succeed or fail together.

## Testing Strategy

### New Tests

- `tests/lib/players/create.test.ts` — happy path, duplicate email, password hashing correctness
- `tests/lib/players/reset-password.test.ts` — happy path, unknown id, password hashing correctness, audit log does not contain the password
- `tests/api/players.create.test.ts` — admin-only guard, 200 happy path, 409 on duplicate, 400 on short password, 400 on invalid email
- `tests/api/players.reset.test.ts` — admin-only guard, 204 happy path, 404 on unknown id
- Component tests for `<Button>`, `<Badge>`, `<Dialog>`, `<BottomTabs>`, `<TopNav>`, `<UserMenu>` under `tests/components/`

### Removed Tests

- `tests/api/invitations.*` (all)
- `tests/app/invite.*` (all)

### Manual Smoke Test (after implementation)

Same pattern as Phase 1: boot Docker DB, reset schema, bootstrap admin, run dev server, walk through:

1. Login as admin
2. Create a player via admin UI → verify they can log in with the supplied password
3. Reset that player's password → verify old password fails, new one works
4. Create a game day, confirm attendance, start day, enter scores, verify ranking
5. Log out, log in as the created player, verify they don't see the admin tab

## Implementation Order

Informs the plan but not binding:

1. Design tokens in `globals.css` (dark removed, Sky palette in)
2. UI component library (`Button`, `Card`, `Badge`, `Dialog`, `Input`)
3. `AppShell`, `BottomTabs`, `TopNav`, `UserMenu`
4. Login page restyle
5. Ranking page restyle
6. Game-day page restyle (including `Dialog` migration)
7. Backend: `createPlayer`, `resetPlayerPassword`, API routes, tests
8. Admin page: new player section (list + create dialog + reset dialog)
9. Admin page: game-day section restyle
10. Remove invitation flow (routes, pages, components, Prisma migration)

## Risks

- **Prisma migration on existing data**: We only ever ran the Phase 1 smoke test against this DB. No production data exists. Still, the plan must run `db:migrate` in development first; the migration is non-reversible without the migration's own `down`.
- **Auth session shape**: The middleware/auth setup (split `auth.config.ts` + `auth.ts`) must stay edge-safe. The admin-guarded routes need to call `auth()` from `src/auth.ts` (node), not from the config. The plan must check that no admin-check accidentally bleeds into the middleware.
- **Mobile Safari bottom-tab overlap**: Must use `env(safe-area-inset-bottom)` (Tailwind `pb-safe` plugin or CSS variable). Easy to miss without an iPhone test device — manual smoke test must include an iOS-like narrow viewport in DevTools.
