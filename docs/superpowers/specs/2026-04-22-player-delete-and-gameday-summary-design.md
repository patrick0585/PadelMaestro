# Player Delete & Game-Day Summary — Design

**Date:** 2026-04-22
**Status:** Approved for implementation

## Goal

Two cohesive enhancements to the Padel Tracker:

1. **Admins can delete players** via a soft-delete that preserves historical match/audit data.
2. **After a game day finishes**, users see a podium + per-player summary (points and matches played that day) in place of the current "X / Y Matches gewertet" placeholder.

The previously suspected points-calculation bug is **out of scope** — verification confirmed `src/lib/ranking/compute.ts` already awards each player the team's score per match (e.g., 2:1 → winners get 2, losers get 1 each). The user's "13 points for everyone" observation matched the games column, not points.

## Architecture

Both features stay within the existing Next.js App Router + Prisma layering:

- **Service layer** (`src/lib/...`) holds pure logic — takes Prisma, returns domain types, throws typed errors.
- **API route** (`src/app/api/...`) handles auth, validates input with Zod, maps service errors to HTTP codes.
- **UI** consumes server-side fetched data or hits the API from a client component.
- **Tests** are integration-style (real Prisma, real DB) matching the existing convention (`tests/integration/...`).

Soft-delete piggybacks on the mature `deletedAt` convention already used across the codebase (verified at `src/app/api/players/route.ts:61`, `src/lib/game-day/create.ts:14`, `src/lib/players/update.ts:84`, `src/lib/auth/authorize.ts:33`, and more).

---

## Feature 1: Player Soft-Delete

### Service

**File:** `src/lib/players/delete.ts` (new)

```ts
export class PlayerNotFoundError extends Error {}
export class SelfDeleteError extends Error {}
export class LastAdminError extends Error {}
export class ActiveParticipationError extends Error {}

export async function deletePlayer(input: {
  playerId: string;
  actorId: string;
}): Promise<void>;
```

**Rules (in order, first match wins):**

1. Target player must exist and have `deletedAt === null` → else `PlayerNotFoundError`.
2. `playerId === actorId` → `SelfDeleteError`.
3. Target is `isAdmin === true` **and** would leave zero remaining active admins (`Player.isAdmin = true AND deletedAt = null AND id <> target`) → `LastAdminError`.
4. Target has any `GameDayParticipant` row on a game day whose `status IN ('planned', 'roster_locked', 'in_progress')` with `attendance IN ('confirmed', 'joker')` → `ActiveParticipationError`. Pending/declined are OK.
5. Otherwise: set `deletedAt = now()` on Player; write `AuditLog` with `actorId=actor`, `action='player.delete'`, `entityType='Player'`, `entityId=target.id`, `payload={ name, email }`. Single Prisma transaction.

Historical data (matches, participations, joker uses, audit logs) is untouched.

### API

**File:** `src/app/api/players/[id]/route.ts` (extend existing file — currently has PATCH only)

**Method:** `DELETE`

**Auth:** requires `session.user.isAdmin`; else 401 if unauthenticated, 403 if not admin.

**Response mapping:**
- Success → `204 No Content`
- `PlayerNotFoundError` → `404 { error: "Player not found" }`
- `SelfDeleteError` → `409 { error: "Du kannst dich nicht selbst löschen" }`
- `LastAdminError` → `409 { error: "Der letzte verbleibende Admin kann nicht gelöscht werden" }`
- `ActiveParticipationError` → `409 { error: "Spieler ist für einen laufenden Spieltag eingeplant" }`
- Other → `500 { error: "Unknown error" }`

### UI

**File:** `src/app/admin/delete-player-dialog.tsx` (new) — follows the style of the existing `reset-password-dialog.tsx` and `edit-player-dialog.tsx`.

**Trigger:** new "Löschen" button added to each row in `src/app/admin/players-section.tsx`.

**Dialog content:**
- Title: "Spieler löschen"
- Body: `Name` + email, plus the warning "Der Spieler wird deaktiviert. Historische Matches und Spieltage bleiben erhalten."
- Two buttons: "Abbrechen" (close), "Löschen" (destructive style — red, same pattern as existing `DeleteGameDayButton`).
- On 409, show the server's error message inline.
- On success, call `router.refresh()` and close.

No typed-confirmation text. The confirm button itself is the confirmation — consistent with `DeleteGameDayButton`.

### Tests

**File:** `tests/integration/player-delete.test.ts` (new). Cases:

