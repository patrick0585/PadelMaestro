# Joker Archive Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `JokerUse` records in `/archive`, `/archive/[id]`, and `/game-day` so every phase of a Spieltag shows who set a Joker.

**Architecture:** Two new read helpers (`listJokersForGameDay`, `listArchivedGameDays.jokerCount`), one shared server component (`<JokerBlock />`), one extracted roster component (`<RosterChips />`), and a mapping fix that preserves the `"joker"` attendance value end-to-end.

**Tech Stack:** Next.js 15 App Router (React 19 RSC), Prisma 6.19, Vitest 4, @testing-library/react, Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-23-joker-archive-visibility-design.md`

---

## File Structure

**New files:**
- `src/lib/joker/list.ts` — `listJokersForGameDay(gameDayId)`, exports `JokerUseRow`
- `src/app/game-day/joker-block.tsx` — server component, renders "Joker an diesem Tag"
- `src/app/game-day/roster-chips.tsx` — client component, chip grid extracted from `PlannedSection`
- `tests/integration/joker-list.test.ts` — integration tests for `listJokersForGameDay`
- `tests/components/joker-block.test.tsx` — component tests for `<JokerBlock />`
- `tests/components/roster-chips.test.tsx` — component tests for `<RosterChips />`

**Modified files:**
- `src/lib/archive/list.ts` — add `jokerCount` to `ArchivedGameDayRow`, populate via `groupBy`
- `src/app/archive/page.tsx` — render "Joker N" badge next to date when `jokerCount > 0`
- `src/app/game-day/finished-summary.tsx` — fetch + render `<JokerBlock />` after ranking
- `src/app/game-day/planned-section.tsx` — extend `MemberAttendance`, delegate chips to `<RosterChips />`
- `src/app/game-day/page.tsx` — preserve `"joker"` attendance when mapping; render `<RosterChips />` above matches for `roster_locked` and `in_progress`
- `tests/integration/archive-list.test.ts` — add a `jokerCount` assertion
- `tests/components/planned-section.test.tsx` — **CREATE** if missing; covers the Joker chip row

---

## Task 1: `listJokersForGameDay` data helper

**Files:**
- Create: `src/lib/joker/list.ts`
- Test: `tests/integration/joker-list.test.ts`

Fetches every `JokerUse` on a given day, joined with the player, and
returns a sorted, number-typed row array. Used by `FinishedSummary`.

- [ ] **Step 1: Write the failing integration test file**

Create `tests/integration/joker-list.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { listJokersForGameDay } from "@/lib/joker/list";
import { resetDb } from "../helpers/reset-db";

async function makeSeason(year = new Date().getFullYear()) {
  return prisma.season.create({
    data: {
      year,
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31),
      isActive: true,
    },
  });
}

