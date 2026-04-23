# Joker Feature — Design

**Date:** 2026-04-23
**Status:** Approved (user)
**Scope:** Player + admin UI to set/cancel a joker for an upcoming game day, with persistence, audit logging, and remaining-count handling.

---

## 1. Goal

Let players set or cancel a joker for the next planned game day directly from the DashboardHero as a 3-way choice ("Dabei sein | Nicht dabei | Joker setzen") that can be changed any time before the game day starts. Give admins a per-player fallback inside the participants roster to set or cancel a joker on behalf of a player. Disable "Joker setzen" when the player has none left, and always show a confirmation dialog with a PPG preview before committing a joker.

## 2. Architecture overview

- **Reuse (no changes):**
  - `src/lib/joker/use.ts` → `recordJokerUse()`
  - `POST /api/jokers`
  - `src/lib/game-day/attendance.ts` → `setAttendance`, `setAttendanceAsAdmin`
  - `AttendanceStatus.joker` enum value (already in schema)
- **New domain functions in `src/lib/joker/use.ts`:**
  - `cancelJokerUse({ playerId, gameDayId })`
  - `recordJokerUseAsAdmin({ actorId, playerId, gameDayId })`
  - `cancelJokerUseAsAdmin({ actorId, playerId, gameDayId })`
  - New error: `JokerNotFoundError`
- **New API routes:**
  - `DELETE /api/jokers` (self-cancel)
  - `POST /api/admin/game-days/[id]/participants/[playerId]/joker`
  - `DELETE /api/admin/game-days/[id]/participants/[playerId]/joker`
- **New UI:**
  - 3-way segmented toggle in `DashboardHero`
  - `joker-confirm-dialog.tsx` (shared by DashboardHero + admin roster)
  - Per-row joker controls in `participants-roster.tsx`
- **Removed UI:**
  - Top-right `{state.time}` display in `DashboardHero`
- **Invariants preserved:**
  - Only when `gameDay.status === "planned"`
  - Max `MAX_JOKERS_PER_SEASON` (2) per player per season
  - Cancel frees the slot and sets `attendance: "pending"`
  - Every state change writes an AuditLog entry

## 3. Backend domain + API

### 3.1 `cancelJokerUse({ playerId, gameDayId })`

- Load `GameDay`; throw `JokerLockedError` unless `status === "planned"`.
- Load `JokerUse` by composite key `(playerId, seasonId, gameDayId)`; if missing → throw `JokerNotFoundError`.
- `prisma.$transaction`:
  1. `jokerUse.delete(...)`
  2. `gameDayParticipant.update(...)` → `{ status: "pending", confirmedAt: null }`
  3. `auditLog.create(...)` → `{ action: "joker.cancel", actorId: playerId, targetPlayerId: playerId, gameDayId, seasonId, meta: { ppgSnapshot } }`

### 3.2 `recordJokerUseAsAdmin({ actorId, playerId, gameDayId })`

- Same invariants as `recordJokerUse` (planned status, cap check, PPG snapshot).
- Audit log: `actorId = admin.id`, `targetPlayerId = player.id`, `action: "joker.set.admin"`.

### 3.3 `cancelJokerUseAsAdmin({ actorId, playerId, gameDayId })`

- Same as `cancelJokerUse` but `actorId ≠ playerId`, `action: "joker.cancel.admin"`.

### 3.4 API routes

| Route | Method | Auth | Body | Success | Errors |
|---|---|---|---|---|---|
| `/api/jokers` | DELETE | session | `{ gameDayId: uuid }` | 204 | 401, 409 (`JOKER_LOCKED`, `JOKER_NOT_FOUND`) |
| `/api/admin/game-days/[id]/participants/[playerId]/joker` | POST | admin | — | 201 | 401, 403, 409 (`JOKER_LOCKED`, `JOKER_CAP_EXCEEDED`) |
| `/api/admin/game-days/[id]/participants/[playerId]/joker` | DELETE | admin | — | 204 | 401, 403, 409 (`JOKER_LOCKED`, `JOKER_NOT_FOUND`) |

All routes call `revalidatePath("/")` and `revalidatePath("/admin/spieltage/[id]")` on success.

## 4. DashboardHero redesign

### 4.1 Removals

- Top-right `{state.time}` block.

### 4.2 New props on `HeroState["member"]`

- `attendance: "pending" | "confirmed" | "declined" | "joker"`
- `jokersRemaining: number` (0–2)
- `ppgSnapshot: number | null` (current season PPG; supplied by `computePlayerSeasonStats`)

### 4.3 3-way segmented toggle

```
[ Dabei sein ]  [ Nicht dabei ]  [ Joker setzen ]
```

