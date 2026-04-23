# Home v2 Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten the home dashboard: replace W/L/D chips with per-day PPG trend chips, add red tone to the "Weniger Glück" partner box, and promote the greeting to a proper H1 with a dynamic, information-dense subtitle.

**Architecture:** Change the `computePlayerSeasonStats` service to return per-day PPG with a trend delta instead of per-match outcomes. Rename and rewrite the form-strip component to render PPG chips colored by trend. Update the dashboard page to wire the new data, restyle the "Weniger Glück" box, and refactor the header to a "Hi, {firstName}" H1 with a dynamic subtitle built from existing stats.

**Tech Stack:** Next.js 15 App Router (React 19 RSC), TypeScript 6 strict, Prisma 6.19 on PostgreSQL, Vitest 4 with real DB integration + RTL for components, Tailwind CSS with existing tokens (`bg-success-soft`, `bg-destructive-soft`, `border-destructive/30`, `text-success`, `text-destructive`, `text-foreground-muted`, `bg-surface-muted`).

---

## File Structure

- `src/lib/player/season-stats.ts` — replace `recentForm: MatchOutcome[]` with `recentDays: DayTrend[]` in the public contract.
- `tests/integration/player-season-stats.test.ts` — adjust recent-form test to recent-days semantics; add a new test for delta computation.
- `src/components/day-ppg-strip.tsx` — new file, replaces `match-form-strip.tsx`.
- `tests/components/day-ppg-strip.test.tsx` — new file, replaces `match-form-strip.test.tsx`.
- `src/components/match-form-strip.tsx` — delete (only consumer is the home page).
- `tests/components/match-form-strip.test.tsx` — delete (only consumer of the deleted component).
- `src/app/page.tsx` — swap import, restyle "Weniger Glück" box red, refactor header.

---

### Task 1: Update season-stats service — per-day PPG with trend delta

**Files:**
- Modify: `src/lib/player/season-stats.ts`
- Test: `tests/integration/player-season-stats.test.ts`

**Context:** The service currently returns `recentForm: MatchOutcome[]` — up to 5 W/L/D outcomes newest-first. Replace with `recentDays: DayTrend[]` — up to 5 entries, one per attended day, newest-first, each with the player's PPG for that day and a `delta` trend versus the next-older attended day. The first (oldest) day in the slice has `delta: "flat"`. PPG for a day = sum of that day's match points / match count for that day.

- [ ] **Step 1: Replace the recent-form test with a recent-days test**

In `tests/integration/player-season-stats.test.ts`, replace the existing test titled `"returns recent form newest-first across last 5 scored matches"` with this new test. Keep the imports, helpers, and `beforeEach(resetDb)` as-is.

```ts
  it("returns recent days newest-first with PPG and trend vs previous day", async () => {
    const season = await makeSeason();
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-03"), playerCount: 4, status: "finished" },
    });
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    // Day 1: me scored 3 + 0 + 1 = 4 over 3 matches → PPG 1.333...
    const day1Specs: Array<[number, number, number]> = [
      [1, 3, 0],
      [2, 0, 3],
      [3, 1, 1],
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
    // Day 2: me scored 3 + 2 + 0 = 5 over 3 matches → PPG 1.666...
    const day2Specs: Array<[number, number, number]> = [
      [1, 3, 0],
      [2, 2, 0],
      [3, 0, 3],
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
    expect(stats.recentDays).toHaveLength(2);
    // Newest first
    expect(stats.recentDays[0].ppg).toBeCloseTo(5 / 3, 5);
    expect(stats.recentDays[0].delta).toBe("up");
    expect(stats.recentDays[1].ppg).toBeCloseTo(4 / 3, 5);
    expect(stats.recentDays[1].delta).toBe("flat");
  });
```

Also update the empty-stats assertion in the first test (`"returns empty stats when the player has no activity"`) to replace `recentForm: []` with `recentDays: []`:

