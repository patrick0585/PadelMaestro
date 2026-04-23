# Joker visibility in archive and live game-day — Design

**Date:** 2026-04-23
**Status:** Approved (brainstorming)
**Follow-up:** implementation plan

## 1. Goal

Show which players used a Joker on a given game day, with a clear
visual distinction from regular attendance. The information must be
visible in three places:

1. **Archive list** (`/archive`) — show a badge "Joker N" next to a
   day's date when at least one player used a Joker that day.
2. **Archive detail** (`/archive/[id]`) — render a dedicated
   "Joker an diesem Tag" block below the final ranking, listing each
   Joker-Nutzer with avatar, name, and credited points.
3. **Live game-day** (`/game-day`) — for `planned` and `in_progress`
   phases show a "Joker"-Badge on the player in the participants
   roster (no points, since the PPG snapshot is not final until
   after the day). For the `finished` phase reuse the archive-detail
   Joker block (shared via `FinishedSummary`).

Historical data imported from the legacy XLSX already creates
`JokerUse` rows, so no additional import is needed — this design
only adds read paths and UI.

## 2. Architecture

- **No schema changes.** `JokerUse` already stores everything we
  need: `playerId`, `seasonId`, `gameDayId`, `ppgAtUse`,
  `gamesCredited`, `pointsCredited`, `createdAt`. Unique on
  `(playerId, seasonId, gameDayId)`, indexed on `(seasonId, playerId)`.
- **Data access layer gains two helpers:**
  - `listJokersForGameDay(gameDayId)` — reads all Joker uses for
    one day, joined with player name and avatar version. Returns
    a sorted array keyed by player name.
  - `listArchivedGameDays()` — extended to include `jokerCount` per
    day via a grouped count.
- **UI layer:**
  - New shared component `<JokerBlock />` renders the "Joker an
    diesem Tag" section. Reused by archive-detail page and
    `FinishedSummary`.
  - New small utility `<JokerBadge count={n} />` for the archive
    list badge.
  - `PlannedSection` gains a visual marker on participants whose
    `attendance === "joker"`. No points shown in this phase.
- **Testing:** one integration test for
  `listJokersForGameDay`, component tests for `<JokerBlock />` and
  the archive list badge, plus an update to the existing
  planned-section test covering the Joker marker.

## 3. Data access

### 3.1 `listJokersForGameDay(gameDayId)`

File: `src/lib/joker/list.ts` (new)

```ts
import { prisma } from "@/lib/db";

export interface JokerUseRow {
  playerId: string;
  playerName: string;
  avatarVersion: number;
  ppgAtUse: number;
  gamesCredited: number;
  pointsCredited: number;
}

export async function listJokersForGameDay(
  gameDayId: string,
): Promise<JokerUseRow[]> {
  const rows = await prisma.jokerUse.findMany({
    where: { gameDayId },
    include: {
      player: { select: { id: true, name: true, avatarVersion: true } },
    },
  });
  const mapped: JokerUseRow[] = rows.map((r) => ({
    playerId: r.player.id,
    playerName: r.player.name,
    avatarVersion: r.player.avatarVersion,
    ppgAtUse: Number(r.ppgAtUse),
    gamesCredited: r.gamesCredited,
    pointsCredited: Number(r.pointsCredited),
  }));
  mapped.sort((a, b) => a.playerName.localeCompare(b.playerName, "de"));
  return mapped;
}
```

Index coverage: existing `@@index([seasonId, playerId])` does not
help a `WHERE gameDayId = ?` lookup, but `@@unique([playerId,
seasonId, gameDayId])` is also not a prefix match. For the expected
cardinality (≤ 2 Joker/Saison × ≤ 50 Spieler = low hundreds of rows
per season) a seq scan is fine. If the table grows, the plan can
add `@@index([gameDayId])` separately — not included in this spec
to keep scope tight.

### 3.2 Archive list — extend `listArchivedGameDays`

File: `src/lib/archive/list.ts` (modify)

Add `jokerCount: number` to `ArchivedGameDayRow`. Fetch once with a
`groupBy`:

```ts
const jokerCounts = await prisma.jokerUse.groupBy({
  by: ["gameDayId"],
  where: { gameDayId: { in: days.map((d) => d.id) } },
  _count: { _all: true },
});
const jokerByDay = new Map(
  jokerCounts.map((r) => [r.gameDayId, r._count._all]),
);
```

Then in the row-building loop:

```ts
jokerCount: jokerByDay.get(day.id) ?? 0,
```

## 4. UI

### 4.1 `<JokerBlock />`

