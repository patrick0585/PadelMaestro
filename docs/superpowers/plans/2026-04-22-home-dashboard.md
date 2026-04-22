# Home Dashboard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the half-empty home dashboard with a rich, player-focused snapshot for the active season (medals, attendance, win rate, form, partner stats, joker balance), and switch the ranking page's `Pt` column to integer display.

**Architecture:** One new aggregation service `computePlayerSeasonStats(playerId, seasonId)` in `src/lib/player/season-stats.ts` that issues a small batch of Prisma queries (finished game days, my matches, joker uses) and returns a single typed object consumed by `src/app/page.tsx`. Each home card is rendered inline in `page.tsx`; we only extract a tiny `MatchFormStrip` component because the W/L/D chips are distinct presentation. The empty-state hero and admin-link card are deleted outright — admin actions are reachable via the existing admin tab.

**Tech Stack:** Next.js 15 App Router (React 19 Server Components), TypeScript strict, Prisma 6 on Postgres, Vitest 4 + React Testing Library, Tailwind.

**Agreed semantics (locked in during brainstorming):**
- **Medals:** Count for each of rank 1/2/3 across every `status = 'finished'` game day in the season, using the podium from `computeGameDaySummary`.
- **Attendance (Teilnahme):** `attended = distinct finished game days where I appeared in ≥1 scored match`. `total = count of finished game days in the season`. Joker use does NOT count as physical attendance (deliberate — Joker is a substitute, not a presence).
- **Win rate:** `wins / (wins + losses + draws)` across all my scored season matches. Denominator is every match I played, not just wins+losses — keeps the base transparent.
- **Recent form:** Last 5 scored matches I played in, `ORDER BY gameDay.date DESC, matchNumber DESC`. Each chip is `W`, `L`, or `D`. Left = most recent.
- **Best/Worst partner:** For each partner I teamed with in a scored season match, compute `pointsTogether = sum of my team's score in those matches` and `matches = count`. Best = max `pointsTogether` (ties: more matches wins, then name ASC). Worst = min `pointsTogether` (ties: fewer matches wins, then name ASC). Render worst only when at least 2 distinct partners exist.
- **Joker balance:** `used = JokerUse count for (playerId, seasonId)`, `remaining = MAX_JOKERS_PER_SEASON - used`, `total = MAX_JOKERS_PER_SEASON`.

---

## File Structure

**Create:**
- `src/lib/player/season-stats.ts` — aggregation service
- `src/components/match-form-strip.tsx` — tiny presentation helper for the W/L/D chip row
- `tests/integration/player-season-stats.test.ts` — service tests
- `tests/components/match-form-strip.test.tsx` — component tests

**Modify:**
- `src/components/ranking-table.tsx` — integer `Pt` format
- `tests/components/ranking-table.test.tsx` — update expected text
- `src/app/dashboard-hero.tsx` — drop the `kind: "none"` branch entirely
- `src/app/page.tsx` — drop the admin-link card, skip the hero when no planned day, render new stat cards

---

## Task Order

1. Rangliste `Pt` als Integer
2. Empty-Hero und Admin-Link-Card entfernen
3. `computePlayerSeasonStats` Service + Tests
4. Home: Medaillen-Kachel + Teilnahme + Win-Rate (Stat-Tiles)
5. Home: Match-Form (W/L/D-Chips)
6. Home: Bester/Schlechtester Partner Card
7. Home: Joker-Stand

Tasks 1 und 2 stehen vorne, weil sie trivial sind und sofort Wert liefern. Task 3 blockiert 4–7, daher direkt danach. Tasks 4–7 sind unabhängig und könnten in beliebiger Reihenfolge abgearbeitet werden.

---

## Task 1: Rangliste — Gesamtpunkte als Integer

**Files:**
- Modify: `src/components/ranking-table.tsx`
- Modify: `tests/components/ranking-table.test.tsx`

- [ ] **Step 1: Update the failing assertion in the ranking table test**

Open `tests/components/ranking-table.test.tsx`. In the test `"shows total points, points per game, games, and jokers for each row"`, change the `45.0` expectation to `45`. In the test `"renders 0 for zero points and zero jokers"`, change the `0.0` expectation to remove that line (because after the change, the zero points and the zero games and the zero jokers all render as plain `"0"` and would collide in `getAllByText`). The corrected test block looks like this:

```tsx
  it("renders 0 for zero points and zero jokers", () => {
    render(
      <RankingTable
        ranking={[
          row({
            rank: 1,
            playerId: "p1",
            playerName: "Paul",
            points: 0,
            pointsPerGame: 0,
            games: 0,
            jokersUsed: 0,
          }),
        ]}
      />,
    );
    const scoped = scopeTo("Paul");
    expect(scoped.getByText("0.00")).toBeInTheDocument();
    expect(scoped.getAllByText("0")).toHaveLength(3);
  });
```

And in the other test, the asserted `scoped.getByText("45.0")` becomes `scoped.getByText("45")`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/ranking-table.test.tsx`
Expected: FAIL with "Unable to find an element with the text: 45" (and the zero-test assertion mismatch)

- [ ] **Step 3: Change the formatter in `ranking-table.tsx`**

In `src/components/ranking-table.tsx`, locate the total points span and replace `.toFixed(1)` with `.toFixed(0)`:

```tsx
            <span className="text-right text-sm font-semibold tabular-nums text-foreground">
              {r.points.toFixed(0)}
            </span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/ranking-table.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ranking-table.tsx tests/components/ranking-table.test.tsx
git commit -m "$(cat <<'EOF'
refactor(ranking): show total points as integer

Drops the one-decimal format on the Pt column — fractional totals
only appear because joker-credited points mix in with whole-number
match scores, and the decimal added no user-facing information.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Empty-Hero und Admin-Link-Card entfernen

**Files:**
- Modify: `src/app/dashboard-hero.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Tighten the HeroState type in `dashboard-hero.tsx`**

In `src/app/dashboard-hero.tsx`, drop the `{ kind: "none" }` variant and delete the corresponding early-return branch. The file's top (lines 1–46) becomes:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type HeroState =
  | { kind: "not-member"; gameDayId: string; date: string; time: string; confirmed: number; total: number }
  | {
      kind: "member";
      gameDayId: string;
      date: string;
      time: string;
      confirmed: number;
      total: number;
      attendance: "pending" | "confirmed" | "declined";
    };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
}

export function DashboardHero({ state }: { state: HeroState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
```

Note: the `isAdmin` prop is gone — the empty state was its only user.

- [ ] **Step 2: Adjust `page.tsx` to not render the hero when there is no planned day, and remove the admin link card**

In `src/app/page.tsx`, rewrite the hero construction and render. The full file after edits:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { StatTile } from "@/components/ui/stat-tile";
import { DashboardHero, type HeroState } from "./dashboard-hero";