```ts
    expect(stats).toEqual({
      medals: { gold: 0, silver: 0, bronze: 0 },
      attendance: { attended: 0, total: 0 },
      winRate: { wins: 0, losses: 0, draws: 0, matches: 0 },
      recentDays: [],
      bestPartner: null,
      worstPartner: null,
      jokers: { used: 0, remaining: 2, total: 2 },
    });
```

- [ ] **Step 2: Add a test that exercises the `delta: "down"` branch**

Append inside the `describe("computePlayerSeasonStats", ...)` block:

```ts
  it("marks delta as 'down' when a day's PPG is lower than the previous day's", async () => {
    const season = await makeSeason();
    const [me, a, b, c] = await Promise.all(["Me", "A", "B", "C"].map(makePlayer));
    const day1 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-03"), playerCount: 4, status: "finished" },
    });
    const day2 = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-10"), playerCount: 4, status: "finished" },
    });
    // Day 1 PPG = 3.0 (single match, me scored 3)
    await prisma.match.create({
      data: {
        gameDayId: day1.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 3, team2Score: 0,
      },
    });
    // Day 2 PPG = 1.0 (single match, me scored 1)
    await prisma.match.create({
      data: {
        gameDayId: day2.id, matchNumber: 1,
        team1PlayerAId: me.id, team1PlayerBId: a.id,
        team2PlayerAId: b.id, team2PlayerBId: c.id,
        team1Score: 1, team2Score: 3,
      },
    });
    const stats = await computePlayerSeasonStats(me.id, season.id);
    expect(stats.recentDays[0].ppg).toBeCloseTo(1, 5);
    expect(stats.recentDays[0].delta).toBe("down");
    expect(stats.recentDays[1].delta).toBe("flat");
  });
```

- [ ] **Step 3: Run the new + updated tests to verify they fail**

Run: `pnpm vitest run tests/integration/player-season-stats.test.ts -t "returns recent days newest-first" -t "marks delta as 'down'" -t "returns empty stats"`
Expected: FAIL (service still returns `recentForm`).

- [ ] **Step 4: Update the service to return `recentDays` with trend delta**

Replace the `recentForm` type member, constant, and computation block in `src/lib/player/season-stats.ts`.

Rename the constant:
```ts
const RECENT_DAYS_COUNT = 5;
```
(delete the old `RECENT_FORM_MATCH_COUNT = 5`).

In the `PlayerSeasonStats` interface, replace `recentForm: MatchOutcome[];` with:
```ts
  recentDays: DayTrend[];
```

Add these type exports near the other exports at the top of the file (below the existing `MatchOutcome` export):
```ts
export type TrendDelta = "up" | "down" | "flat";

export interface DayTrend {
  gameDayId: string;
  ppg: number;
  delta: TrendDelta;
}
```

Replace the existing recent-form computation:
```ts
  const recentForm: MatchOutcome[] = rows
    .slice(0, RECENT_FORM_MATCH_COUNT)
    .map((r) => outcomeFor(r, playerId));
```
with per-day aggregation from the already-sorted `rows` (rows are sorted by `gameDay.date DESC`, then `matchNumber DESC`):

```ts
  // Aggregate player points per attended day. Using a Map preserves insertion
  // order, and rows are newest-first, so the Map's iteration order matches it.
  const perDay = new Map<string, { points: number; matches: number }>();
  for (const r of rows) {
    const cur = perDay.get(r.gameDayId) ?? { points: 0, matches: 0 };
    cur.points += myPoints(r, playerId);
    cur.matches += 1;
    perDay.set(r.gameDayId, cur);
  }
  const dayPpgList = [...perDay.entries()].map(([gameDayId, v]) => ({
    gameDayId,
    ppg: v.points / v.matches,
  }));
  // Compare each day to the next-older one (index + 1 in the newest-first list).
  // The oldest day in the slice has no predecessor → "flat".
  const recentDays: DayTrend[] = dayPpgList.slice(0, RECENT_DAYS_COUNT).map((d, i, arr) => {
    const prev = arr[i + 1];
    const delta: TrendDelta = !prev
      ? "flat"
      : d.ppg > prev.ppg
        ? "up"
        : d.ppg < prev.ppg
          ? "down"
          : "flat";
    return { gameDayId: d.gameDayId, ppg: d.ppg, delta };
  });
```

