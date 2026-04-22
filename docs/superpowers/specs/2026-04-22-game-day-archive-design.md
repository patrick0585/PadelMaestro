# Game-Day Archive — Design

**Date:** 2026-04-22
**Status:** Approved for implementation

## Goal

Give every logged-in player a way to browse all finished game days and drill into any one of them to see the final summary and every match played that day. Read-only. Must work on mobile and desktop.

Motivation: currently, once a game day transitions to `finished`, the landing view collapses to the podium/table for the *active* day only. Players have no way to look up what happened on prior game days — who played, what the pairings were, what the final scores were. This feature closes that gap.

## Architecture

New top-level route group under the existing Next.js App Router:

- `/archive` — list page (server component). Shows all finished game days, grouped by season, one row per game day.
- `/archive/[id]` — detail page (server component). Shows a single finished game day in full.

Both pages are server-rendered: auth check, data fetch via Prisma, render. No new client state.

A new service (`src/lib/archive/list.ts`) aggregates the list view's per-row data by reusing the existing `computeGameDaySummary` function from `src/lib/game-day/summary.ts`. No schema changes are needed — "archived" just means `GameDay.status = 'finished'` and we're querying historical data.

A new top-level navigation entry ("Archiv") is added to both `TopNav` (desktop) and `BottomTabs` (mobile), visible to every authenticated user.

## Access Control

- Must be authenticated → unauthenticated requests are redirected to sign-in (same pattern as existing protected pages via `auth()` in the server component; `middleware.ts` already gates authenticated routes).
- Every authenticated player can view every archived game day, including days they did not participate in.
- Read-only. No reopen, no re-score, no edit.

Admin role is not used here — the archive is not privileged.

---

## Route 1: `/archive` (List)

**File:** `src/app/archive/page.tsx` (new, server component, async)

### Data

Service call `listArchivedGameDays(currentPlayerId: string | null)` returns:

```ts
export type ArchivedGameDayRow = {
  id: string;
  date: Date;
  seasonYear: number;         // e.g., 2026 — derived from date for grouping
  matchCount: number;         // scored matches only
  playerCount: number;        // distinct player ids participating in scored matches
  podium: Array<{ playerName: string; points: number }>; // 0–3 entries
  self: { points: number; matches: number } | null;      // null if currentPlayer didn't play
};

export async function listArchivedGameDays(
  currentPlayerId: string | null,
): Promise<ArchivedGameDayRow[]>;
```

**Sort order:** `date DESC, id DESC` (most recent first, stable tiebreak).

**Season grouping:** the page groups rows by `seasonYear` before rendering. For the current schema where seasons are calendar years, this is simply `date.getFullYear()`. If the product later introduces explicit `Season` entities, this becomes the obvious extension point — but today, deriving from the date is correct and YAGNI-compliant.

**Internals:** the service queries all `GameDay` rows with `status = 'finished'`, then for each runs `computeGameDaySummary(id)` in parallel via `Promise.all`. From each summary, the service extracts `matchCount`, `playerCount`, top-3 podium, and the current player's row (if present). This keeps the aggregation logic in one place — anything `computeGameDaySummary` fixes (e.g., tie-breaks, scoring) automatically flows into the archive.

*Performance note:* for a typical club (tens of finished days per year), `Promise.all` over `computeGameDaySummary` is fine. If the day count explodes, we'd denormalize summary data into a table — out of scope here.

### Layout

**Header:**
- Page title: "Archiv"
- Subtitle: "Alle beendeten Spieltage" (hidden on small screens if cramped)

**Season groups** (iterate in descending year):
- Heading: the year (e.g., "2026"), styled as the existing section headings in `/ranking` and `/admin`
- Under each heading: vertically stacked rows, one per game day