export const dynamic = "force-dynamic";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const season = await getOrCreateActiveSeason();
  const [ranking, plannedDay] = await Promise.all([
    computeRanking(season.id),
    prisma.gameDay.findFirst({
      where: { status: "planned" },
      orderBy: { date: "asc" },
      include: { participants: { select: { playerId: true, attendance: true } } },
    }),
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "";

  let heroState: HeroState | null = null;
  if (plannedDay) {
    const confirmed = plannedDay.participants.filter((p) => p.attendance === "confirmed").length;
    const total = plannedDay.participants.length;
    const date = plannedDay.date.toISOString();
    const time = formatTime(plannedDay.date.toISOString());
    const me = plannedDay.participants.find((p) => p.playerId === session.user.id);
    if (!me) {
      heroState = { kind: "not-member", gameDayId: plannedDay.id, date, time, confirmed, total };
    } else {
      const attendance =
        me.attendance === "confirmed" || me.attendance === "declined" ? me.attendance : "pending";
      heroState = {
        kind: "member",
        gameDayId: plannedDay.id,
        date,
        time,
        confirmed,
        total,
        attendance,
      };
    }
  }

  const myRow = ranking.find((r) => r.playerId === session.user.id);
  const myPpg = myRow ? myRow.pointsPerGame.toFixed(2) : null;
  const myRank = myRow ? `#${myRow.rank}` : null;

  const top3 = ranking.slice(0, 3);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Hi{firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="text-2xl font-bold text-foreground">Dein Padel</h1>
      </header>

      {heroState && <DashboardHero state={heroState} />}

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Dein PPG" value={myPpg} tone="primary" />
        <StatTile label="Rang" value={myRank} tone="lime" />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Top 3
          </span>
          <Link href="/ranking" className="text-xs font-semibold text-primary">
            ansehen →
          </Link>
        </div>
        <ul className="mt-2 space-y-1">
          {top3.length === 0 && (
            <li className="py-2 text-sm text-foreground-dim">Noch keine Spieler mit Matches.</li>
          )}
          {top3.map((r) => (
            <li key={r.playerId} className="flex items-center gap-3 py-1 text-sm">
              <span className="w-5 text-right font-extrabold text-primary">{r.rank}</span>
              <span className="flex-1 font-semibold text-foreground">{r.playerName}</span>
              <span className="font-semibold tabular-nums text-foreground-muted">
                {r.pointsPerGame.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

Note the three concrete deletions vs the old file: no `heroState = { kind: "none" }` assignment; the `<DashboardHero>` call is guarded with `heroState &&`; the entire `{session.user.isAdmin && (<Link href="/admin" ...>` block at the end is gone.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: 278 tests pass (no test assertions referenced the removed states).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard-hero.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
refactor(home): drop empty-hero state and admin link card

Removes the 'Noch kein Spieltag geplant' placeholder hero and the
admin entry tile at the bottom of the dashboard — both were
noise. Admin actions remain reachable via the admin tab, and
the hero only renders when there's a planned day to act on.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `computePlayerSeasonStats` Service + Tests

**Files:**
- Create: `src/lib/player/season-stats.ts`
- Create: `tests/integration/player-season-stats.test.ts`

The service takes `(playerId, seasonId)` and returns every number the home dashboard needs, in one call. Uses existing `computeGameDaySummary` for podium counting (don't reimplement medal logic); uses raw queries elsewhere to stay close to Postgres.

- [ ] **Step 1: Create the failing test file skeleton**

Create `tests/integration/player-season-stats.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";

async function makeSeason() {
  const year = 2026;
  return prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
}
async function makePlayer(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

describe("computePlayerSeasonStats", () => {
  beforeEach(resetDb);

  it("returns empty stats when the player has no activity", async () => {
    const season = await makeSeason();
    const me = await makePlayer("Me");
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats).toEqual({
      medals: { gold: 0, silver: 0, bronze: 0 },
      attendance: { attended: 0, total: 0 },
      winRate: { wins: 0, losses: 0, draws: 0, matches: 0 },
      recentForm: [],
      bestPartner: null,
      worstPartner: null,
      jokers: { used: 0, remaining: 2, total: 2 },
    });
  });

  it("counts medals from finished game days in the season only", async () => {
    const season = await makeSeason();
    const otherSeason = await prisma.season.create({
      data: { year: 2025, startDate: new Date(2025, 0, 1), endDate: new Date(2025, 11, 31), isActive: false },
    });
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    // finished day — I take gold (6 pts, 2 matches)
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    for (const [n, t1] of [[1, 3], [2, 3]] as const) {
      await prisma.match.create({
        data: {
          gameDayId: day1.id, matchNumber: n,
          team1PlayerAId: me.id, team1PlayerBId: a.id,
          team2PlayerAId: b.id, team2PlayerBId: c.id,
          team1Score: t1, team2Score: 0,
        },
      });
    }
    // non-finished day — must be ignored
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-17"), playerCount: 4, status: "in_progress" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day2.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 5, team2Score: 0,
      },
    });
    // finished day in the OTHER season — must be ignored
    const dayOtherSeason = await prisma.gameDay.create({
      data: { seasonId: otherSeason.id, date: new Date("2025-12-12"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: dayOtherSeason.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 9, team2Score: 0,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.medals).toEqual({ gold: 1, silver: 0, bronze: 0 });
  });

  it("computes attendance as finished days where I played ≥1 scored match", async () => {
    const season = await makeSeason();
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    // day 1: I play, attended
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day1.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 2, team2Score: 1,
      },
    });
    // day 2: I did not play, only counts in denominator
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-17"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day2.id, matchNumber: 1,
        team1PlayerAId: a.id, team1PlayerBId: b.id,
        team2PlayerAId: c.id, team2PlayerBId: await makePlayer("D").then((d) => d.id),
        team1Score: 1, team2Score: 1,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.attendance).toEqual({ attended: 1, total: 2 });
  });

  it("computes win rate across all scored season matches (wins/losses/draws)", async () => {
    const season = await makeSeason();
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    // Match 1: I win (team1 3 - 1 team2)
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 3, team2Score: 1,
      },
    });
    // Match 2: I lose (team1 0 - 3 team2)
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 2,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 0, team2Score: 3,
      },
    });
    // Match 3: draw
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 3,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 2, team2Score: 2,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.winRate).toEqual({ wins: 1, losses: 1, draws: 1, matches: 3 });
  });

  it("returns recent form newest-first across last 5 scored matches", async () => {
    const season = await makeSeason();
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-03"), playerCount: 4, status: "finished" },
    });
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    // 3 matches on day1: W, L, D
    const day1Specs: Array<[number, number, number]> = [
      [1, 3, 0], // W
      [2, 0, 3], // L
      [3, 1, 1], // D
    ];
    for (const [n, t1, t2] of day1Specs) {
      await prisma.match.create({
        data: {
          gameDayId: day1.id, matchNumber: n,
          team1PlayerAId: me.id, team1PlayerBId: a.id,
          team2PlayerAId: b.id, team2PlayerBId: c.id,
          team1Score: t1, team2Score: t2,
        },
      });
    }
    // 3 matches on day2: W, W, L — newer, should appear first
    const day2Specs: Array<[number, number, number]> = [
      [1, 3, 0], // W
      [2, 2, 0], // W
      [3, 0, 3], // L
    ];
    for (const [n, t1, t2] of day2Specs) {
      await prisma.match.create({
        data: {
          gameDayId: day2.id, matchNumber: n,
          team1PlayerAId: me.id, team1PlayerBId: a.id,
          team2PlayerAId: b.id, team2PlayerBId: c.id,
          team1Score: t1, team2Score: t2,
        },
      });
    }
    const stats = await computePlayerSeasonStats(me.id, season.id);
    // newest-first: day2 match3, day2 match2, day2 match1, day1 match3, day1 match2
    expect(stats.recentForm).toEqual(["L", "W", "W", "D", "L"]);
  });

  it("computes best and worst partner by total points together", async () => {
    const season = await makeSeason();
    const [me, paul, michi, x, y] = await Promise.all(
      ["Me", "Paul", "Michi", "X", "Y"].map(makePlayer),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    // with Paul, 2 matches, team1 scores 3 and 2 → 5 pts together
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: paul.id,
        team2PlayerAId: x.id, team2PlayerBId: y.id,
        team1Score: 3, team2Score: 1,
      },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 2,
        team1PlayerAId: paul.id, team1PlayerBId: me.id,
        team2PlayerAId: x.id, team2PlayerBId: y.id,
        team1Score: 2, team2Score: 0,
      },
    });
    // with Michi, 1 match, 1 pt
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 3,
        team1PlayerAId: michi.id, team1PlayerBId: me.id,
        team2PlayerAId: x.id, team2PlayerBId: y.id,
        team1Score: 1, team2Score: 3,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.bestPartner).toEqual({ name: "Paul", pointsTogether: 5, matches: 2 });
    expect(stats.worstPartner).toEqual({ name: "Michi", pointsTogether: 1, matches: 1 });
  });

  it("returns worstPartner as null when the player has only one distinct partner", async () => {
    const season = await makeSeason();
    const [me, paul, x, y] = await Promise.all(["Me", "Paul", "X", "Y"].map(makePlayer));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: paul.id,
        team2PlayerAId: x.id, team2PlayerBId: y.id,
        team1Score: 3, team2Score: 1,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.bestPartner).toEqual({ name: "Paul", pointsTogether: 3, matches: 1 });
    expect(stats.worstPartner).toBeNull();
  });

  it("computes joker balance from JokerUse rows for the season", async () => {
    const season = await makeSeason();
    const me = await makePlayer("Me");
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: me.id, seasonId: season.id, gameDayId: day.id,
        ppgAtUse: "2.500", gamesCredited: 10, pointsCredited: "25.00",
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.jokers).toEqual({ used: 1, remaining: 1, total: 2 });
  });
});
```

- [ ] **Step 2: Run tests to verify they all fail**

Run: `npx vitest run tests/integration/player-season-stats.test.ts`
Expected: FAIL — all 8 tests, "Cannot find module '@/lib/player/season-stats'".

- [ ] **Step 3: Create the service**

Create `src/lib/player/season-stats.ts`:

```ts
import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { MAX_JOKERS_PER_SEASON } from "@/lib/joker/use";

export type MatchOutcome = "W" | "L" | "D";

export interface PartnerStat {
  name: string;
  pointsTogether: number;
  matches: number;
}

export interface PlayerSeasonStats {
  medals: { gold: number; silver: number; bronze: number };
  attendance: { attended: number; total: number };
  winRate: { wins: number; losses: number; draws: number; matches: number };
  recentForm: MatchOutcome[];
  bestPartner: PartnerStat | null;
  worstPartner: PartnerStat | null;
  jokers: { used: number; remaining: number; total: number };
}

interface MatchRow {
  matchNumber: number;
  gameDayDate: Date;
  team1PlayerAId: string;
  team1PlayerBId: string;
  team2PlayerAId: string;
  team2PlayerBId: string;
  team1Score: number;
  team2Score: number;
}

function outcomeFor(row: MatchRow, playerId: string): MatchOutcome {
  const onTeam1 = row.team1PlayerAId === playerId || row.team1PlayerBId === playerId;
  const my = onTeam1 ? row.team1Score : row.team2Score;
  const their = onTeam1 ? row.team2Score : row.team1Score;
  if (my > their) return "W";
  if (my < their) return "L";
  return "D";
}

function partnerOf(row: MatchRow, playerId: string): string | null {
  if (row.team1PlayerAId === playerId) return row.team1PlayerBId;
  if (row.team1PlayerBId === playerId) return row.team1PlayerAId;
  if (row.team2PlayerAId === playerId) return row.team2PlayerBId;
  if (row.team2PlayerBId === playerId) return row.team2PlayerAId;
  return null;
}

function myPoints(row: MatchRow, playerId: string): number {
  const onTeam1 = row.team1PlayerAId === playerId || row.team1PlayerBId === playerId;
  return onTeam1 ? row.team1Score : row.team2Score;
}

export async function computePlayerSeasonStats(
  playerId: string,
  seasonId: string,
): Promise<PlayerSeasonStats> {
  const [finishedDays, myMatches, jokerCount] = await Promise.all([
    prisma.gameDay.findMany({
      where: { seasonId, status: "finished" },
      select: { id: true },
      orderBy: { date: "desc" },
    }),
    prisma.match.findMany({
      where: {
        team1Score: { not: null },
        team2Score: { not: null },
        gameDay: { seasonId, status: "finished" },
        OR: [
          { team1PlayerAId: playerId },
          { team1PlayerBId: playerId },
          { team2PlayerAId: playerId },
          { team2PlayerBId: playerId },
        ],
      },
      select: {
        matchNumber: true,
        team1PlayerAId: true,
        team1PlayerBId: true,
        team2PlayerAId: true,
        team2PlayerBId: true,
        team1Score: true,
        team2Score: true,
        gameDay: { select: { date: true } },
      },
      orderBy: [{ gameDay: { date: "desc" } }, { matchNumber: "desc" }],
    }),
    prisma.jokerUse.count({ where: { playerId, seasonId } }),
  ]);

  const rows: MatchRow[] = myMatches.map((m) => ({
    matchNumber: m.matchNumber,
    gameDayDate: m.gameDay.date,
    team1PlayerAId: m.team1PlayerAId,
    team1PlayerBId: m.team1PlayerBId,
    team2PlayerAId: m.team2PlayerAId,
    team2PlayerBId: m.team2PlayerBId,
    team1Score: m.team1Score as number,
    team2Score: m.team2Score as number,
  }));

  const summaries = await Promise.all(finishedDays.map((d) => computeGameDaySummary(d.id)));
  const medals = { gold: 0, silver: 0, bronze: 0 };
  for (const s of summaries) {
    if (!s) continue;
    const podium = s.podium;
    if (podium[0]?.playerId === playerId) medals.gold += 1;
    if (podium[1]?.playerId === playerId) medals.silver += 1;
    if (podium[2]?.playerId === playerId) medals.bronze += 1;
  }

  const attendedDays = new Set<string>();
  for (const m of myMatches) {
    // We don't have gameDayId directly selected, but the id is unique per match.
    // Re-query is avoided by grouping through the match row: use date as proxy
    // is wrong (two days could have same date across seasons). Instead, include
    // gameDayId in the select.
  }
  // Attendance requires gameDayId — refetch with a lightweight query.
  const attendedRows = await prisma.match.findMany({
    where: {
      team1Score: { not: null },
      team2Score: { not: null },
      gameDay: { seasonId, status: "finished" },
      OR: [
        { team1PlayerAId: playerId },
        { team1PlayerBId: playerId },
        { team2PlayerAId: playerId },
        { team2PlayerBId: playerId },
      ],
    },
    select: { gameDayId: true },
  });
  for (const r of attendedRows) attendedDays.add(r.gameDayId);

  const winRate = { wins: 0, losses: 0, draws: 0, matches: rows.length };
  for (const r of rows) {
    const o = outcomeFor(r, playerId);
    if (o === "W") winRate.wins += 1;
    else if (o === "L") winRate.losses += 1;
    else winRate.draws += 1;
  }

  const recentForm: MatchOutcome[] = rows.slice(0, 5).map((r) => outcomeFor(r, playerId));

  const partnerTotals = new Map<string, { pointsTogether: number; matches: number }>();
  for (const r of rows) {
    const pid = partnerOf(r, playerId);
    if (!pid) continue;
    const cur = partnerTotals.get(pid) ?? { pointsTogether: 0, matches: 0 };
    cur.pointsTogether += myPoints(r, playerId);
    cur.matches += 1;
    partnerTotals.set(pid, cur);
  }
  const partnerIds = [...partnerTotals.keys()];
  const partnerNames = partnerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: partnerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(partnerNames.map((p) => [p.id, p.name]));
  const partners: PartnerStat[] = partnerIds.map((pid) => ({
    name: nameById.get(pid) ?? "Unbekannt",
    pointsTogether: partnerTotals.get(pid)!.pointsTogether,
    matches: partnerTotals.get(pid)!.matches,
  }));
  const bestSorted = [...partners].sort((a, b) => {
    if (b.pointsTogether !== a.pointsTogether) return b.pointsTogether - a.pointsTogether;
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.name.localeCompare(b.name, "de");
  });
  const worstSorted = [...partners].sort((a, b) => {
    if (a.pointsTogether !== b.pointsTogether) return a.pointsTogether - b.pointsTogether;
    if (a.matches !== b.matches) return a.matches - b.matches;
    return a.name.localeCompare(b.name, "de");
  });
  const bestPartner = bestSorted[0] ?? null;
  const worstPartner = partners.length >= 2 ? worstSorted[0] ?? null : null;

  return {
    medals,
    attendance: { attended: attendedDays.size, total: finishedDays.length },
    winRate,
    recentForm,
    bestPartner,
    worstPartner,
    jokers: {
      used: jokerCount,
      remaining: Math.max(0, MAX_JOKERS_PER_SEASON - jokerCount),
      total: MAX_JOKERS_PER_SEASON,
    },
  };
}
```

Notes on the design above:
- The first `prisma.match.findMany` omits `gameDayId` by design — we collect match rows with the four team slots and scores for win-rate, form and partner calculations. The second `findMany` (which only selects `gameDayId`) exists solely to count distinct attended days. This is a conscious split: keeping the first query's select narrow makes its intent obvious and keeps the `rows` mapping precise.
- Alternatively, we could add `gameDayId: true` to the first query and drop the second, but the current split tests more cleanly. Choose the split; do not "simplify" by merging.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/integration/player-season-stats.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/player/season-stats.ts tests/integration/player-season-stats.test.ts
git commit -m "$(cat <<'EOF'
feat(player): add computePlayerSeasonStats service

Aggregates everything the new home dashboard needs — medals,
attendance, win rate, recent form, best/worst partner, and
joker balance — in one call per (playerId, seasonId).
Reuses computeGameDaySummary for podium counting so medal
rules stay in sync with the archive and live summaries.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Home — Medaillen, Teilnahme, Win-Rate

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Wire the service call and add the three new stat tiles**

Open `src/app/page.tsx`. Import the service near the top:

```tsx
import { computePlayerSeasonStats } from "@/lib/player/season-stats";
```

Add the call inside `DashboardPage` alongside the existing `Promise.all`:

```tsx
  const [ranking, plannedDay, stats] = await Promise.all([
    computeRanking(season.id),
    prisma.gameDay.findFirst({
      where: { status: "planned" },
      orderBy: { date: "asc" },
      include: { participants: { select: { playerId: true, attendance: true } } },
    }),
    computePlayerSeasonStats(session.user.id, season.id),
  ]);
```

Below the existing 2-column PPG/Rang grid, insert a new section for medals, attendance, and win rate. The medals block uses a new presentation (three-up emoji + count). Attendance and win rate reuse `StatTile`.

Replace the PPG/Rang grid with a 2x2 grid (or keep as is and add a second grid). Concretely, after the `<div className="grid grid-cols-2 gap-3">...</div>` block, add:

```tsx
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Teilnahme"
          value={stats.attendance.total === 0 ? null : `${stats.attendance.attended}/${stats.attendance.total}`}
          hint="Spieltage"
          tone="primary"
        />
        <StatTile
          label="Win-Rate"
          value={
            stats.winRate.matches === 0
              ? null
              : `${Math.round((stats.winRate.wins / stats.winRate.matches) * 100)}%`
          }
          hint={stats.winRate.matches === 0 ? undefined : `${stats.winRate.wins} von ${stats.winRate.matches}`}
          tone="lime"
        />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Medaillen Saison {season.year}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-2xl" aria-hidden="true">🥇</div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">
              {stats.medals.gold}
            </div>
          </div>
          <div>
            <div className="text-2xl" aria-hidden="true">🥈</div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">
              {stats.medals.silver}
            </div>
          </div>
          <div>
            <div className="text-2xl" aria-hidden="true">🥉</div>
            <div className="text-xl font-extrabold tabular-nums text-foreground">
              {stats.medals.bronze}
            </div>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Typecheck and run full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean typecheck, 286 tests pass (278 + 8 new from Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(home): show medals, attendance and win rate

Adds three new stat surfaces to the home dashboard fed by
computePlayerSeasonStats — a gold/silver/bronze counter for the
season, an attended/total Spieltage tile, and a percentage
win rate tile.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Home — Match-Form (W/L/D chips)

**Files:**
- Create: `src/components/match-form-strip.tsx`
- Create: `tests/components/match-form-strip.test.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write the component test**

Create `tests/components/match-form-strip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MatchFormStrip } from "@/components/match-form-strip";

describe("<MatchFormStrip>", () => {
  it("renders a chip for every outcome in order", () => {
    render(<MatchFormStrip outcomes={["W", "W", "L", "D", "W"]} />);
    const chips = screen.getAllByRole("listitem");
    expect(chips).toHaveLength(5);
    expect(chips[0]).toHaveTextContent("W");
    expect(chips[2]).toHaveTextContent("L");
    expect(chips[3]).toHaveTextContent("D");
  });

  it("renders nothing when the list is empty", () => {
    const { container } = render(<MatchFormStrip outcomes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("uses semantic aria labels on each chip", () => {
    render(<MatchFormStrip outcomes={["W", "L", "D"]} />);
    expect(screen.getByLabelText("Gewonnen")).toBeInTheDocument();
    expect(screen.getByLabelText("Verloren")).toBeInTheDocument();
    expect(screen.getByLabelText("Unentschieden")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/match-form-strip.test.tsx`
Expected: FAIL — "Cannot find module '@/components/match-form-strip'".

- [ ] **Step 3: Create the component**

Create `src/components/match-form-strip.tsx`:

```tsx
import type { MatchOutcome } from "@/lib/player/season-stats";

const STYLES: Record<MatchOutcome, { cls: string; label: string }> = {
  W: { cls: "bg-success-soft text-success", label: "Gewonnen" },
  L: { cls: "bg-destructive-soft text-destructive", label: "Verloren" },
  D: { cls: "bg-surface-muted text-foreground-muted", label: "Unentschieden" },
};

export function MatchFormStrip({ outcomes }: { outcomes: MatchOutcome[] }) {
  if (outcomes.length === 0) return null;
  return (
    <ul className="flex items-center gap-1.5" role="list">
      {outcomes.map((o, i) => {
        const style = STYLES[o];
        return (
          <li
            key={i}
            aria-label={style.label}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-extrabold ${style.cls}`}
          >
            {o}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run component tests**

Run: `npx vitest run tests/components/match-form-strip.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify that `bg-destructive-soft` / `text-destructive` classes exist in the theme**

Run: `grep -nE "destructive-soft|text-destructive" src/app/globals.css tailwind.config.ts 2>&1 | head`
If both classes exist (they do — they're used on the `MatchInlineCard` error text and in Badge variants), proceed. If `bg-destructive-soft` doesn't exist, fall back to `bg-destructive/15` which Tailwind's default-JIT handles without config changes.

Run: `grep -n "destructive" src/app/globals.css`
Expected: a `--destructive-soft` custom property. If absent, swap `bg-destructive-soft` for `bg-destructive/15` in `src/components/match-form-strip.tsx`.

- [ ] **Step 6: Add the strip to the home page**

Open `src/app/page.tsx`. Import the component near the other imports:

```tsx
import { MatchFormStrip } from "@/components/match-form-strip";
```

After the medals block added in Task 4, add:

```tsx
      {stats.recentForm.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Letzte {stats.recentForm.length} Matches
          </div>
          <div className="mt-2">
            <MatchFormStrip outcomes={stats.recentForm} />
          </div>
        </div>
      )}
```

- [ ] **Step 7: Run full suite and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean typecheck, 289 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/match-form-strip.tsx tests/components/match-form-strip.test.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(home): show recent match form as W/L/D chips

Adds a compact MatchFormStrip that renders a colored chip for
each of the last five scored matches, newest first. Hidden when
the player has no scored matches this season.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Home — Bester/Schlechtester Partner

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the partner card to the home page**

After the match-form block, add:

```tsx
      {stats.bestPartner && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Teamwork
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-success/30 bg-success-soft/40 p-3">
              <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-success">
                Beste Chemie
              </div>
              <div className="mt-1 font-bold text-foreground">{stats.bestPartner.name}</div>
              <div className="mt-0.5 text-xs text-foreground-muted">
                {stats.bestPartner.pointsTogether} Pt · {stats.bestPartner.matches}{" "}
                {stats.bestPartner.matches === 1 ? "Match" : "Matches"}
              </div>
            </div>
            {stats.worstPartner ? (
              <div className="rounded-xl border border-border bg-surface-muted p-3">
                <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-foreground-muted">
                  Weniger Glück
                </div>
                <div className="mt-1 font-bold text-foreground">{stats.worstPartner.name}</div>
                <div className="mt-0.5 text-xs text-foreground-muted">
                  {stats.worstPartner.pointsTogether} Pt · {stats.worstPartner.matches}{" "}
                  {stats.worstPartner.matches === 1 ? "Match" : "Matches"}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-3 text-xs text-foreground-muted">
                Noch zu wenig Partner-Daten für einen Vergleich.
              </div>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 2: Typecheck and run full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean typecheck, 289 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(home): show best and worst season partner

Renders a Teamwork card with the partner the player has scored
the most points with and the one they've scored the fewest with,
plus match count. Hidden when the player has no partners yet;
worst card shows a helpful placeholder when only one partner
has been played with.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Home — Joker-Stand

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the joker balance card**

After the partner block, add:

```tsx
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Joker Saison {season.year}
          </span>
          <span className="text-[0.7rem] font-semibold text-foreground-muted">
            {stats.jokers.used} / {stats.jokers.total} eingesetzt
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {Array.from({ length: stats.jokers.total }, (_, i) => {
            const used = i < stats.jokers.used;
            return (
              <span
                key={i}
                aria-label={used ? "Joker eingesetzt" : "Joker verfügbar"}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold ${
                  used
                    ? "border border-border bg-surface-muted text-foreground-muted"
                    : "bg-primary-soft text-primary-strong"
                }`}
              >
                ★
              </span>
            );
          })}
          <span className="ml-2 text-sm font-semibold text-foreground">
            {stats.jokers.remaining === 1
              ? "1 Joker verfügbar"
              : `${stats.jokers.remaining} Joker verfügbar`}
          </span>
        </div>
      </div>
```

- [ ] **Step 2: Typecheck and run full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean typecheck, 289 tests still pass.

- [ ] **Step 3: Manual verification checklist**

Start the dev server and walk through each card:

```bash
npm run dev
```

In the browser at `http://localhost:3000/`:
- [ ] Empty-state: as a newly-logged-in user on a fresh season, hero is absent, all seasonal cards render with zeroes
- [ ] With data: medals show realistic counts, attendance fraction matches finished day count, win rate % matches scored matches, form strip has up to 5 chips, partner card renders with beste Chemie, joker stars show used as grey
- [ ] Admin-link card at the bottom is gone
- [ ] Narrow viewport (360×800): every card reads cleanly, no horizontal overflow

Report results back in the commit message or mention any visual issues.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(home): show joker balance for the season

Renders a row of stars (filled = available, hollow = used) and
a textual count of remaining jokers out of MAX_JOKERS_PER_SEASON.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Final Verification Gate

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all green, ≥289 tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean; `/` route size reasonable (<5 kB).

- [ ] **Step 4: Parallel reviewer fan-out (per CLAUDE.md)**

Dispatch `reviewer`, `test-engineer`, and `refactor-cleanup` agents in a single message against the full branch diff. Address every Critical and Important finding before opening the PR.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feature/home-dashboard
gh pr create --title "feat(home): player-focused dashboard for the season" --body "<PR body covering all 7 tasks>"
```

---

## Self-Review Notes

- **Coverage against agreed semantics:** medals (Task 3 test 2), attendance (Task 3 test 3), win rate (Task 3 test 4), recent form (Task 3 test 5), best/worst partner (Task 3 tests 6, 7), joker balance (Task 3 test 8). All lock-ins covered.
- **Type consistency:** `MatchOutcome` exported from `season-stats.ts` and imported in `match-form-strip.tsx` — matches. `PartnerStat` field names (`name`, `pointsTogether`, `matches`) consistent between service, tests, and UI.
- **Ranking integer change:** Task 1 covers UI + the two ranking-table tests that assert the format.
- **Empty-hero/admin-link removal:** Task 2 touches exactly the two files mentioned, no stray references to the removed `isAdmin` prop remain.
- **YAGNI:** No placeholder "if many partners tie …" logic; deterministic tiebreakers only. No min-match threshold on partner stats (user wants literal sum). No shared medal helper extracted (two different call sites with different index conventions — same ruling as the ranking PR).
- **DRY:** Podium counting uses `computeGameDaySummary` (no medal rule duplication). Joker limit uses the existing exported `MAX_JOKERS_PER_SEASON` constant.