In the `return {}` block, replace `recentForm,` with `recentDays,`.

Note: `MatchOutcome`, `outcomeFor`, `playerTeam`, `partnerOf`, and `myPoints` all stay — `winRate` still uses `outcomeFor`, and `myPoints` is used here. No imports change; remove the now-unused `MatchOutcome` reference from the struct.

- [ ] **Step 5: Run the updated tests**

Run: `pnpm vitest run tests/integration/player-season-stats.test.ts`
Expected: PASS (all 13 tests green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/player/season-stats.ts tests/integration/player-season-stats.test.ts
git commit -m "feat(season-stats): replace recentForm with per-day PPG trend"
```

---

### Task 2: Rename & rewrite form strip to render PPG chips with trend colors

**Files:**
- Create: `src/components/day-ppg-strip.tsx`
- Create: `tests/components/day-ppg-strip.test.tsx`
- Delete: `src/components/match-form-strip.tsx`
- Delete: `tests/components/match-form-strip.test.tsx`

**Context:** The new strip renders one chip per attended day (up to 5). Each chip shows PPG rounded to one decimal. Color reflects the trend vs. the previous day: up → green-soft, down → red-soft, flat → muted grey. The oldest day's chip is always flat. The component mirrors the old `MatchFormStrip` API shape: a list of list items with `role="list"` on the `<ul>`.

- [ ] **Step 1: Write the failing component tests**

Create `tests/components/day-ppg-strip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DayPpgStrip } from "@/components/day-ppg-strip";

