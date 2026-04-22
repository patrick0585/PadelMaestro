# Game-Day Lifecycle & Identity — Design Spec

**Status:** Draft
**Date:** 2026-04-22
**Target branches:** three PRs — `feature/username-auth`, `feature/admin-player-edit`, `feature/game-day-lifecycle`

## Goal

Round out the admin and player experience around existing game days and player identity:

1. Allow login with username as an alias for email.
2. Let admins fully edit a player record (username, name, email, admin flag) instead of only creating and resetting passwords.
3. Enforce one game day per date.
4. Give admins a way to delete a mistake-created game day before scores exist.
5. Give admins a way to add an extra match pairing when players finish the planned matches early.
6. Replace the current automatic transition to `finished` with an explicit admin action, triggered by a prompt banner once all planned matches are scored.
7. Simplify the game-day timeline from four steps to three, reflecting that `roster_locked` and `in_progress` are no longer distinct for players now that matches are visible as soon as the roster is locked.

## Non-Goals

- Per-game-day history/detail view for players (ranking remains the only historical surface)
- Player self-service password or profile edits (admin-driven in this phase, matches existing policy)
- User deletion / deactivation beyond the existing `deletedAt` soft-delete already used at creation
- Changing `GameDayStatus` enum values in the database (`roster_locked` stays as an internal state)
- Recovering a deleted game day (hard delete is final; audit log preserves who/when/what)

## Architecture

Three independent PRs, each self-contained and shippable on its own:

| PR | Scope | Touches |
|---|---|---|
| **A** — Username auth | Schema + login flow | Prisma migration, `src/auth.ts`, login form, create-player dialog |
| **B** — Admin player edit | Full edit dialog | `PATCH /api/players/[id]`, `edit-player-dialog.tsx`, `players-section.tsx` |
| **C** — Game-day lifecycle | Four game-day features + timeline | Prisma migration (unique date), delete/extra-match/finish APIs, game-day page, admin page, phase.ts |

PR-B depends on PR-A only for the `username` column; the edit dialog is what actually lets admins assign usernames to existing players.

---

## PR-A — Username Auth

### Schema

New Prisma migration:

```prisma
model Player {
  // ... existing fields
  username String? @unique
}
```

- Nullable: existing players keep logging in by email until an admin assigns a username.
- Postgres's partial-unique-on-NULL behaviour means multiple `NULL` usernames coexist.
- No data migration or backfill required.

### Auth flow

`src/auth.ts`:
- Credentials config field `email` → `identifier`. Label: "E-Mail oder Benutzername".
- `authorize` callback resolves the player with:
  ```ts
  prisma.player.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier.toLowerCase() }],
      deletedAt: null,
    },
  });
  ```
- Usernames are stored and compared **lowercase** (case-insensitive login).
- Timing equalisation via dummy hash remains.

### Login form

`src/app/login/login-form.tsx`:
- Input label: "E-Mail oder Benutzername".
- Input `type="text"` (not `type="email"`, otherwise browser validation rejects plain usernames).
- No autofill-type change.

### Create-player dialog

`src/app/admin/create-player-dialog.tsx`:
- Add optional "Benutzername" field.
- Validation: if provided, must match `^[a-z0-9_]{3,32}$`.
- Stored lowercase.
- Duplicate username → 409, shown inline.

### Tests

- Unit (`tests/unit/auth/username.test.ts`): username regex validator.
- Integration (`tests/integration/auth.test.ts`): login by email ✓, login by username ✓, login by mixed-case username ✓ (normalised), unknown identifier ✗, correct identifier + wrong password ✗.
- Integration (`tests/integration/create-player.test.ts`): POST with username success, duplicate username → 409, invalid format → 400.

---

## PR-B — Admin Player Edit

### API

New route `src/app/api/players/[id]/route.ts`:

- `PATCH /api/players/[id]` — admin-only.
- Zod body (all fields optional, at least one required):
  ```ts
  z.object({
    username: z.string().regex(/^[a-z0-9_]{3,32}$/).optional(),
    name: z.string().min(1).max(64).optional(),
    email: z.string().email().optional(),
    isAdmin: z.boolean().optional(),
  }).refine((v) => Object.keys(v).length > 0, { message: "no fields to update" })
  ```
- On Prisma `P2002`: map to 409 with field name (`{ error: "username_taken" }` or `email_taken`).
- Audit log `player.update` with `{ before, after, changedFields }`.

### Last-admin guard

If the PATCH would set `isAdmin: false` on the last remaining admin (count of `isAdmin=true AND deletedAt=null` players would drop to 0), return 409 `{ error: "last_admin" }`.

### Dialog

New component `src/app/admin/edit-player-dialog.tsx`:

- Trigger: pencil icon in the player row inside `players-section.tsx`.
- Fields: Anzeigename, Benutzername, E-Mail, Admin-Toggle.
- Submit → `PATCH`. On success → `router.refresh()` and close.
- Error handling: inline message per field on 409/400 responses.
- The existing "Passwort zurücksetzen" button stays untouched (separate action).