File: `src/app/game-day/joker-block.tsx` (new, shared between
archive-detail and finished-summary; lives under `game-day/` because
it is a server component coupled to this feature)

Props:

```ts
{ jokers: JokerUseRow[] }
```

Render rules:

- If `jokers.length === 0`, render nothing.
- Otherwise render a `<section>` with the heading
  `Joker an diesem Tag` (same typographic style as other section
  headings, `text-[0.65rem] uppercase tracking-wider
  text-foreground-muted`).
- For each Joker: row with
  - `<Avatar>` size 40, name, Badge `Joker`,
  - formula line `{gamesCredited} × {ppgAtUse (de, 2 decimals)}
     ≈ {Math.round(pointsCredited)} P.`
- Sorted alphabetically by name.

### 4.2 Archive list badge

In `/archive` (`src/app/archive/page.tsx`):

Next to the date line, when `row.jokerCount > 0`, render:

```tsx
<span className="ml-2 inline-flex items-center rounded-full
 bg-warning/15 px-2 py-0.5 text-[0.65rem] font-semibold
 uppercase tracking-wider text-warning">
  Joker {row.jokerCount}
</span>
```

No separate component is needed; inline is short and matches the
one-off usage elsewhere in the page.

### 4.3 Archive detail

No direct change. Archive-detail already renders
`<FinishedSummary gameDayId={day.id} …/>`; once `FinishedSummary`
internally calls `listJokersForGameDay` and appends the
`<JokerBlock />`, the archive detail picks it up for free. Keeping
the Joker fetch inside `FinishedSummary` avoids a duplicate query
and a second code path.

### 4.4 `FinishedSummary`

Modify `src/app/game-day/finished-summary.tsx`:

- Add `listJokersForGameDay(gameDayId)` call.
- Append `<JokerBlock jokers={…} />` at the end of the returned
  tree (after the ranking table).

### 4.5 Planned / in_progress marker

In `src/app/game-day/page.tsx`:

The page currently maps `GameDayParticipant` into a simplified shape
that collapses `"joker"` into `"pending"`. This is the bug that hides
the Joker from the live view. Change the mapping so `attendance
=== "joker"` is preserved and passed to `PlannedSection`.

Update `PlannedSection` (`src/app/game-day/planned-section.tsx`):

- Extend `MemberAttendance` to
  `"pending" | "confirmed" | "declined" | "joker"`.
- Rendering: when a player has `attendance === "joker"`, add a
  separate chip row `ChipRow title="Joker" tone="warning"` (new
  tone variant, yellow/amber).
- Players with `attendance === "joker"` are NOT counted in
  "Dabei / Offen / Abgesagt" totals — the Joker row stands on its
  own.

For `roster_locked` and `in_progress`, the page currently shows
only the matches list. Extract the chip-grid portion of
`PlannedSection` into a shared server component
`<RosterChips participants={…} />` (new file
`src/app/game-day/roster-chips.tsx`). Render it:

- inside `PlannedSection` in place of the current chip block
  (`planned` phase), and
- directly on the page above the matches list for `roster_locked`
  and `in_progress`.

The Joker chip row is part of `<RosterChips>`, so all three
phases display it consistently. `finished` keeps using the
ranking + `<JokerBlock />` combination inside `FinishedSummary`.

## 5. Testing

- `tests/integration/joker-list.test.ts` (new)
  - `listJokersForGameDay` returns empty for unused day, one row
    per use, sorts by name, converts Decimal to number.
- `tests/components/joker-block.test.tsx` (new)
  - Renders nothing for empty list.
  - Renders heading and formula line with de-formatted ppg and
    rounded points.
- `tests/components/archive-list-badge.test.tsx` (new) or extend
  an existing archive-page test: badge is shown only when
  `jokerCount > 0`.
- `tests/components/planned-section.test.tsx` (extend)
  - Joker participant appears in the "Joker"-Chip-Row, not in
    "Dabei/Offen/Abgesagt".

## 6. Non-goals / YAGNI

- No new index on `JokerUse(gameDayId)` unless profiling shows it
  needed.
- No admin log of "who set whose Joker" — `AuditLog` already has
  that data; exposing it is a separate feature.
- No charts or per-season aggregation. That belongs in a separate
  stats feature.
- The Joker block does not re-show the player's ranking-table row.
  A Joker-Nutzer has no real matches that day, so they never appear
  in `computeGameDaySummary`'s ranking — the Joker block is their
  only presence on the detail page.

## 7. Open questions

None remaining; all three scope questions (a/b/c), ranking
treatment (Variant B), badge format ("Joker N"), and planned/in-
progress display (badge without points) were resolved during
brainstorming.