describe("<DayPpgStrip>", () => {
  it("renders one chip per day in order with PPG rounded to one decimal", () => {
    render(
      <DayPpgStrip
        days={[
          { gameDayId: "d1", ppg: 2.345, delta: "up" },
          { gameDayId: "d2", ppg: 1, delta: "flat" },
          { gameDayId: "d3", ppg: 0.666, delta: "down" },
        ]}
      />,
    );
    const chips = screen.getAllByRole("listitem");
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveTextContent("2.3");
    expect(chips[1]).toHaveTextContent("1.0");
    expect(chips[2]).toHaveTextContent("0.7");
  });

  it("renders nothing when the list is empty", () => {
    const { container } = render(<DayPpgStrip days={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies trend-specific aria labels", () => {
    render(
      <DayPpgStrip
        days={[
          { gameDayId: "d1", ppg: 2, delta: "up" },
          { gameDayId: "d2", ppg: 1, delta: "down" },
          { gameDayId: "d3", ppg: 1, delta: "flat" },
        ]}
      />,
    );
    expect(screen.getByLabelText(/Verbessert/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Verschlechtert/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Unverändert/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run: `pnpm vitest run tests/components/day-ppg-strip.test.tsx`
Expected: FAIL (component file does not exist yet).

- [ ] **Step 3: Create the component**

Create `src/components/day-ppg-strip.tsx`:

```tsx
import type { DayTrend, TrendDelta } from "@/lib/player/season-stats";

const STYLES: Record<TrendDelta, { cls: string; label: string }> = {
  up: { cls: "bg-success-soft text-success", label: "Verbessert" },
  down: { cls: "bg-destructive-soft text-destructive", label: "Verschlechtert" },
  flat: { cls: "bg-surface-muted text-foreground-muted", label: "Unverändert" },
};

export function DayPpgStrip({ days }: { days: DayTrend[] }) {
  if (days.length === 0) return null;
  return (
    <ul className="flex items-center gap-1.5" role="list">
      {days.map((d) => {
        const style = STYLES[d.delta];
        return (
          <li
            key={d.gameDayId}
            aria-label={`${style.label} (${d.ppg.toFixed(1)} PPG)`}
            className={`inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-extrabold tabular-nums ${style.cls}`}
          >
            {d.ppg.toFixed(1)}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/day-ppg-strip.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Delete the old component and its test**

```bash
git rm src/components/match-form-strip.tsx tests/components/match-form-strip.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/components/day-ppg-strip.tsx tests/components/day-ppg-strip.test.tsx
git commit -m "feat(home): add DayPpgStrip with trend-colored per-day PPG chips"
```

---

### Task 3: Wire new strip, red-tone "Weniger Glück" box, new header

**Files:**
- Modify: `src/app/page.tsx`

**Context:** Swap the `MatchFormStrip` import for `DayPpgStrip`, change the card heading to "Letzte X Spieltage", restyle the "Weniger Glück" box to a subtle red (mirror of the "Beste Chemie" green styling), and refactor the header so the first name is the H1 and the subtitle is a dynamic summary line ("Platz X · Y Spieltage · Z Joker"), falling back to "Saison {year}" when nothing to show.

- [ ] **Step 1: Swap form-strip import and render the new card body**

In `src/app/page.tsx`, replace this import:
```tsx
import { MatchFormStrip } from "@/components/match-form-strip";
```
with:
```tsx
import { DayPpgStrip } from "@/components/day-ppg-strip";
```

Replace the "Letzte … Matches" card (currently lines 126–135) with:

```tsx
      {stats.recentDays.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Letzte {stats.recentDays.length}{" "}
            {stats.recentDays.length === 1 ? "Spieltag" : "Spieltage"}
          </div>
          <div className="mt-2">
            <DayPpgStrip days={stats.recentDays} />
          </div>
        </div>
      )}
```

- [ ] **Step 2: Restyle the "Weniger Glück" box in red**

Replace the existing "Weniger Glück" `<div>` (currently lines 153–163) with:

```tsx
            {stats.worstPartner ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive-soft/40 p-3">
                <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-destructive">
                  Weniger Glück
                </div>
                <div className="mt-1 font-bold text-foreground">{stats.worstPartner.name}</div>
                <div className="mt-0.5 text-xs text-foreground-muted">
                  {stats.worstPartner.pointsTogether} Pt · {stats.worstPartner.matches}{" "}
                  {stats.worstPartner.matches === 1 ? "Match" : "Matches"}
                </div>
              </div>
            ) : (
```

Keep the `null`-branch dashed placeholder `<div>` below unchanged.

- [ ] **Step 3: Refactor the header to H1 + dynamic subtitle**

Replace the existing `<header>` block (currently lines 67–72):
```tsx
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Hi{firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="text-2xl font-bold text-foreground">Dein Padel</h1>
      </header>
```
with:
```tsx
      {(() => {
        const subtitleParts: string[] = [];
        if (myRank) subtitleParts.push(`Platz ${myRow!.rank}`);
        if (stats.attendance.attended > 0) {
          subtitleParts.push(
            `${stats.attendance.attended} ${stats.attendance.attended === 1 ? "Spieltag" : "Spieltage"}`,
          );
        }
        if (stats.jokers.remaining > 0) {
          subtitleParts.push(
            `${stats.jokers.remaining} ${stats.jokers.remaining === 1 ? "Joker" : "Joker"}`,
          );
        }
        const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : `Saison ${season.year}`;
        return (
          <header>
            <h1 className="text-2xl font-bold text-foreground">
              Hi{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-0.5 text-sm text-foreground-muted">{subtitle}</p>
          </header>
        );
      })()}
```

- [ ] **Step 4: Run typecheck + full test suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: typecheck clean; all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(home): dynamic header, PPG trend strip, red Weniger-Glück box"
```

---

## Final Verification Gate

After Task 3 is complete and committed, the coordinator runs the parallel agent fan-out on the full branch diff:

- `reviewer` — correctness, regressions, security
- `test-engineer` — test coverage gaps on the three modified surfaces
- `refactor-cleanup` — any duplication / dead code introduced

Fix any critical/important findings before opening PR A.