### Players section layout

`src/app/admin/players-section.tsx`:

- Row: `Name · Badges · [Edit] [Reset-PW]` (or compact overflow menu on mobile).
- No bulk operations.

### Tests

- Integration: PATCH changes username → DB + audit log.
- Integration: duplicate username/email → 409 with field identifier.
- Integration: last-admin self-demote → 409 `last_admin`.
- Integration: non-admin PATCH → 403.
- Integration: empty body (no keys) → 400.

---

## PR-C — Game-Day Lifecycle

This PR bundles four feature changes plus the timeline simplification. They ship together because they overlap in the admin UI surface and share the same state-machine reasoning.

### C1. Timeline: 4 steps → 3 steps

`src/app/game-day/phase.ts`:

- New step set: `[Geplant, Matches, Fertig]`.
- Mapping:
  - `planned` → current = "Geplant", others upcoming
  - `roster_locked` → done = "Geplant", current = "Matches"
  - `in_progress` → done = "Geplant", current = "Matches"
  - `finished` → all done, current = "Fertig"
- The DB enum `GameDayStatus` is unchanged — `roster_locked` stays as an internal state used by `lockRoster`, the finish guard, and audit payloads. Only the UI rendering collapses.
- Test file `tests/unit/game-day/phase.test.ts` rewritten for the 3-step output.

### C2. One game day per date

Prisma migration:

```prisma
model GameDay {
  // ...
  @@unique([seasonId, date])
  // @@index([seasonId, date]) removed (unique implies index)
}
```

- Pre-migration check: run a quick SQL audit for existing duplicates in the current DB. Given usage so far, duplicates are unlikely; if any exist, resolve manually before running the migration.
- `src/lib/game-day/create.ts`:
  - Wrap the `prisma.gameDay.create` call. On `PrismaClientKnownRequestError` with code `P2002`, throw a new `GameDayDateExistsError(date)`.
- `src/app/api/game-days/route.ts`: map `GameDayDateExistsError` → **409** with body `{ error: "date_exists" }`.
- `src/app/admin/create-game-day-form.tsx`: render inline error "Für diesen Tag existiert bereits ein Spieltag".

### C3. Delete game day (planned + roster_locked, hard)

New lib `src/lib/game-day/delete.ts`:

```ts
export class GameDayNotDeletableError extends Error { ... }

export async function deleteGameDay(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUniqueOrThrow({ where: { id: gameDayId } });
    if (day.status !== "planned" && day.status !== "roster_locked") {
      throw new GameDayNotDeletableError(day.status);
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.delete",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: { date: day.date, status: day.status, playerCount: day.playerCount },
      },
    });
    await tx.gameDay.delete({ where: { id: gameDayId } });
  });
}
```

Prisma schema: `Match.gameDay` and `GameDayParticipant.gameDay` already use `onDelete: Cascade`. `JokerUse.gameDay` does **not** — the migration in this PR must add `onDelete: Cascade` there so a delete in `roster_locked` with pre-recorded jokers does not fail. Audit log has no FK reference to game day, so entries persist after deletion.

New API `src/app/api/game-days/[id]/route.ts`:
- `DELETE` — admin-only.
- Maps `GameDayNotDeletableError` → 409, `GameDayNotFoundError` → 404.

Admin UI (`src/app/admin/page.tsx`):
- Next to the planned-day card, a trash icon.
- Clicking opens `ConfirmDeleteDialog` ("Spieltag X löschen? Generierte Matches gehen verloren — Scores sind noch keine vorhanden.").
- Only rendered when `day.status in ("planned", "roster_locked")`.

Tests:
- Integration: delete in `planned` ✓, in `roster_locked` ✓, in `in_progress` → 409, in `finished` → 409.
- Integration: non-admin → 403.
- Integration: audit log entry persists after delete.

### C4. Extra match

New lib `src/lib/game-day/add-extra-match.ts`:

```ts
export class GameDayNotActiveError extends Error { ... }

export async function addExtraMatch(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUniqueOrThrow({
      where: { id: gameDayId },
      include: { participants: { include: { player: true } }, matches: true },
    });
    if (day.status !== "roster_locked" && day.status !== "in_progress") {
      throw new GameDayNotActiveError(day.status);
    }

    const confirmed = day.participants.filter((p) => p.attendance === "confirmed");
    const template = loadTemplate(confirmed.length);
    const slot = template.matches[Math.floor(Math.random() * template.matches.length)];
    const shuffled = shuffleArray(confirmed.map((p) => ({ id: p.player.id })), generateSeed());
    const nextMatchNumber = Math.max(0, ...day.matches.map((m) => m.matchNumber)) + 1;

    const match = await tx.match.create({
      data: {
        gameDayId,
        matchNumber: nextMatchNumber,
        team1PlayerAId: shuffled[slot.team1[0] - 1].id,
        team1PlayerBId: shuffled[slot.team1[1] - 1].id,
        team2PlayerAId: shuffled[slot.team2[0] - 1].id,
        team2PlayerBId: shuffled[slot.team2[1] - 1].id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.add_extra_match",
        entityType: "Match",
        entityId: match.id,
        payload: { gameDayId, matchNumber: nextMatchNumber, templateSlot: slot.matchNumber },
      },
    });
    return match;
  });
}
```

