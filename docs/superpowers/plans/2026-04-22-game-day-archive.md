# Game-Day Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every logged-in player a browsable archive of finished game days with drill-in to see the full summary and every match played that day.

**Architecture:** Two new Next.js App Router server routes (`/archive` list and `/archive/[id]` detail) backed by a new aggregation service that reuses the existing `computeGameDaySummary`. A new read-only match card component mirrors the non-editing visuals of `MatchInlineCard`. One "Archiv" entry added to both top and bottom nav. No schema changes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 6 strict, Prisma 6.19 on PostgreSQL, Vitest 4 integration tests, Tailwind design tokens already in the codebase.

**Spec:** `docs/superpowers/specs/2026-04-22-game-day-archive-design.md`

---

## File Plan

**New files:**
- `src/lib/archive/list.ts` — aggregation service: list of finished game days with per-row podium + meta + "you" block.
- `tests/integration/archive-list.test.ts` — integration tests against real Prisma/DB for the service.
- `src/app/archive/page.tsx` — list page, server component, auth-gated.
- `src/app/archive/[id]/page.tsx` — detail page, server component, auth-gated, `notFound()` for unknown/non-finished ids.
- `src/app/archive/read-only-match-card.tsx` — server component rendering a finished match without edit controls.

**Modified files:**
- `src/components/bottom-tabs.tsx` — add Archiv tab between Spieltag and Admin.
- `src/components/top-nav.tsx` — add Archiv nav item between Spieltag and Admin.

---

## Task 1: Archive list service

Builds the aggregation function that powers `/archive`. TDD with integration tests against real DB.

**Files:**
- Create: `src/lib/archive/list.ts`
- Create: `tests/integration/archive-list.test.ts`

- [ ] **Step 1: Write failing test — empty archive returns empty array**

Create `tests/integration/archive-list.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { listArchivedGameDays } from "@/lib/archive/list";
import { resetDb } from "../helpers/reset-db";

async function makeSeason(year = new Date().getFullYear()) {
  return prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
}

async function makeUser(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

describe("listArchivedGameDays", () => {
  beforeEach(resetDb);

  it("returns empty array when no finished days exist", async () => {
    const result = await listArchivedGameDays(null);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect module-not-found failure**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: FAIL — "Cannot find module '@/lib/archive/list'".

- [ ] **Step 3: Implement the service**

Create `src/lib/archive/list.ts`:

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

  const summaries = await Promise.all(days.map((d) => computeGameDaySummary(d.id)));

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
      seasonYear: day.date.getFullYear(),
      matchCount: day._count.matches,
      playerCount: rowsFromSummary.length,
      podium,
      self,
    });
  }
  return rows;
}
```

- [ ] **Step 4: Run test, verify empty-archive passes**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/archive/list.ts tests/integration/archive-list.test.ts
git commit -m "feat(archive): add listArchivedGameDays service"
```

- [ ] **Step 6: Write failing test — aggregates matchCount, playerCount, and podium**

Append to `tests/integration/archive-list.test.ts` (before the closing `});` of the `describe`):

```ts
  it("aggregates matchCount, playerCount, and podium per finished day", async () => {
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
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 2,
        team1PlayerAId: paul.id,
        team1PlayerBId: michi.id,
        team2PlayerAId: patrick.id,
        team2PlayerBId: thomas.id,
        team1Score: 3,
        team2Score: 0,
      },
    });

    const result = await listArchivedGameDays(null);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(day.id);
    expect(result[0].seasonYear).toBe(2026);
    expect(result[0].matchCount).toBe(2);
    expect(result[0].playerCount).toBe(4);
    expect(result[0].podium.map((p) => p.playerName)).toEqual(["Paul", "Michi", "Patrick"]);
    expect(result[0].podium[0].points).toBe(5);
    expect(result[0].self).toBeNull();
  });
```

- [ ] **Step 7: Run test, verify aggregation passes**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: 2 tests PASS.

- [ ] **Step 8: Write failing test — matchCount is independent of max-per-player**

The previous scenario has 4 players each playing all 2 matches, so `matchCount` would even be correct if we (wrongly) derived it from max per-player. This test pins that matchCount comes from the DB row count, not from summary rows. Append:

```ts
  it("returns correct matchCount when no single player played all matches", async () => {
    const season = await makeSeason(2026);
    const players = await Promise.all(
      ["A", "B", "C", "D", "E", "F", "G", "H"].map(makeUser),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 8, status: "finished" },
    });
    // Match 1: A,B vs C,D
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: players[0].id,
        team1PlayerBId: players[1].id,
        team2PlayerAId: players[2].id,
        team2PlayerBId: players[3].id,
        team1Score: 2,
        team2Score: 1,
      },
    });
    // Match 2: E,F vs G,H — fully disjoint players, no overlap with match 1
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 2,
        team1PlayerAId: players[4].id,
        team1PlayerBId: players[5].id,
        team2PlayerAId: players[6].id,
        team2PlayerBId: players[7].id,
        team1Score: 3,
        team2Score: 0,
      },
    });

    const result = await listArchivedGameDays(null);
    expect(result).toHaveLength(1);
    expect(result[0].matchCount).toBe(2);
    expect(result[0].playerCount).toBe(8);
  });