- Active state highlights the current `attendance`.
- Clicking a non-active button:
  - "Dabei sein" → `POST /api/game-days/[id]/attendance { status: "confirmed" }`
  - "Nicht dabei" → `POST /api/game-days/[id]/attendance { status: "declined" }`
  - "Joker setzen" → opens **Confirm dialog**
- Switching away from `attendance === "joker"`: first calls `DELETE /api/jokers`, then the new attendance call (sequential; abort on first error with toast).
- "Joker setzen" disabled when `jokersRemaining === 0`; helper text below: *"Keine Joker mehr in dieser Saison"*.
- Single `useTransition` pending flag disables all three buttons during network calls.

### 4.4 Confirm dialog (`joker-confirm-dialog.tsx`)

> **Joker einsetzen?**
> Du setzt deinen **{n}. von 2 Jokern** ein.
> Aktuelle PPG: **{ppg}** → du bekommst **10 × {ppg} ≈ {ppg × 10} Punkte** gutgeschrieben.
> Du kannst den Joker bis zum Beginn des Spieltags wieder entfernen.
>
> `[ Abbrechen ]`   `[ Joker setzen ]`

- `{n}` = `(2 - jokersRemaining) + 1`
- If `ppgSnapshot === null` → replace the PPG line with: *"Bisher keine Statistik — die PPG wird beim Setzen des Jokers festgeschrieben."*

### 4.5 Error mapping (German toasts)

| Code | Message |
|---|---|
| `JOKER_LOCKED` | "Spieltag ist bereits gestartet — Änderungen nicht mehr möglich." |
| `JOKER_CAP_EXCEEDED` | "Du hast deine 2 Joker dieser Saison bereits verbraucht." |
| `JOKER_NOT_FOUND` | "Joker war nicht gesetzt." |

## 5. Admin integration (`src/app/admin/participants-roster.tsx`)

### 5.1 Types

```ts
type ParticipantAttendance = "pending" | "confirmed" | "declined" | "joker";
```

### 5.2 Row additions

- **Badge:** when `attendance === "joker"` render a "Joker" pill.
- **Per-row control:**
  - No joker set & `playerJokersRemaining > 0` → button "Joker für Spieler setzen" → opens admin confirm dialog (same component, with player name in heading).
  - Joker set → button "Joker entfernen" → opens confirm dialog *"Joker von {name} entfernen?"*.
  - No joker set & `playerJokersRemaining === 0` → disabled button "Keine Joker übrig".

### 5.3 Data flow

`src/app/admin/spieltage/[id]/page.tsx` extends its participants query with a per-player season joker count → supplies `jokersRemaining` to each row.

### 5.4 API dispatch

- Set: `POST /api/admin/game-days/[id]/participants/[playerId]/joker`
- Cancel: `DELETE /api/admin/game-days/[id]/participants/[playerId]/joker`

## 6. Testing strategy

### 6.1 Unit tests — `tests/lib/joker/use.test.ts` (extend)

- `cancelJokerUse` happy path: deletes `JokerUse`, attendance → `pending`, audit log written.
- `cancelJokerUse` throws `JokerLockedError` when `status !== "planned"`.
- `cancelJokerUse` throws `JokerNotFoundError` when no use exists.
- `recordJokerUseAsAdmin` happy path: `actorId ≠ playerId`, audit action `joker.set.admin`.
- `cancelJokerUseAsAdmin` happy path: audit action `joker.cancel.admin`.

### 6.2 API tests

- `tests/api/jokers.test.ts` (extend): `DELETE /api/jokers` 401 / 204 / 409.
- `tests/api/admin-jokers.test.ts` (new): admin POST/DELETE — 401 / 403 / 201|204 / 409.

### 6.3 Component tests

- `tests/components/dashboard-hero.test.tsx` (extend):
  - 3-way toggle renders with correct active state for each of `pending | confirmed | declined | joker`.
  - "Joker setzen" disabled when `jokersRemaining === 0`.
  - Switching from `joker` to `confirmed` dispatches DELETE then POST attendance.
- `tests/components/joker-confirm-dialog.test.tsx` (new):
  - "1. von 2" / "2. von 2" wording correct.
  - PPG fallback when `ppgSnapshot === null`.
- `tests/components/participants-roster.test.tsx` (extend):
  - Joker badge renders when `attendance === "joker"`.
  - Admin set/cancel buttons dispatch the correct API calls.
  - Disabled state when player has no jokers remaining.

## 7. Out of scope

- No changes to `recordJokerUse` or `POST /api/jokers`.
- No UI for viewing historical joker uses beyond what already exists.
- No mobile-specific layout tweaks beyond the existing responsive toggle (the segmented control is mobile-friendly by default).