Notes:
- Fresh random seed each call — not the game-day seed. Repeats are fine (for 4 players: always a repeat).
- Players who declined or are pending are ignored — only `confirmed` participate.

New API `src/app/api/game-days/[id]/matches/route.ts`:
- `POST` — admin-only. No body.
- Returns the new match.
- Maps `GameDayNotActiveError` → 409, `GameDayNotFoundError` → 404.

Admin UI (`src/app/game-day/page.tsx`, admin branch):
- Button "+ Zusatz-Match" rendered below the match list when the viewer is an admin and status is `roster_locked` or `in_progress`.
- On click → POST, then `router.refresh()`.

Tests:
- Integration: POST in `roster_locked` creates match with `matchNumber = 16` (after 15 template matches), correct teams from confirmed pool.
- Integration: POST in `in_progress` ✓.
- Integration: POST in `planned` → 409 (no matches yet), in `finished` → 409.
- Integration: Non-admin → 403.

### C5. Manual finish + auto-prompt banner

**Remove auto-finish** from `src/lib/match/enter-score.ts`: delete the block that counts `unscored` matches and updates `GameDay.status` to `finished` when zero unscored remain. The `GameDayFinishedError` guard at the top of `enterScore` stays (blocks edits on a manually-finished day).

New lib `src/lib/game-day/finish.ts`:

```ts
export class GameDayAlreadyFinishedError extends Error { ... }

export async function finishGameDay(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUniqueOrThrow({ where: { id: gameDayId } });
    if (day.status === "finished") throw new GameDayAlreadyFinishedError(gameDayId);
    if (day.status !== "in_progress") throw new GameDayNotActiveError(day.status);

    await tx.gameDay.update({
      where: { id: gameDayId },
      data: { status: "finished" },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.finish",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: { finishedAt: new Date().toISOString() },
      },
    });
  });
}
```

New API `src/app/api/game-days/[id]/finish/route.ts`:
- `POST` — admin-only. Maps errors to 409.

Game-day page (`src/app/game-day/page.tsx`):
- Compute `allScored = matches.length > 0 && matches.every((m) => m.team1Score !== null && m.team2Score !== null)`.
- When viewer is admin AND `status === "in_progress"` AND `allScored` → render a banner above the match list with:
  - Title: "Alle Matches gewertet."
  - Subtext: "Spieltag abschließen oder noch ein Zusatz-Match einplanen?"
  - Two buttons: "Spieltag abschließen" (→ POST finish) and "Zusatz-Match hinzufügen" (→ POST matches, same as standalone button).
- The standalone "+ Zusatz-Match" button (C4) stays always visible to admins; the banner is additive.

Tests:
- Integration: `finishGameDay` in `in_progress` ✓, in `finished` → 409, in `planned` → 409.
- Integration: non-admin → 403.
- Integration: last-score no longer auto-advances to `finished` (status stays `in_progress`).
- Integration: after `finishGameDay`, `enterScore` throws `GameDayFinishedError`.
- Integration: after `finishGameDay`, `addExtraMatch` throws `GameDayNotActiveError`.

## Error handling summary

| Error class | HTTP | When |
|---|---|---|
| `GameDayDateExistsError` | 409 | create with duplicate date |
| `GameDayNotFoundError` | 404 | any route with invalid id |
| `GameDayNotDeletableError` | 409 | delete in `in_progress`/`finished` |
| `GameDayNotActiveError` | 409 | finish/add-extra-match in wrong status |
| `GameDayAlreadyFinishedError` | 409 | double finish |
| `GameDayFinishedError` (existing) | 409 | enter-score after finish |
| `PlayerNotFoundError` (existing) | 404 | set-attendance on deleted player |
| Last-admin guard | 409 | self-demote last admin via PATCH |
| P2002 (Prisma unique) | 409 | duplicate username/email on create or update |

## Testing strategy

- Unit: pure functions (username regex, phase mapping).
- Integration: all new lib functions against the real test DB, including audit-log assertions.
- API route tests: happy path + each error path, one per endpoint.
- Manual smoke test checklist in the PR: create day twice, delete day, add extra match, finish day, log in with username.
- No screenshot/visual-regression tests (existing project policy).

## Rollout

- PR-A first — merge + deploy, smoke-test login with email (regression), admin assigns a test username via DB or waits for PR-B.
- PR-B second — merge + deploy, admin assigns usernames via UI, smoke-test username login.
- PR-C third — merge + deploy, run through the full admin flow (create, delete, add extra, finish).

All migrations are additive/compatible: PR-A adds a nullable column, PR-C adds a unique constraint on a field that has never had real duplicates. No rollback data loss.