1. Happy path — soft-deletes active player, sets `deletedAt`, writes audit log, returns void.
2. `PlayerNotFoundError` — unknown id and already-deleted id.
3. `SelfDeleteError` — admin tries to delete themselves.
4. `LastAdminError` — deleting the only remaining active admin is blocked; a soft-deleted admin does not count as "remaining".
5. `ActiveParticipationError` — player has a `confirmed` participation on a `planned` day; a `declined` or `finished`-day participation does not block deletion.
6. Historical data preserved — matches involving the deleted player are still queryable.

Plus a route-level test (`tests/integration/player-delete-route.test.ts`, optional if covered by existing route patterns) to confirm 401/403/404/409/204 status mapping.

---

## Feature 2: Game-Day Summary

### Service

**File:** `src/lib/game-day/summary.ts` (new)

```ts
export type GameDaySummaryRow = {
  playerId: string;
  playerName: string;
  points: number;
  matches: number;
};

export type GameDaySummary = {
  gameDayId: string;
  date: Date;
  status: GameDayStatus;
  rows: GameDaySummaryRow[]; // sorted by points DESC, matches DESC, name ASC
  podium: GameDaySummaryRow[]; // rows.slice(0, 3)
};

export async function computeGameDaySummary(gameDayId: string): Promise<GameDaySummary | null>;
```

**Logic:**
- Fetch the game day + all matches where `team1Score IS NOT NULL AND team2Score IS NOT NULL`.
- For each match, for each of the 4 player slots, add the player's team score to their point total and increment their match count by 1.
- Resolve player names in one `findMany` against the collected ids.
- Sort `rows` deterministically (points DESC, matches DESC, name ASC).
- `podium` is `rows.slice(0, 3)` — may have fewer than 3 entries.
- Returns `null` if no `GameDay` with that id exists.
- Joker uses are **not** included (Joker is a season-level construct; the summary reflects play on the day).

All queries should run against `finished` or `in_progress` days the same way — the function doesn't filter by status itself; the caller decides when to display it.

### UI

**File:** `src/app/game-day/finished-summary.tsx` (new — server component, async).

Rendered from `src/app/game-day/page.tsx` where the current finished-branch block exists (currently shows "Spieltag beendet · X / Y Matches gewertet", `page.tsx:132-143` per exploration).

**Layout** (top to bottom):
1. Header: date + "Spieltag beendet".
2. **Podium**: three stacked cards styled with gold/silver/bronze accents; each shows rank icon, name, points (large), matches (small). If fewer than 3 players played, render only the positions we have.
3. **Full table**: all `rows` with columns Rang / Name / Punkte / Matches. New compact table component (not the season `<RankingTable>`, which exposes `pointsPerGame` instead of raw points), following the same visual language — same borders, typography, and alignment. If no matches were scored (edge case: day finished with zero scored matches), show the existing "X / Y Matches gewertet" fallback instead of an empty podium/table.

Medal colors: reuse existing theme tokens. Gold = `text-warning`, silver = `text-foreground-muted`, bronze = `text-primary` (or the closest warm accent already defined). No new Tailwind tokens are introduced; if the preferred bronze token does not exist, fall back to an existing amber/orange-adjacent class rather than adding to the theme.

### Tests

**File:** `tests/integration/gameday-summary.test.ts` (new). Cases:

1. **Basic aggregation** — 4 players, 2 matches (2:1 and 3:0); verify points and matches counts.
2. **Tie-break order** — two players equal on points → matches DESC wins; equal on both → name ASC wins.
3. **Podium size** — <3 players produces a truncated podium.
4. **Unscored matches excluded** — a match with `team1Score = NULL` does not contribute.
5. **Unknown id** — returns `null`.

---

## Out of Scope

- **Archive route for finished game days** (e.g., `/game-day/[id]`). Separate feature.
- **Player restore** from soft-delete (no UI; CLI script if ever needed).
- **Displaying raw points in the season ranking** (`RankingTable` currently hides the `points` column). Separate cleanup.
- **Animating the podium or confetti.** YAGNI.

## File Summary

**New files:**
- `src/lib/players/delete.ts`
- `src/lib/game-day/summary.ts`
- `src/app/admin/delete-player-dialog.tsx`
- `src/app/game-day/finished-summary.tsx`
- `tests/integration/player-delete.test.ts`
- `tests/integration/gameday-summary.test.ts`

**Modified files:**
- `src/app/api/players/[id]/route.ts` — add `DELETE` handler.
- `src/app/admin/players-section.tsx` — render delete button + mount dialog per row.
- `src/app/game-day/page.tsx` — swap the finished branch block for `<FinishedSummary gameDayId={...} />`.