```

- [ ] **Step 9: Run test, verify it passes**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: 3 tests PASS.

- [ ] **Step 10: Commit aggregation tests**

```bash
git add tests/integration/archive-list.test.ts
git commit -m "test(archive): cover aggregation and matchCount correctness"
```

- [ ] **Step 11: Write failing test — self block populated for participating player**

Append test:

```ts
  it("populates self block for participating player", async () => {
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

    const resultForPatrick = await listArchivedGameDays(patrick.id);
    expect(resultForPatrick[0].self).toEqual({ points: 2, matches: 1 });
  });

  it("returns null self block for non-participating player", async () => {
    const season = await makeSeason(2026);
    const [paul, patrick, michi, thomas, outsider] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas", "Outsider"].map(makeUser),
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

    const result = await listArchivedGameDays(outsider.id);
    expect(result[0].self).toBeNull();
  });
```

- [ ] **Step 12: Run, verify both self tests pass**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 13: Write failing test — sort order is date DESC then id DESC**

Append test:

```ts
  it("sorts by date DESC then id DESC", async () => {
    const season = await makeSeason(2026);
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const dayOlder = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-03-10"), playerCount: 4, status: "finished" },
    });
    const dayNewerA = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    const dayNewerB = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    for (const d of [dayOlder, dayNewerA, dayNewerB]) {
      await prisma.match.create({
        data: {
          gameDayId: d.id,
          matchNumber: 1,
          team1PlayerAId: paul.id,
          team1PlayerBId: patrick.id,
          team2PlayerAId: michi.id,
          team2PlayerBId: thomas.id,
          team1Score: 2,
          team2Score: 1,
        },
      });
    }

    const result = await listArchivedGameDays(null);
    expect(result.map((r) => r.id)).toEqual(
      [dayNewerA.id, dayNewerB.id].sort().reverse().concat(dayOlder.id),
    );
  });
```

- [ ] **Step 14: Run, verify sort test passes**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 15: Write failing test — excludes non-finished game days**

Append test:

```ts
  it("excludes game days whose status is not finished", async () => {
    const season = await makeSeason(2026);
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const plannedDay = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-18"), playerCount: 4, status: "planned" },
    });
    const inProgressDay = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-19"), playerCount: 4, status: "in_progress" },
    });
    const rosterLockedDay = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-20"), playerCount: 4, status: "roster_locked" },
    });
    for (const d of [plannedDay, inProgressDay, rosterLockedDay]) {
      await prisma.match.create({
        data: {
          gameDayId: d.id,
          matchNumber: 1,
          team1PlayerAId: paul.id,
          team1PlayerBId: patrick.id,
          team2PlayerAId: michi.id,
          team2PlayerBId: thomas.id,
          team1Score: 2,
          team2Score: 1,
        },
      });
    }
    const finishedDay = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: finishedDay.id,
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
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(finishedDay.id);
  });
```

- [ ] **Step 16: Run, verify finished-only filter works**

Run: `npx vitest run tests/integration/archive-list.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 17: Commit remaining tests**

```bash
git add tests/integration/archive-list.test.ts
git commit -m "test(archive): cover self block, sort order, status filter"
```

---

## Task 2: Read-only match card

Presentation-only component for the detail page. Mirrors the non-editing visuals of `MatchInlineCard` without any client-side state.

**Files:**
- Create: `src/app/archive/read-only-match-card.tsx`

- [ ] **Step 1: Create the component file**

Create `src/app/archive/read-only-match-card.tsx`:

```tsx
export interface ReadOnlyMatch {
  matchNumber: number;
  team1A: string;
  team1B: string;
  team2A: string;
  team2B: string;
  team1Score: number | null;
  team2Score: number | null;
}

export function ReadOnlyMatchCard({ match }: { match: ReadOnlyMatch }) {
  const hasScore = match.team1Score !== null && match.team2Score !== null;
  const winner =
    hasScore && match.team1Score! > match.team2Score!
      ? "team1"
      : hasScore && match.team2Score! > match.team1Score!
        ? "team2"
        : null;

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-3">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Match {match.matchNumber}
          {hasScore ? " · beendet" : " · offen"}
        </span>
        {winner && (
          <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[0.6rem] font-bold text-success">
            {winner === "team1" ? "Team A gewinnt" : "Team B gewinnt"}
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2">
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team1A} / {match.team1B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team A</div>
        </div>
        <span className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-primary">
          {match.team1Score ?? "–"}
        </span>
        <span className="text-xs font-semibold text-foreground-dim">:</span>
        <span className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-primary">
          {match.team2Score ?? "–"}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team2A} / {match.team2B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team B</div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks and lints**

Run: `npx tsc --noEmit && npx next lint --max-warnings=0`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/archive/read-only-match-card.tsx
git commit -m "feat(archive): add ReadOnlyMatchCard component"
```

---

## Task 3: Archive list page `/archive`

Server component that renders the list of finished days grouped by season year.

**Files:**
- Create: `src/app/archive/page.tsx`

- [ ] **Step 1: Create the page file with auth guard, data fetch, empty state, and row rendering**