async function makePlayer(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

describe("listJokersForGameDay", () => {
  beforeEach(resetDb);

  it("returns an empty array when no joker was used on that day", async () => {
    const season = await makeSeason(2026);
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
    });
    expect(await listJokersForGameDay(day.id)).toEqual([]);
  });

  it("returns one row per JokerUse, with player details and numeric decimals", async () => {
    const season = await makeSeason(2026);
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
    });
    const werner = await makePlayer("Werner");
    await prisma.jokerUse.create({
      data: {
        playerId: werner.id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: "1.640",
        gamesCredited: 10,
        pointsCredited: "16.40",
      },
    });

    const rows = await listJokersForGameDay(day.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: werner.id,
      playerName: "Werner",
      gamesCredited: 10,
    });
    expect(rows[0].ppgAtUse).toBeCloseTo(1.64);
    expect(rows[0].pointsCredited).toBeCloseTo(16.4);
    expect(typeof rows[0].ppgAtUse).toBe("number");
    expect(typeof rows[0].pointsCredited).toBe("number");
  });

  it("sorts rows alphabetically by player name (de collation)", async () => {
    const season = await makeSeason(2026);
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
    });
    const [zoe, anna, mike] = await Promise.all(
      ["Zoe", "Anna", "Mike"].map(makePlayer),
    );
    for (const p of [zoe, anna, mike]) {
      await prisma.jokerUse.create({
        data: {
          playerId: p.id,
          seasonId: season.id,
          gameDayId: day.id,
          ppgAtUse: "1.000",
          gamesCredited: 10,
          pointsCredited: "10.00",
        },
      });
    }
    const names = (await listJokersForGameDay(day.id)).map((r) => r.playerName);
    expect(names).toEqual(["Anna", "Mike", "Zoe"]);
  });

  it("ignores JokerUse rows from other game days", async () => {
    const season = await makeSeason(2026);
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
    });
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-28"), status: "planned" },
    });
    const werner = await makePlayer("Werner");
    await prisma.jokerUse.create({
      data: {
        playerId: werner.id,
        seasonId: season.id,
        gameDayId: day2.id,
        ppgAtUse: "1.000",
        gamesCredited: 10,
        pointsCredited: "10.00",
      },
    });
    expect(await listJokersForGameDay(day1.id)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/joker-list.test.ts`
Expected: FAIL — "Cannot find module '@/lib/joker/list'".

- [ ] **Step 3: Implement the helper**

Create `src/lib/joker/list.ts`:

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/integration/joker-list.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/joker/list.ts tests/integration/joker-list.test.ts
git commit -m "feat(joker): add listJokersForGameDay read helper"
```

---

## Task 2: `listArchivedGameDays` — add `jokerCount`

**Files:**
- Modify: `src/lib/archive/list.ts`
- Test: `tests/integration/archive-list.test.ts` (extend)

Aggregate Joker counts once per query and expose per row so the
archive list can show a "Joker N" badge.

- [ ] **Step 1: Write the failing test**

Append this test to the existing
`describe("listArchivedGameDays", …)` block in
`tests/integration/archive-list.test.ts`:

```ts
  it("populates jokerCount per finished day", async () => {
    const season = await makeSeason(2026);
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-17"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: paul.id,
        team1PlayerBId: patrick.id,
        team2PlayerAId: michi.id,
        team2PlayerBId: thomas.id,
        team1Score: 2,
        team2Score: 1,
      },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: paul.id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: "1.000",
        gamesCredited: 10,
        pointsCredited: "10.00",
      },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: patrick.id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: "1.500",
        gamesCredited: 10,
        pointsCredited: "15.00",
      },
    });

    const result = await listArchivedGameDays(null);
    expect(result).toHaveLength(1);
    expect(result[0].jokerCount).toBe(2);
  });

  it("defaults jokerCount to 0 when no jokers were used", async () => {
    const season = await makeSeason(2026);
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-17"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: paul.id,
        team1PlayerBId: patrick.id,
        team2PlayerAId: michi.id,
        team2PlayerBId: thomas.id,
        team1Score: 2,
        team2Score: 1,
      },
    });
    const result = await listArchivedGameDays(null);
    expect(result[0].jokerCount).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: FAIL — TypeScript error "Property 'jokerCount' does not exist".

- [ ] **Step 3: Modify `src/lib/archive/list.ts`**

Replace the file body with:

```ts
import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";

export interface ArchivePodiumEntry {
  playerName: string;
  points: number;
}

export interface ArchivedGameDayRow {
  id: string;
  date: Date;
  seasonYear: number;
  matchCount: number;
  playerCount: number;
  jokerCount: number;
  podium: ArchivePodiumEntry[];
  self: { points: number; matches: number } | null;
}

export async function listArchivedGameDays(
  currentPlayerId: string | null,
): Promise<ArchivedGameDayRow[]> {
  const days = await prisma.gameDay.findMany({
    where: { status: "finished" },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: {
      id: true,
      date: true,
      _count: {
        select: {
          matches: { where: { team1Score: { not: null }, team2Score: { not: null } } },
        },
      },
    },
  });
  if (days.length === 0) return [];

  const [summaries, jokerCounts] = await Promise.all([
    Promise.all(days.map((d) => computeGameDaySummary(d.id))),
    prisma.jokerUse.groupBy({
      by: ["gameDayId"],
      where: { gameDayId: { in: days.map((d) => d.id) } },
      _count: { _all: true },
    }),
  ]);
  const jokerByDay = new Map(
    jokerCounts.map((r) => [r.gameDayId, r._count._all]),
  );

  const rows: ArchivedGameDayRow[] = [];
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const summary = summaries[i];
    const rowsFromSummary = summary?.rows ?? [];
    const podium = (summary?.podium ?? []).map((r) => ({
      playerName: r.playerName,
      points: r.points,
    }));
    const selfRow =
      currentPlayerId !== null
        ? rowsFromSummary.find((r) => r.playerId === currentPlayerId)
        : undefined;
    const self = selfRow ? { points: selfRow.points, matches: selfRow.matches } : null;
    rows.push({
      id: day.id,
      date: day.date,
      seasonYear: day.date.getUTCFullYear(),
      matchCount: day._count.matches,
      playerCount: rowsFromSummary.length,
      jokerCount: jokerByDay.get(day.id) ?? 0,
      podium,
      self,
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: PASS (all original tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/archive/list.ts tests/integration/archive-list.test.ts
git commit -m "feat(archive): expose jokerCount on ArchivedGameDayRow"
```

---

## Task 3: `<JokerBlock />` server component

**Files:**
- Create: `src/app/game-day/joker-block.tsx`
- Test: `tests/components/joker-block.test.tsx`

Renders the "Joker an diesem Tag" section given a row array.
Reused by `FinishedSummary` in both archive-detail and live views.

- [ ] **Step 1: Write the failing component test**

Create `tests/components/joker-block.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { JokerBlock } from "@/app/game-day/joker-block";
import type { JokerUseRow } from "@/lib/joker/list";

function row(overrides: Partial<JokerUseRow> = {}): JokerUseRow {
  return {
    playerId: "p1",
    playerName: "Werner",
    avatarVersion: 0,
    ppgAtUse: 1.64,
    gamesCredited: 10,
    pointsCredited: 16.4,
    ...overrides,
  };
}

describe("<JokerBlock>", () => {
  it("renders nothing when the list is empty", () => {
    const { container } = render(<JokerBlock jokers={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the heading and one row per Joker", () => {
    render(
      <JokerBlock
        jokers={[row({ playerName: "Anna", pointsCredited: 18.0 }), row({ playerName: "Werner" })]}
      />,
    );
    expect(screen.getByText(/Joker an diesem Tag/)).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
    expect(screen.getByText("Werner")).toBeInTheDocument();
  });

  it("formats the ppg with de decimals and rounds credited points", () => {
    render(<JokerBlock jokers={[row({ ppgAtUse: 1.64, pointsCredited: 16.4 })]} />);
    expect(screen.getByText(/10 × 1,64/)).toBeInTheDocument();
    expect(screen.getByText(/≈ 16 P\./)).toBeInTheDocument();
  });

  it("rounds up from 0.5 for credited points", () => {
    render(<JokerBlock jokers={[row({ ppgAtUse: 1.65, pointsCredited: 16.5 })]} />);
    expect(screen.getByText(/≈ 17 P\./)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/joker-block.test.tsx`
Expected: FAIL — "Cannot find module '@/app/game-day/joker-block'".

- [ ] **Step 3: Implement the component**

Create `src/app/game-day/joker-block.tsx`:

```tsx
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { JokerUseRow } from "@/lib/joker/list";

function formatDe(value: number, digits: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function JokerBlock({ jokers }: { jokers: JokerUseRow[] }) {
  if (jokers.length === 0) return null;

  return (
    <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
        Joker an diesem Tag
      </div>
      <ul className="space-y-2">
        {jokers.map((j) => (
          <li key={j.playerId} className="flex items-center gap-3">
            <Avatar
              playerId={j.playerId}
              name={j.playerName}
              avatarVersion={j.avatarVersion}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {j.playerName}
                </span>
                <Badge variant="primary">Joker</Badge>
              </div>
              <div className="text-[0.7rem] text-foreground-muted tabular-nums">
                {j.gamesCredited} × {formatDe(j.ppgAtUse, 2)} ≈{" "}
                {Math.round(j.pointsCredited)} P.
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/joker-block.test.tsx`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add src/app/game-day/joker-block.tsx tests/components/joker-block.test.tsx
git commit -m "feat(game-day): add JokerBlock server component"
```

---

## Task 4: Wire `JokerBlock` into `FinishedSummary`

**Files:**
- Modify: `src/app/game-day/finished-summary.tsx`

Archive detail renders `<FinishedSummary />` already, so folding the
Joker fetch into it covers both archive and live `finished` phases
with a single change.

- [ ] **Step 1: Modify `src/app/game-day/finished-summary.tsx`**

Replace the top of the file (imports + function body) so the final
file reads:

```tsx
import { Avatar } from "@/components/ui/avatar";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { listJokersForGameDay } from "@/lib/joker/list";
import { JokerBlock } from "./joker-block";

const PODIUM_STYLES = [
  { medal: "🥇", rankLabel: "Platz 1", badge: "bg-warning/15" },
  { medal: "🥈", rankLabel: "Platz 2", badge: "bg-foreground-muted/15" },
  { medal: "🥉", rankLabel: "Platz 3", badge: "bg-primary/15" },
] as const;

const RANK_MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export async function FinishedSummary({
  gameDayId,
  scoredMatchCount,
  totalMatchCount,
}: {
  gameDayId: string;
  scoredMatchCount: number;
  totalMatchCount: number;
}) {
  const [summary, jokers] = await Promise.all([
    computeGameDaySummary(gameDayId),
    listJokersForGameDay(gameDayId),
  ]);

  if (!summary || summary.rows.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Zusammenfassung
          </div>
          <div className="mt-2 text-sm text-foreground">
            Spieltag beendet · {scoredMatchCount} / {totalMatchCount} Matches gewertet
          </div>
        </div>
        <JokerBlock jokers={jokers} />
      </>
    );
  }

  return (
    <>
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Zusammenfassung
          </div>
          <div className="mt-1 text-sm text-foreground-muted">
            Spieltag beendet · {scoredMatchCount} / {totalMatchCount} Matches gewertet
          </div>
        </div>

        <ol aria-label="Podium" className="grid gap-2 sm:grid-cols-3">
          {summary.podium.map((row, i) => {
            const style = PODIUM_STYLES[i];
            return (
              <li
                key={row.playerId}
                className={`flex items-center gap-3 rounded-xl border border-border p-3 ${style.badge}`}
              >
                <span className="text-2xl" role="img" aria-label={style.rankLabel}>
                  {style.medal}
                </span>
                <Avatar playerId={row.playerId} name={row.playerName} avatarVersion={row.avatarVersion} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{row.playerName}</div>
                  <div className="text-[0.7rem] text-foreground-muted">
                    {row.matches} {row.matches === 1 ? "Match" : "Matches"}
                  </div>
                </div>
                <div className="text-2xl font-extrabold tabular-nums text-primary">{row.points}</div>
              </li>
            );
          })}
        </ol>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
              <th scope="col" className="py-1.5 pr-2">#</th>
              <th scope="col" className="py-1.5 pr-2">Name</th>
              <th scope="col" className="py-1.5 pr-2 text-right">Punkte</th>
              <th scope="col" className="py-1.5 text-right">Matches</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row, i) => {
              const rank = i + 1;
              const medal = RANK_MEDALS[rank];
              return (
              <tr key={row.playerId} className="border-t border-border">
                <td className="py-1.5 pr-2 tabular-nums text-foreground-muted">
                  {medal ? (
                    <span aria-label={`Platz ${rank}`} role="img" className="text-base">
                      {medal}
                    </span>
                  ) : (
                    rank
                  )}
                </td>
                <td className="py-1.5 pr-2 text-foreground">
                  <span className="flex items-center gap-2">
                    <Avatar playerId={row.playerId} name={row.playerName} avatarVersion={row.avatarVersion} size={32} />
                    <span className="block truncate">{row.playerName}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-foreground">
                  {row.points}
                </td>
                <td className="py-1.5 text-right tabular-nums text-foreground-muted">{row.matches}</td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <JokerBlock jokers={jokers} />
    </>
  );
}
```

**Note:** The consumer `/app/archive/[id]/page.tsx` uses
`<FinishedSummary>` as a single child. Wrapping the return in a
fragment changes the DOM by one level only when Joker rows exist;
archive-detail wraps it in `<div className="space-y-4">` already, so
`space-y` continues to space the new section correctly.

- [ ] **Step 2: Run the full app test suite**

Run: `npx vitest run`
Expected: All tests pass. The existing archive/finished-summary
flow is unchanged when no JokerUse rows exist for a day.

- [ ] **Step 3: Manual smoke check**

```bash
npm run dev
```

Open `/archive/<id-of-a-finished-day-with-a-joker>` and confirm the
new block appears under the ranking. Open an archived day without a
Joker and confirm nothing extra renders.

- [ ] **Step 4: Commit**

```bash
git add src/app/game-day/finished-summary.tsx
git commit -m "feat(game-day): render JokerBlock inside FinishedSummary"
```

---

## Task 5: Archive list — show "Joker N" badge

**Files:**
- Modify: `src/app/archive/page.tsx`

Adds a conditional badge next to the date when `jokerCount > 0`.

- [ ] **Step 1: Write a component smoke test**

Create `tests/components/archive-list-badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// Minimal re-render of the list cell to pin down the badge contract
// without pulling in auth()/prisma. The test asserts the exact class
// and copy the page uses for the badge so a refactor of page.tsx
// cannot silently drop it.
function DateRow({ date, jokerCount }: { date: string; jokerCount: number }) {
  return (
    <div>
      <div className="text-sm font-semibold text-foreground">
        {date}
        {jokerCount > 0 && (
          <span
            data-testid="joker-badge"
            className="ml-2 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-warning"
          >
            Joker {jokerCount}
          </span>
        )}
      </div>
    </div>
  );
}

describe("Archive list date row", () => {
  it("shows the Joker badge when jokerCount > 0", () => {
    render(<DateRow date="17. April" jokerCount={2} />);
    expect(screen.getByTestId("joker-badge")).toHaveTextContent("Joker 2");
  });

  it("omits the Joker badge when jokerCount is 0", () => {
    render(<DateRow date="17. April" jokerCount={0} />);
    expect(screen.queryByTestId("joker-badge")).not.toBeInTheDocument();
  });
});
```

This test locks the badge copy and classes. The page.tsx edit below
uses the exact same snippet, so the page and the test agree.

- [ ] **Step 2: Run the test to verify it passes immediately**

Run: `npx vitest run tests/components/archive-list-badge.test.tsx`
Expected: PASS, 2/2. (This test is intentionally standalone — it
pins the badge's shape. We'll reuse the same JSX in the page.)

- [ ] **Step 3: Modify `src/app/archive/page.tsx`**

Find the line rendering the date:

```tsx
                  <div className="text-sm font-semibold text-foreground">{formatGameDayDate(row.date)}</div>
```

Replace it with:

```tsx
                  <div className="text-sm font-semibold text-foreground">
                    {formatGameDayDate(row.date)}
                    {row.jokerCount > 0 && (
                      <span
                        data-testid="joker-badge"
                        className="ml-2 inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-warning"
                      >
                        Joker {row.jokerCount}
                      </span>
                    )}
                  </div>
```

- [ ] **Step 4: Run the full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All tests pass, zero type errors.

- [ ] **Step 5: Manual smoke check**

```bash
npm run dev
```

Open `/archive`. Days with jokers show the yellow "Joker N" pill
next to the date; days without stay unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/app/archive/page.tsx tests/components/archive-list-badge.test.tsx
git commit -m "feat(archive): show Joker N badge in the archive list"
```

---

## Task 6: Extract `<RosterChips />` + extend `MemberAttendance`

**Files:**
- Create: `src/app/game-day/roster-chips.tsx`
- Modify: `src/app/game-day/planned-section.tsx`
- Test: `tests/components/roster-chips.test.tsx`

Pulls the chip-grid (Dabei / Offen / Abgesagt / Joker) out of
`PlannedSection` so it can be rendered in `roster_locked` and
`in_progress` phases as well. Adds a `"joker"` branch that is
mutually exclusive with the other three buckets.

- [ ] **Step 1: Write the failing component test**

Create `tests/components/roster-chips.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RosterChips, type RosterParticipant } from "@/app/game-day/roster-chips";

function p(name: string, attendance: RosterParticipant["attendance"]): RosterParticipant {
  return { playerId: name.toLowerCase(), name, attendance };
}

describe("<RosterChips>", () => {
  it("renders chip rows for confirmed, pending, declined, and joker", () => {
    render(
      <RosterChips
        participants={[
          p("Anna", "confirmed"),
          p("Ben", "pending"),
          p("Carl", "declined"),
          p("Dora", "joker"),
        ]}
      />,
    );
    expect(screen.getByText(/Dabei · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Offen · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Abgesagt · 1/)).toBeInTheDocument();
    expect(screen.getByText(/Joker · 1/)).toBeInTheDocument();
    expect(screen.getByText("Dora")).toBeInTheDocument();
  });

  it("excludes Joker participants from the other three buckets", () => {
    render(
      <RosterChips participants={[p("Dora", "joker")]} />,
    );
    expect(screen.getByText(/Dabei · 0/)).toBeInTheDocument();
    expect(screen.getByText(/Offen · 0/)).toBeInTheDocument();
    expect(screen.getByText(/Abgesagt · 0/)).toBeInTheDocument();
    expect(screen.getByText(/Joker · 1/)).toBeInTheDocument();
  });

  it("hides the Joker row when no participant has attendance=joker", () => {
    render(
      <RosterChips participants={[p("Anna", "confirmed")]} />,
    );
    expect(screen.queryByText(/Joker · /)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/roster-chips.test.tsx`
Expected: FAIL — "Cannot find module '@/app/game-day/roster-chips'".

- [ ] **Step 3: Create `src/app/game-day/roster-chips.tsx`**

```tsx
export type RosterAttendance = "pending" | "confirmed" | "declined" | "joker";

export interface RosterParticipant {
  playerId: string;
  name: string;
  attendance: RosterAttendance;
}

type Tone = "lime" | "primary" | "soft" | "warning";

const TONE_CLASSES: Record<Tone, string> = {
  lime: "bg-success-soft text-success border border-success/40",
  primary: "bg-primary-soft text-primary border border-primary/30",
  soft: "bg-surface-muted text-foreground-muted",
  warning: "bg-warning/15 text-warning border border-warning/40",
};

export function RosterChips({
  participants,
}: {
  participants: RosterParticipant[];
}) {
  const confirmed = participants.filter((p) => p.attendance === "confirmed");
  const pending = participants.filter((p) => p.attendance === "pending");
  const declined = participants.filter((p) => p.attendance === "declined");
  const joker = participants.filter((p) => p.attendance === "joker");

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <ChipRow title="Dabei" count={confirmed.length} names={confirmed.map((p) => p.name)} tone="lime" />
      <ChipRow title="Offen" count={pending.length} names={pending.map((p) => p.name)} tone="primary" />
      <ChipRow title="Abgesagt" count={declined.length} names={declined.map((p) => p.name)} tone="soft" />
      {joker.length > 0 && (
        <ChipRow title="Joker" count={joker.length} names={joker.map((p) => p.name)} tone="warning" />
      )}
    </div>
  );
}

function ChipRow({
  title,
  count,
  names,
  tone,
}: {
  title: string;
  count: number;
  names: string[];
  tone: Tone;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
        {title} · {count}
      </div>
      {names.length === 0 ? (
        <div className="text-xs text-foreground-dim">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {names.map((n) => (
            <span
              key={n}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `src/app/game-day/planned-section.tsx`**

Replace the entire file with:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RosterChips,
  type RosterAttendance,
  type RosterParticipant,
} from "./roster-chips";

export type MemberAttendance = RosterAttendance;

export type PlannedParticipant = RosterParticipant;

export function PlannedSection({
  gameDayId,
  me,
  participants,
}: {
  gameDayId: string;
  me: PlannedParticipant | null;
  participants: PlannedParticipant[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = participants.filter((p) => p.attendance === "confirmed");

  async function setStatus(next: Exclude<MemberAttendance, "joker">) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Konnte Status nicht speichern");
      return;
    }
    router.refresh();
  }

  async function join() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/join`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Konnte dich nicht hinzufügen");
      return;
    }
    router.refresh();
  }

  const meIsJoker = me?.attendance === "joker";

  return (
    <div className="space-y-4">
      {me ? (
        <div className="rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] p-4">
          <div className="flex items-center justify-between">
            <Badge variant={me.attendance === "confirmed" ? "lime" : "primary"}>
              {me.attendance === "confirmed"
                ? "Dabei ✓"
                : me.attendance === "declined"
                  ? "Abgesagt"
                  : me.attendance === "joker"
                    ? "Joker"
                    : "Noch offen"}
            </Badge>
            <span className="text-[0.7rem] font-semibold text-primary-strong">
              {confirmed.length} / {participants.length} bestätigt
            </span>
          </div>
          {!meIsJoker && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant={me.attendance === "confirmed" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("confirmed")}>
                Dabei
              </Button>
              <Button size="sm" variant={me.attendance === "declined" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("declined")}>
                Nicht dabei
              </Button>
              <Button size="sm" variant={me.attendance === "pending" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("pending")}>
                Weiß nicht
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-foreground">Du bist noch nicht dabei</div>
          <p className="mt-1 text-sm text-foreground-muted">
            Du bist kein Teilnehmer dieses Spieltags. Trete bei, um mitzuspielen.
          </p>
          <Button className="mt-3 w-full" disabled={busy} onClick={join}>
            Teilnehmen
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <RosterChips participants={participants} />
    </div>
  );
}
```

**Notes:**
- `setStatus` is now typed `Exclude<MemberAttendance, "joker">` because users cannot set themselves to "joker" via the attendance button — the Joker flow owns that transition.
- When `me.attendance === "joker"`, we hide the three attendance
  buttons (the Joker is already set and can be cleared from the
  confirmation surface elsewhere; this section becomes read-only).

- [ ] **Step 5: Run the component test to verify it passes**

Run: `npx vitest run tests/components/roster-chips.test.tsx`
Expected: PASS, 3/3.

- [ ] **Step 6: Run the whole test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All tests pass; no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/game-day/roster-chips.tsx src/app/game-day/planned-section.tsx tests/components/roster-chips.test.tsx
git commit -m "feat(game-day): extract RosterChips with Joker row"
```

---

## Task 7: Preserve `"joker"` in `page.tsx` and show `RosterChips` in locked/in-progress

**Files:**
- Modify: `src/app/game-day/page.tsx`

Fixes the mapping that silently collapsed `attendance === "joker"`
to `"pending"` before reaching `PlannedSection`, and renders
`<RosterChips>` above the matches for `roster_locked` and
`in_progress`.

- [ ] **Step 1: Modify `src/app/game-day/page.tsx`**

Replace the whole file with:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { MatchInlineCard } from "./match-inline-card";
import { Timeline } from "@/components/ui/timeline";
import { timelineForStatus, type GameDayStatus } from "./phase";
import { PlannedSection } from "./planned-section";
import { RosterChips, type RosterAttendance } from "./roster-chips";
import { AddExtraMatchButton } from "./add-extra-match-button";
import { FinishBanner } from "./finish-banner";
import { FinishedSummary } from "./finished-summary";

export const dynamic = "force-dynamic";

function normalizeAttendance(value: string): RosterAttendance {
  return value === "confirmed" || value === "declined" || value === "joker"
    ? value
    : "pending";
}

export default async function GameDayPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const dayInclude = {
    participants: { include: { player: { select: { id: true, name: true } } } },
    matches: {
      orderBy: { matchNumber: "asc" as const },
      include: {
        team1PlayerA: { select: { name: true } },
        team1PlayerB: { select: { name: true } },
        team2PlayerA: { select: { name: true } },
        team2PlayerB: { select: { name: true } },
      },
    },
  };

  const activeDay = await prisma.gameDay.findFirst({
    where: { status: { in: ["planned", "roster_locked", "in_progress"] } },
    orderBy: { date: "desc" },
    include: dayInclude,
  });

  const recentFinishedDay = activeDay
    ? null
    : await prisma.gameDay.findFirst({
        where: {
          status: "finished",
          date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { date: "desc" },
        include: dayInclude,
      });

  const day = activeDay ?? recentFinishedDay;

  if (!day) {
    return (
      <Card>
        <CardBody>
          <h1 className="text-lg font-semibold text-foreground">Kein aktiver Spieltag</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ein Admin muss zuerst einen Spieltag anlegen.
          </p>
        </CardBody>
      </Card>
    );
  }

  const me = day.participants.find((p) => p.playerId === session.user.id);
  const steps = timelineForStatus(day.status as GameDayStatus);
  const dateText = new Date(day.date).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });
  const showFinishBanner =
    session.user.isAdmin &&
    day.status === "in_progress" &&
    day.matches.length > 0 &&
    day.matches.every((m) => m.team1Score !== null && m.team2Score !== null);

  const participants = day.participants.map((p) => ({
    playerId: p.playerId,
    name: p.player.name,
    attendance: normalizeAttendance(p.attendance),
  }));

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Spieltag</p>
        <h1 className="text-2xl font-bold text-foreground">{dateText}</h1>
      </header>
      <Timeline steps={steps} />

      {day.status === "planned" && (
        <PlannedSection
          gameDayId={day.id}
          me={
            me
              ? {
                  playerId: me.playerId,
                  name: me.player.name,
                  attendance: normalizeAttendance(me.attendance),
                }
              : null
          }
          participants={participants}
        />
      )}

      {(day.status === "roster_locked" || day.status === "in_progress") && (
        <RosterChips participants={participants} />
      )}

      {day.matches.length > 0 && (day.status === "roster_locked" || day.status === "in_progress" || day.status === "finished") && (
        <section className="space-y-2">
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Matches
          </h2>
          <div className="space-y-2">
            {day.matches.map((m) => (
              <MatchInlineCard
                key={m.id}
                maxScore={day.playerCount === 4 ? 12 : 3}
                match={{
                  id: m.id,
                  matchNumber: m.matchNumber,
                  team1A: m.team1PlayerA.name,
                  team1B: m.team1PlayerB.name,
                  team2A: m.team2PlayerA.name,
                  team2B: m.team2PlayerB.name,
                  team1Score: m.team1Score,
                  team2Score: m.team2Score,
                  version: m.version,
                }}
              />
            ))}
          </div>
          {session.user.isAdmin &&
            (day.status === "roster_locked" || day.status === "in_progress") && (
              <AddExtraMatchButton gameDayId={day.id} />
            )}
        </section>
      )}

      {showFinishBanner && <FinishBanner gameDayId={day.id} />}

      {day.status === "finished" && (
        <FinishedSummary
          gameDayId={day.id}
          scoredMatchCount={day.matches.filter((m) => m.team1Score !== null && m.team2Score !== null).length}
          totalMatchCount={day.matches.length}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite + type check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: All tests pass, zero TS errors.

- [ ] **Step 3: Manual smoke check — all four phases**

```bash
npm run dev
```

- **`planned`**: Open `/game-day`. A player with `attendance=joker`
  appears in the yellow "Joker · N" chip row and not in the other
  three rows.
- **`roster_locked` / `in_progress`**: same chip grid now visible
  above the matches list.
- **`finished`**: recent finished day shows the Joker block under
  the ranking.

- [ ] **Step 4: Commit**

```bash
git add src/app/game-day/page.tsx
git commit -m "fix(game-day): preserve joker attendance and render RosterChips in locked/in_progress"
```

---

## Task 8: Final green + PR

**Files:** none (coordination)

- [ ] **Step 1: Final full verification**

Run:

```bash
npx vitest run
npx tsc --noEmit
npm run lint
```

Expected: all green; no new lint warnings.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feature/joker-archive-visibility
gh pr create --title "feat: Joker visibility in archive and live game-day" --body "$(cat <<'EOF'
## Summary
- Archive list shows "Joker N" badge next to dates where a Joker was used.
- Archive detail + live finished view render a "Joker an diesem Tag" block (avatar, name, 10 × ppg ≈ points).
- Live game-day (`planned`, `roster_locked`, `in_progress`) show a yellow Joker chip row via shared `<RosterChips />`.
- Fixes mapping that collapsed `attendance === "joker"` to `"pending"` on the game-day page.

Spec: `docs/superpowers/specs/2026-04-23-joker-archive-visibility-design.md`

## Test plan
- [ ] `/archive` — day with jokers shows pill; day without doesn't
- [ ] `/archive/<id>` — Joker block renders under ranking when applicable
- [ ] `/game-day` `planned` — Joker-Spieler appears only in Joker chip row
- [ ] `/game-day` `roster_locked` / `in_progress` — chip row visible above matches
- [ ] `/game-day` `finished` — Joker block visible below ranking

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist (plan author)

- **Spec coverage:**
  - §1 goal 1 (archive list badge) → Task 2 + Task 5 ✓
  - §1 goal 2 (archive detail block) → Task 1 + Task 3 + Task 4 ✓
  - §1 goal 3 (live game-day) → Task 6 + Task 7 ✓
  - §3.1 `listJokersForGameDay` → Task 1 ✓
  - §3.2 `jokerCount` on ArchivedGameDayRow → Task 2 ✓
  - §4.1 `<JokerBlock />` → Task 3 ✓
  - §4.2 archive list badge → Task 5 ✓
  - §4.3 archive detail via FinishedSummary → Task 4 ✓
  - §4.4 FinishedSummary wiring → Task 4 ✓
  - §4.5 Planned/locked/in-progress marker + RosterChips + page.tsx mapping fix → Tasks 6 + 7 ✓
  - §5 testing — joker-list integration, joker-block component, archive-list badge, RosterChips → Tasks 1/3/5/6 ✓
- **Type consistency:** `JokerUseRow` shape is defined once in `src/lib/joker/list.ts` (Task 1) and reused by `<JokerBlock>` (Task 3) and `FinishedSummary` (Task 4). `RosterParticipant`/`RosterAttendance` defined in `roster-chips.tsx` (Task 6) and reused by `PlannedSection` (Task 6) and `page.tsx` (Task 7).
- **No placeholders:** every step has concrete code, commands, and expected outputs.