**Each row** is a clickable element (an `<a>` wrapping the row contents → `/archive/{id}`) with the following structure:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Fr, 17.04.2026                                                       │
│ 🥇 Paul 5  🥈 Michi 4  🥉 Patrick 2                                   │
│ 2 Matches · 4 Spieler · Du: 3 Pt / 1 Match                           │
└──────────────────────────────────────────────────────────────────────┘
```

Concretely:
- **Line 1:** localized German date, weekday abbreviation prefix (e.g., "Fr, 17.04.2026"). Uses `Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })`.
- **Line 2:** podium. Up to three entries: medal glyph + name + points. Separated by spaces or a subtle divider. If the day has fewer than 3 podium rows (edge case), show only what's available.
- **Line 3:** meta row — `{matchCount} Matches · {playerCount} Spieler`, and if `self` is non-null, append ` · Du: {self.points} Pt / {self.matches} Match{self.matches === 1 ? "" : "es"}`. If the current player didn't play that day, omit the "Du:" block entirely (no "Du: 0 Pt / 0 Matches" ghost).

The row uses the existing `Card` / border tokens for visual consistency. The clickable hit target is the whole card (mobile-friendly). Hover state on desktop raises the card subtly. Focus ring on keyboard focus.

**Empty state:** if `listArchivedGameDays` returns `[]`, render a centered block:
- Icon (lucide `Archive` — same as the nav entry)
- Text: "Noch keine abgeschlossenen Spieltage."
- Subtext: "Sobald ein Spieltag beendet ist, erscheint er hier."

---

## Route 2: `/archive/[id]` (Detail)

**File:** `src/app/archive/[id]/page.tsx` (new, server component, async)

### Guard

1. Resolve `params.id`.
2. Load the `GameDay` with matches and relations needed for the read-only match cards.
3. If the `GameDay` doesn't exist or its status is not `finished`, call `notFound()` → Next.js 404. (The archive is explicitly for finished days; active days are reachable via `/game-day`.)

### Layout

**Header:**
- "← Zurück zum Archiv" link → `/archive`
- Page title: localized date (same format as list rows: "Fr, 17.04.2026")
- Subtitle: "Spieltag beendet"

**Summary block:**
- Reuses `<FinishedSummary gameDayId={...} scoredMatchCount={...} totalMatchCount={...} />` directly (the same server component that renders on the live finished state). No changes to `FinishedSummary`; it's already read-only.

**Match list:**
- Heading: "Paarungen"
- For each match in `matchNumber` ASC order, render a new read-only card: `<ReadOnlyMatchCard match={...} />`

### New component: `ReadOnlyMatchCard`

**File:** `src/app/archive/read-only-match-card.tsx` (new, server component — no `"use client"`).

**Why a new component:** the existing `src/app/game-day/match-inline-card.tsx` is a client component with edit state, stepper input, `router.refresh()`, etc. Reusing it in the archive would either mean expanding its props with a `readOnly` flag (polluting an already-busy component) or rendering client JS we don't need. The read-only variant is ~30 lines of pure JSX — a separate file is cheaper than a flag.

**Props:**
```ts
type ReadOnlyMatchCardProps = {
  match: {
    matchNumber: number;
    team1A: string;
    team1B: string;
    team2A: string;
    team2B: string;
    team1Score: number | null;
    team2Score: number | null;
  };
};
```

**Rendered structure** mirrors the non-editing state of `MatchInlineCard`:
- Header: "Match {n} · beendet" (or "· offen" if scores are null — shouldn't happen on a finished day, but defensive)
- Winner badge if there's a winner
- Team A / score : score / Team B grid (same column layout as the interactive card)
- No edit button, no stepper, no state

**Shared utilities:** if a presentation helper emerges cleanly (e.g., a `determineWinner(team1Score, team2Score)` pure function), extract it to `src/lib/game-day/match-display.ts` and use it from both cards. Don't force the extraction if the two cards' logic stays trivially separate.

---

## Navigation

**Files modified:**
- `src/components/bottom-tabs.tsx`
- `src/components/top-nav.tsx`

**Changes:**
- Import the lucide `Archive` icon for the archive entry.
- Append one entry to `USER_TABS` (bottom) and `USER_ITEMS` (top):
  ```ts
  { href: "/archive", label: "Archiv", icon: Archive } // bottom
  { href: "/archive", label: "Archiv" }                // top
  ```
- The entry sits between "Spieltag" and the admin tab (admins see Admin as the last tab).

**Active state:** both nav components already match by `pathname.startsWith(href)` or equivalent — verify this handles `/archive/{id}` correctly (the Archiv tab should be active on both `/archive` and `/archive/[id]`). Follow whatever matching logic the existing tabs use.

---

## Testing

**New file:** `tests/integration/archive-list.test.ts`

Cases:
1. **Aggregation** — three finished days, varied player sets; list returns one row per day with correct podium, matchCount, playerCount.
2. **Season grouping** — days from two different calendar years yield rows with correct `seasonYear` values; page-level grouping tested at a lightweight render level if practical (otherwise skipped — the grouping is pure array ops).
3. **Self block** — `currentPlayerId` that participated returns non-null `self`; `currentPlayerId` that didn't participate returns `self === null`; `currentPlayerId === null` (unauthenticated call path) returns `self === null` for every row.
4. **Sort order** — rows come back `date DESC`; two rows on the same date are ordered `id DESC`.
5. **Empty archive** — no finished days → empty array.
6. **Excludes non-finished** — `planned`/`in_progress`/`roster_locked` days do not appear, even if they have scored matches.

**Detail page** does not get a dedicated integration test file; route-level guard (`notFound()` on unknown/non-finished id) is thin and covered well enough by manual verification plus the reuse of already-tested `computeGameDaySummary`.

**Nav components** do not get new tests; the change is one line per file and visually verifiable.

---

## File Summary

**New files:**
- `src/app/archive/page.tsx`
- `src/app/archive/[id]/page.tsx`
- `src/app/archive/read-only-match-card.tsx`
- `src/lib/archive/list.ts`
- `tests/integration/archive-list.test.ts`

**Modified files:**
- `src/components/bottom-tabs.tsx` — add Archiv tab
- `src/components/top-nav.tsx` — add Archiv nav item

**Unchanged but reused:**
- `src/lib/game-day/summary.ts` — `computeGameDaySummary` reused for both list aggregation and detail-page summary block
- `src/app/game-day/finished-summary.tsx` — rendered as-is on the detail page

---

## Out of Scope

- **Re-opening or re-scoring** archived days — separate product decision; would need audit/locking semantics.
- **Search / filter / date pickers** on the list — if the archive grows past "comfortable to scroll", we add this. YAGNI for now.
- **CSV/PDF export** of a game day — not requested.
- **Per-player stats views** scoped to a season (e.g., "Paul's 2026 so far") — the ranking page already covers season aggregates; archive is day-scoped.
- **Animations** on row expand/transition — plain Next.js navigation is fine.
- **Explicit Season entities** — the product currently treats seasons as calendar years; introducing a `Season` model is a bigger refactor and out of scope here.