Create `src/app/archive/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Archive } from "lucide-react";
import { listArchivedGameDays, type ArchivedGameDayRow } from "@/lib/archive/list";

export const dynamic = "force-dynamic";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function groupBySeason(rows: ArchivedGameDayRow[]): Map<number, ArchivedGameDayRow[]> {
  const grouped = new Map<number, ArchivedGameDayRow[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.seasonYear);
    if (bucket) bucket.push(row);
    else grouped.set(row.seasonYear, [row]);
  }
  return grouped;
}

export default async function ArchivePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const rows = await listArchivedGameDays(session.user.id);

  if (rows.length === 0) {
    return (
      <div className="space-y-5">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
            Vergangene Spieltage
          </p>
          <h1 className="text-2xl font-bold text-foreground">Archiv</h1>
        </header>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-10 text-center">
          <Archive className="h-10 w-10 text-foreground-muted" aria-hidden="true" />
          <div className="text-sm font-semibold text-foreground">
            Noch keine abgeschlossenen Spieltage.
          </div>
          <div className="text-xs text-foreground-muted">
            Sobald ein Spieltag beendet ist, erscheint er hier.
          </div>
        </div>
      </div>
    );
  }

  const grouped = groupBySeason(rows);
  const years = [...grouped.keys()].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Vergangene Spieltage
        </p>
        <h1 className="text-2xl font-bold text-foreground">Archiv</h1>
      </header>

      {years.map((year) => (
        <section key={year} className="space-y-2">
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            {year}
          </h2>
          <ul className="space-y-2">
            {grouped.get(year)!.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/archive/${row.id}`}
                  className="block rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="text-sm font-semibold text-foreground">{formatDate(row.date)}</div>
                  {row.podium.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground">
                      {row.podium.map((p, i) => (
                        <span key={`${p.playerName}-${i}`} className="inline-flex items-center gap-1">
                          <span aria-hidden="true">{MEDALS[i]}</span>
                          <span className="font-medium">{p.playerName}</span>
                          <span className="tabular-nums text-foreground-muted">{p.points}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-foreground-muted">
                    {row.matchCount} {row.matchCount === 1 ? "Match" : "Matches"} ·{" "}
                    {row.playerCount} Spieler
                    {row.self && (
                      <>
                        {" · "}Du: {row.self.points} Pt /{" "}
                        {row.self.matches} {row.self.matches === 1 ? "Match" : "Matches"}
                      </>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx next lint --max-warnings=0`
Expected: no errors.

- [ ] **Step 3: Manual smoke check in dev server**

Run: `npm run dev` and visit `http://localhost:3000/archive`.
Expected: unauthenticated → redirected to `/login`. Authenticated with no finished days → empty state. Authenticated with finished days → list grouped by year.

- [ ] **Step 4: Commit**

```bash
git add src/app/archive/page.tsx
git commit -m "feat(archive): add archive list page"
```

---

## Task 4: Archive detail page `/archive/[id]`

Server component showing one finished game day in full.

**Files:**
- Create: `src/app/archive/[id]/page.tsx`

- [ ] **Step 1: Create the detail page with auth guard, 404 for unknown/non-finished, summary + match list**

Create `src/app/archive/[id]/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { FinishedSummary } from "@/app/game-day/finished-summary";
import { ReadOnlyMatchCard } from "../read-only-match-card";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default async function ArchiveDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;

  const day = await prisma.gameDay.findUnique({
    where: { id },
    include: {
      matches: {
        orderBy: { matchNumber: "asc" },
        include: {
          team1PlayerA: { select: { name: true } },
          team1PlayerB: { select: { name: true } },
          team2PlayerA: { select: { name: true } },
          team2PlayerB: { select: { name: true } },
        },
      },
    },
  });

  if (!day || day.status !== "finished") notFound();

  const scoredMatchCount = day.matches.filter(
    (m) => m.team1Score !== null && m.team2Score !== null,
  ).length;

  return (
    <div className="space-y-4">
      <Link
        href="/archive"
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden="true" />
        Zurück zum Archiv
      </Link>
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Spieltag beendet
        </p>
        <h1 className="text-2xl font-bold text-foreground">{formatDate(day.date)}</h1>
      </header>

      <FinishedSummary
        gameDayId={day.id}
        scoredMatchCount={scoredMatchCount}
        totalMatchCount={day.matches.length}
      />

      {day.matches.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Paarungen
          </h2>
          <div className="space-y-2">
            {day.matches.map((m) => (
              <ReadOnlyMatchCard
                key={m.id}
                match={{
                  matchNumber: m.matchNumber,
                  team1A: m.team1PlayerA.name,
                  team1B: m.team1PlayerB.name,
                  team2A: m.team2PlayerA.name,
                  team2B: m.team2PlayerB.name,
                  team1Score: m.team1Score,
                  team2Score: m.team2Score,
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx next lint --max-warnings=0`
Expected: no errors.

- [ ] **Step 3: Manual smoke check**

Run `npm run dev`. Visit:
- `/archive/invalid-uuid` → 404 page.
- `/archive/<id-of-a-planned-day>` → 404 page.
- `/archive/<id-of-a-finished-day>` → detail view with back link, summary, paarungen list.

- [ ] **Step 4: Commit**

```bash
git add src/app/archive/[id]/page.tsx
git commit -m "feat(archive): add archive detail page"
```

---

## Task 5: Nav integration

Add the "Archiv" entry to top nav (desktop) and bottom tabs (mobile). One-line change per file plus an icon import.

**Files:**
- Modify: `src/components/bottom-tabs.tsx`
- Modify: `src/components/top-nav.tsx`

- [ ] **Step 1: Update `src/components/bottom-tabs.tsx`**

Change the import line:

```tsx
import { Home, Trophy, CircleDot, Archive, Settings } from "lucide-react";
```

Change the `USER_TABS` array to:

```tsx
const USER_TABS: Tab[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/ranking", label: "Rangliste", icon: Trophy },
  { href: "/game-day", label: "Spieltag", icon: CircleDot },
  { href: "/archive", label: "Archiv", icon: Archive },
];
```

- [ ] **Step 2: Update `src/components/top-nav.tsx`**

Change the `USER_ITEMS` array to:

```tsx
const USER_ITEMS: Item[] = [
  { href: "/", label: "Home" },
  { href: "/ranking", label: "Rangliste" },
  { href: "/game-day", label: "Spieltag" },
  { href: "/archive", label: "Archiv" },
];
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx next lint --max-warnings=0`
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

Run `npm run dev`. Confirm:
- Desktop: "Archiv" appears between "Spieltag" and "Admin" (for admins) or at the end (for non-admins). Clicking navigates to `/archive`. Active state highlights when on `/archive` or `/archive/<id>` (because existing matcher uses `startsWith(href)`).
- Mobile: same entry appears in the bottom tab bar with the `Archive` lucide icon.

- [ ] **Step 5: Commit**

```bash
git add src/components/bottom-tabs.tsx src/components/top-nav.tsx
git commit -m "feat(archive): add Archiv entry to top and bottom nav"
```

---

## Task 6: Final verification

Full test suite + lint + build gate. All prior tasks must be committed before starting this one.

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test` (or `npx vitest run` — match whatever `package.json` exposes).
Expected: all tests PASS, including the 7 new tests from Task 1 and every pre-existing test untouched.

- [ ] **Step 2: Run lint with no warnings**

Run: `npx next lint --max-warnings=0`
Expected: clean.

- [ ] **Step 3: Run type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Run production build**

Run: `npm run build`
Expected: build succeeds, static analysis succeeds, no new warnings beyond the pre-existing baseline.

- [ ] **Step 5: Manual end-to-end smoke**

Start `npm run dev`. As a non-admin user:
- Click "Archiv" in the nav.
- Confirm empty state shows when there are no finished days, or the grouped list shows otherwise.
- Click any row → detail page with summary + paarungen + back link.
- Click the back link → returns to the list.
- Directly visit `/archive/<id>` of a non-finished day → 404.
- Log out, visit `/archive` → redirected to login.

- [ ] **Step 6: Dispatch parallel code reviewers**

Use the user's standing fan-out convention: in one message, dispatch `reviewer` + `test-engineer` + `refactor-cleanup` for the full diff of this feature. Address any Critical/Important findings before declaring done.
