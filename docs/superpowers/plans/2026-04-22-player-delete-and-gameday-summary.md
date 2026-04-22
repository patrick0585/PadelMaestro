# Player Delete & Game-Day Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only player soft-delete with safety guards and a post-finish game-day summary (podium + per-player points/matches table).

**Architecture:** Service layer (`src/lib/…`) owns pure logic and typed errors; API routes validate with Zod and map errors to HTTP codes; UI components sit under `src/app/…`. Integration tests use a real Postgres via the `resetDb` helper. Soft-delete piggybacks on the existing `deletedAt` convention; the summary is computed in-memory from the day's matches.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma 6 on PostgreSQL, Zod, Vitest, Tailwind CSS.

---

## File Map

**New:**
- `src/lib/players/delete.ts` — `deletePlayer` service + typed errors
- `src/lib/game-day/summary.ts` — `computeGameDaySummary` aggregator
- `src/app/admin/delete-player-dialog.tsx` — confirm dialog (client)
- `src/app/game-day/finished-summary.tsx` — post-finish UI (server component)
- `tests/integration/player-delete.test.ts`
- `tests/integration/gameday-summary.test.ts`

**Modified:**
- `src/app/api/players/[id]/route.ts` — add `DELETE` handler (next to the existing `PATCH`)
- `src/app/admin/players-section.tsx` — mount delete button + dialog per row
- `src/app/game-day/page.tsx` — replace the `status === "finished"` block with `<FinishedSummary gameDayId={day.id} />`

---

## Task 1: `deletePlayer` service with guards

**Files:**
- Create: `src/lib/players/delete.ts`
- Test:  `tests/integration/player-delete.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/player-delete.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  deletePlayer,
  PlayerNotFoundError,
  SelfDeleteError,
  LastAdminError,
  ActiveParticipationError,
} from "@/lib/players/delete";
import { resetDb } from "../helpers/reset-db";

async function makeAdmin(i = 1) {
  return prisma.player.create({
    data: { name: `Admin${i}`, email: `a${i}@x`, passwordHash: "x", isAdmin: true },
  });
}
async function makeUser(i = 1) {
  return prisma.player.create({
    data: { name: `U${i}`, email: `u${i}@x`, passwordHash: "x" },
  });
}
async function makeSeasonAndDay(status: "planned" | "roster_locked" | "in_progress" | "finished") {
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const day = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date(`${year}-04-21`), status, playerCount: 4 },
  });
  return { season, day };
}

describe("deletePlayer", () => {
  beforeEach(resetDb);

  it("soft-deletes an active player and writes an audit log", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    await deletePlayer({ playerId: target.id, actorId: admin.id });

    const row = await prisma.player.findUnique({ where: { id: target.id } });
    expect(row?.deletedAt).not.toBeNull();

    const audit = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.delete" },
    });
    expect(audit).toHaveLength(1);
    const payload = audit[0].payload as { name: string; email: string };
    expect(payload.name).toBe("U1");
    expect(payload.email).toBe("u1@x");
  });

  it("throws PlayerNotFoundError for unknown id", async () => {
    const admin = await makeAdmin();
    await expect(
      deletePlayer({ playerId: "00000000-0000-0000-0000-000000000000", actorId: admin.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for already-deleted player", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    await prisma.player.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
    await expect(
      deletePlayer({ playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws SelfDeleteError when actor and target are the same", async () => {
    const admin = await makeAdmin();
    await expect(
      deletePlayer({ playerId: admin.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(SelfDeleteError);
  });

  it("throws LastAdminError when the target is the only remaining active admin", async () => {
    const soleAdmin = await makeAdmin(1);
    const actor = await makeUser(99); // non-admin actor; auth happens at the API layer
    await expect(
      deletePlayer({ playerId: soleAdmin.id, actorId: actor.id }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });

  it("allows deleting an admin when another active admin remains", async () => {
    const a1 = await makeAdmin(1);
    const a2 = await makeAdmin(2);
    await deletePlayer({ playerId: a1.id, actorId: a2.id });
    const row = await prisma.player.findUnique({ where: { id: a1.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("soft-deleted admins do not count toward the remaining-admin check", async () => {
    const active = await makeAdmin(1);
    const ghost = await makeAdmin(2);
    await prisma.player.update({ where: { id: ghost.id }, data: { deletedAt: new Date() } });
    const actor = await makeUser(99);
    // `ghost` is soft-deleted → `active` is effectively the last admin → deleting it must fail.
    await expect(
      deletePlayer({ playerId: active.id, actorId: actor.id }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });

  it("throws ActiveParticipationError when confirmed on a non-finished day", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const { day } = await makeSeasonAndDay("planned");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: day.id, playerId: target.id, attendance: "confirmed" },
    });
    await expect(
      deletePlayer({ playerId: target.id, actorId: admin.id }),
    ).rejects.toBeInstanceOf(ActiveParticipationError);
  });

  it("allows deletion when only declined or pending on non-finished days", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const { day: planned } = await makeSeasonAndDay("planned");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: planned.id, playerId: target.id, attendance: "declined" },
    });
    await deletePlayer({ playerId: target.id, actorId: admin.id });
    const row = await prisma.player.findUnique({ where: { id: target.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("allows deletion when confirmed only on finished days", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const { day: finished } = await makeSeasonAndDay("finished");
    await prisma.gameDayParticipant.create({
      data: { gameDayId: finished.id, playerId: target.id, attendance: "confirmed" },
    });
    await deletePlayer({ playerId: target.id, actorId: admin.id });
    const row = await prisma.player.findUnique({ where: { id: target.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("preserves historical matches after deletion", async () => {
    const admin = await makeAdmin();
    const p1 = await makeUser(1);
    const p2 = await makeUser(2);
    const p3 = await makeUser(3);
    const p4 = await makeUser(4);
    const { day } = await makeSeasonAndDay("finished");
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: 2,
        team2Score: 1,
      },
    });
    await deletePlayer({ playerId: p1.id, actorId: admin.id });
    const match = await prisma.match.findFirst({ where: { team1PlayerAId: p1.id } });
    expect(match).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test tests/integration/player-delete.test.ts`
Expected: All cases fail with "Cannot find module '@/lib/players/delete'" or similar.

- [ ] **Step 3: Implement the service**

```ts
// src/lib/players/delete.ts
import { prisma } from "@/lib/db";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}
export class SelfDeleteError extends Error {
  constructor() {
    super("cannot delete yourself");
    this.name = "SelfDeleteError";
  }
}
export class LastAdminError extends Error {
  constructor() {
    super("cannot delete the last remaining admin");
    this.name = "LastAdminError";
  }
}
export class ActiveParticipationError extends Error {
  constructor() {
    super("player has active participation on a non-finished game day");
    this.name = "ActiveParticipationError";
  }
}

export interface DeletePlayerInput {
  playerId: string;
  actorId: string;
}

export async function deletePlayer(input: DeletePlayerInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const target = await tx.player.findUnique({
      where: { id: input.playerId },
      select: { id: true, name: true, email: true, isAdmin: true, deletedAt: true },
    });
    if (!target || target.deletedAt) throw new PlayerNotFoundError(input.playerId);

    if (target.id === input.actorId) throw new SelfDeleteError();

    if (target.isAdmin) {
      const remainingAdmins = await tx.player.count({
        where: { isAdmin: true, deletedAt: null, id: { not: target.id } },
      });
      if (remainingAdmins === 0) throw new LastAdminError();
    }

    const activeParticipation = await tx.gameDayParticipant.findFirst({
      where: {
        playerId: target.id,
        attendance: { in: ["confirmed", "joker"] },
        gameDay: { status: { in: ["planned", "roster_locked", "in_progress"] } },
      },
      select: { id: true },
    });
    if (activeParticipation) throw new ActiveParticipationError();

    await tx.player.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "player.delete",
        entityType: "Player",
        entityId: target.id,
        payload: { name: target.name, email: target.email },
      },
    });
  });
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm test tests/integration/player-delete.test.ts`
Expected: All cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/players/delete.ts tests/integration/player-delete.test.ts
git commit -m "feat(players): add deletePlayer service with guards"
```

---

## Task 2: `DELETE /api/players/[id]` route

**Files:**
- Modify: `src/app/api/players/[id]/route.ts` (currently exports only `PATCH`)

- [ ] **Step 1: Add the DELETE handler**

Append to `src/app/api/players/[id]/route.ts` after the existing `PATCH`:

```ts
import {
  deletePlayer,
  PlayerNotFoundError as DeletePlayerNotFoundError,
  SelfDeleteError,
  LastAdminError as DeleteLastAdminError,
  ActiveParticipationError,
} from "@/lib/players/delete";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await deletePlayer({ playerId: id, actorId: session.user.id });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof DeletePlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof SelfDeleteError) {
      return NextResponse.json(
        { error: "self_delete", message: "Du kannst dich nicht selbst löschen" },
        { status: 409 },
      );
    }
    if (e instanceof DeleteLastAdminError) {
      return NextResponse.json(
        { error: "last_admin", message: "Der letzte verbleibende Admin kann nicht gelöscht werden" },
        { status: 409 },
      );
    }
    if (e instanceof ActiveParticipationError) {
      return NextResponse.json(
        { error: "active_participation", message: "Spieler ist für einen laufenden Spieltag eingeplant" },
        { status: 409 },
      );
    }
    throw e;
  }
}
```

Note: the existing `PATCH` uses `LastAdminError` from `@/lib/players/update`. The two `LastAdminError` classes are distinct — the rename aliases (`DeleteLastAdminError`, `DeletePlayerNotFoundError`) prevent a symbol clash at the import level.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/players/[id]/route.ts
git commit -m "feat(api): add DELETE /api/players/[id] route"
```

---

## Task 3: Admin delete button + confirm dialog

**Files:**
- Create: `src/app/admin/delete-player-dialog.tsx`
- Modify: `src/app/admin/players-section.tsx`

- [ ] **Step 1: Write the dialog component**

Create `src/app/admin/delete-player-dialog.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function DeletePlayerDialog({
  open,
  onClose,
  playerId,
  playerName,
  playerEmail,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string | null;
  playerName: string | null;
  playerEmail: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function onConfirm() {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/players/${playerId}`, { method: "DELETE" });
    setLoading(false);
    if (res.status === 204) {
      onClose();
      router.refresh();
      return;
    }
    if (res.status === 409 || res.status === 404) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? "Löschen nicht möglich");
      return;
    }
    setError("Löschen fehlgeschlagen");
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Spieler löschen — ${playerName ?? ""}`}>
      <div className="space-y-3">
        <p className="text-sm text-foreground">
          {playerName}
          {playerEmail && <span className="ml-1 text-muted-foreground">({playerEmail})</span>} wird
          deaktiviert. Historische Matches und Spieltage bleiben erhalten.
        </p>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} loading={loading}>
            Löschen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

`<Button variant="destructive">` is defined in `src/components/ui/button.tsx:17-19`, so use it directly.

- [ ] **Step 2: Wire the dialog into `players-section.tsx`**

Apply these edits to `src/app/admin/players-section.tsx`:

1. Add import near the other dialog imports:
   ```tsx
   import { DeletePlayerDialog } from "./delete-player-dialog";
   import { Trash2 } from "lucide-react";
   ```
2. Add state inside the component, next to `editFor`:
   ```tsx
   const [deleteFor, setDeleteFor] = useState<PlayerRow | null>(null);
   ```
3. Inside the row's button group (after the "Passwort" button), add:
   ```tsx
   <Button
     variant="ghost"
     size="sm"
     aria-label={`Spieler ${p.name} löschen`}
     onClick={() => setDeleteFor(p)}
   >
     <Trash2 className="h-4 w-4" aria-hidden />
   </Button>
   ```
4. Before the closing `</Card>`, mount the dialog:
   ```tsx
   <DeletePlayerDialog
     open={deleteFor !== null}
     onClose={() => setDeleteFor(null)}
     playerId={deleteFor?.id ?? null}
     playerName={deleteFor?.name ?? null}
     playerEmail={deleteFor?.email ?? null}
   />
   ```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm lint`
Expected: no errors. (Full type-check runs as part of `pnpm build`; lint catches the import-level issues here.)

- [ ] **Step 4: Manual sanity**

Run: `pnpm dev`
- Log in as admin.
- Navigate to `/admin`.
- Click the trash icon on a non-admin, non-participating player → confirm dialog appears.
- Click "Löschen" → dialog closes, player disappears from the list.
- Open dialog on the current admin → click Löschen → error "Du kannst dich nicht selbst löschen" renders.

If the `Button` component does not expose `variant="destructive"`, fall back to the inline class approach from Step 1's note before this manual check.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/delete-player-dialog.tsx src/app/admin/players-section.tsx
git commit -m "feat(admin): add delete player button and confirm dialog"
```

---

## Task 4: `computeGameDaySummary` aggregator

**Files:**
- Create: `src/lib/game-day/summary.ts`
- Test:  `tests/integration/gameday-summary.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/integration/gameday-summary.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { computeGameDaySummary } from "@/lib/game-day/summary";
import { resetDb } from "../helpers/reset-db";

async function makeSeason() {
  const year = new Date().getFullYear();
  return prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
}
async function makeUser(name: string) {
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash: "x" },
  });
}

describe("computeGameDaySummary", () => {
  beforeEach(resetDb);

  it("returns null for unknown id", async () => {
    const result = await computeGameDaySummary("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("aggregates points and matches per player", async () => {
    const season = await makeSeason();
    const [paul, patrick, michi, thomas] = await Promise.all(
      ["Paul", "Patrick", "Michi", "Thomas"].map(makeUser),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    // Match 1: Paul+Patrick 2, Michi+Thomas 1
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
    // Match 2: Paul+Michi 3, Patrick+Thomas 0
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

    const summary = await computeGameDaySummary(day.id);
    expect(summary).not.toBeNull();
    const byName = Object.fromEntries(summary!.rows.map((r) => [r.playerName, r]));
    expect(byName.Paul.points).toBe(5); // 2 + 3
    expect(byName.Paul.matches).toBe(2);
    expect(byName.Patrick.points).toBe(2); // 2 + 0
    expect(byName.Patrick.matches).toBe(2);
    expect(byName.Michi.points).toBe(4); // 1 + 3
    expect(byName.Michi.matches).toBe(2);
    expect(byName.Thomas.points).toBe(1); // 1 + 0
    expect(byName.Thomas.matches).toBe(2);
    expect(summary!.rows.map((r) => r.playerName)).toEqual([
      "Paul",
      "Michi",
      "Patrick",
      "Thomas",
    ]);
    expect(summary!.podium.map((r) => r.playerName)).toEqual(["Paul", "Michi", "Patrick"]);
  });

  it("tie-breaks by matches DESC then name ASC", async () => {
    const season = await makeSeason();
    const [a, b, c, d] = await Promise.all(["Anna", "Bert", "Cara", "Dirk"].map(makeUser));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    // All four have the same score (1 point each) in one match.
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: a.id,
        team1PlayerBId: b.id,
        team2PlayerAId: c.id,
        team2PlayerBId: d.id,
        team1Score: 1,
        team2Score: 1,
      },
    });
    const summary = await computeGameDaySummary(day.id);
    // Equal points (1) + equal matches (1) → name ASC
    expect(summary!.rows.map((r) => r.playerName)).toEqual(["Anna", "Bert", "Cara", "Dirk"]);
  });

  it("excludes matches with NULL scores", async () => {
    const season = await makeSeason();
    const [p1, p2, p3, p4] = await Promise.all(["P1", "P2", "P3", "P4"].map(makeUser));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: null,
        team2Score: null,
      },
    });
    const summary = await computeGameDaySummary(day.id);
    expect(summary!.rows).toEqual([]);
    expect(summary!.podium).toEqual([]);
  });

  it("truncates the podium when fewer than 3 players played", async () => {
    const season = await makeSeason();
    const [p1, p2, p3, p4] = await Promise.all(["A", "B", "C", "D"].map(makeUser));
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4, status: "finished" },
    });
    // Only two players score (one match, one team): but a match requires 4 slots.
    // To produce only "2 players with rows", give a scored match and then a second unscored one.
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: 3,
        team2Score: 0,
      },
    });
    const summary = await computeGameDaySummary(day.id);
    // Four players each played one match (scored), so podium is length 3 here;
    // truncation is tested structurally: podium = rows.slice(0, 3).
    expect(summary!.podium).toHaveLength(3);
    expect(summary!.podium).toEqual(summary!.rows.slice(0, 3));
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test tests/integration/gameday-summary.test.ts`
Expected: "Cannot find module '@/lib/game-day/summary'".

- [ ] **Step 3: Implement the aggregator**

```ts
// src/lib/game-day/summary.ts
import { prisma } from "@/lib/db";
import type { GameDayStatus } from "@prisma/client";

export interface GameDaySummaryRow {
  playerId: string;
  playerName: string;
  points: number;
  matches: number;
}

export interface GameDaySummary {
  gameDayId: string;
  date: Date;
  status: GameDayStatus;
  rows: GameDaySummaryRow[];
  podium: GameDaySummaryRow[];
}

export async function computeGameDaySummary(
  gameDayId: string,
): Promise<GameDaySummary | null> {
  const day = await prisma.gameDay.findUnique({
    where: { id: gameDayId },
    select: {
      id: true,
      date: true,
      status: true,
      matches: {
        where: { team1Score: { not: null }, team2Score: { not: null } },
        select: {
          team1PlayerAId: true,
          team1PlayerBId: true,
          team2PlayerAId: true,
          team2PlayerBId: true,
          team1Score: true,
          team2Score: true,
        },
      },
    },
  });
  if (!day) return null;

  const totals = new Map<string, { points: number; matches: number }>();
  for (const m of day.matches) {
    const t1 = m.team1Score ?? 0;
    const t2 = m.team2Score ?? 0;
    for (const pid of [m.team1PlayerAId, m.team1PlayerBId]) {
      const cur = totals.get(pid) ?? { points: 0, matches: 0 };
      cur.points += t1;
      cur.matches += 1;
      totals.set(pid, cur);
    }
    for (const pid of [m.team2PlayerAId, m.team2PlayerBId]) {
      const cur = totals.get(pid) ?? { points: 0, matches: 0 };
      cur.points += t2;
      cur.matches += 1;
      totals.set(pid, cur);
    }
  }

  const playerIds = [...totals.keys()];
  const players = playerIds.length
    ? await prisma.player.findMany({
        where: { id: { in: playerIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(players.map((p) => [p.id, p.name]));

  const rows: GameDaySummaryRow[] = playerIds.map((pid) => ({
    playerId: pid,
    playerName: nameById.get(pid) ?? "Unbekannt",
    points: totals.get(pid)!.points,
    matches: totals.get(pid)!.matches,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.matches !== a.matches) return b.matches - a.matches;
    return a.playerName.localeCompare(b.playerName, "de");
  });

  return {
    gameDayId: day.id,
    date: day.date,
    status: day.status,
    rows,
    podium: rows.slice(0, 3),
  };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm test tests/integration/gameday-summary.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game-day/summary.ts tests/integration/gameday-summary.test.ts
git commit -m "feat(game-day): add computeGameDaySummary aggregator"
```

---

## Task 5: `FinishedSummary` UI component

**Files:**
- Create: `src/app/game-day/finished-summary.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/app/game-day/finished-summary.tsx
import { computeGameDaySummary } from "@/lib/game-day/summary";

const PODIUM_STYLES = [
  { label: "1.", className: "text-warning", badge: "bg-warning/15" },
  { label: "2.", className: "text-foreground-muted", badge: "bg-foreground-muted/15" },
  { label: "3.", className: "text-primary", badge: "bg-primary/15" },
] as const;

export async function FinishedSummary({
  gameDayId,
  scoredMatchCount,
  totalMatchCount,
}: {
  gameDayId: string;
  scoredMatchCount: number;
  totalMatchCount: number;
}) {
  const summary = await computeGameDaySummary(gameDayId);

  if (!summary || summary.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Zusammenfassung
        </div>
        <div className="mt-2 text-sm text-foreground">
          Spieltag beendet · {scoredMatchCount} / {totalMatchCount} Matches gewertet
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Zusammenfassung
        </div>
        <div className="mt-1 text-sm text-foreground-muted">
          Spieltag beendet · {scoredMatchCount} / {totalMatchCount} Matches gewertet
        </div>
      </div>

      <ol className="grid gap-2 sm:grid-cols-3">
        {summary.podium.map((row, i) => {
          const style = PODIUM_STYLES[i];
          return (
            <li
              key={row.playerId}
              className={`flex items-center gap-3 rounded-xl border border-border p-3 ${style.badge}`}
            >
              <span className={`text-xl font-extrabold tabular-nums ${style.className}`}>
                {style.label}
              </span>
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
            <th className="py-1.5 pr-2">#</th>
            <th className="py-1.5 pr-2">Name</th>
            <th className="py-1.5 pr-2 text-right">Punkte</th>
            <th className="py-1.5 text-right">Matches</th>
          </tr>
        </thead>
        <tbody>
          {summary.rows.map((row, i) => (
            <tr key={row.playerId} className="border-t border-border">
              <td className="py-1.5 pr-2 tabular-nums text-foreground-muted">{i + 1}</td>
              <td className="py-1.5 pr-2 text-foreground">{row.playerName}</td>
              <td className="py-1.5 pr-2 text-right font-semibold tabular-nums text-foreground">
                {row.points}
              </td>
              <td className="py-1.5 text-right tabular-nums text-foreground-muted">{row.matches}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/game-day/finished-summary.tsx
git commit -m "feat(game-day): add FinishedSummary component"
```

---

## Task 6: Wire summary into `/game-day`

**Files:**
- Modify: `src/app/game-day/page.tsx`

- [ ] **Step 1: Replace the finished block**

In `src/app/game-day/page.tsx`:

1. Add near the other `./…` imports at the top:
   ```ts
   import { FinishedSummary } from "./finished-summary";
   ```
2. Replace the existing finished-state block:
   ```tsx
   {day.status === "finished" && (
     <div className="rounded-2xl border border-border bg-surface p-4">
       <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
         Zusammenfassung
       </div>
       <div className="mt-2 text-sm text-foreground">
         Spieltag beendet · {day.matches.filter((m) => m.team1Score !== null && m.team2Score !== null).length}
         {" / "}
         {day.matches.length} Matches gewertet
       </div>
     </div>
   )}
   ```
   with:
   ```tsx
   {day.status === "finished" && (
     <FinishedSummary
       gameDayId={day.id}
       scoredMatchCount={day.matches.filter((m) => m.team1Score !== null && m.team2Score !== null).length}
       totalMatchCount={day.matches.length}
     />
   )}
   ```

- [ ] **Step 2: Lint + full test run**

Run in parallel:
- `pnpm lint`
- `pnpm test`

Expected: no lint errors; 242 + new tests all pass (exact total depends on how many new tests land — all must pass).

- [ ] **Step 3: Manual sanity**

Run: `pnpm dev`
- As admin, finish the active game day (or use an existing finished one within the 24h window).
- Navigate to `/game-day`.
- Expect podium of top 3 with gold/silver/bronze styling and full per-player table.

- [ ] **Step 4: Commit**

```bash
git add src/app/game-day/page.tsx
git commit -m "feat(game-day): show summary when status is finished"
```

---

## Final Task: Full-suite gate

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass, including the two new integration files.

- [ ] **Step 2: Lint + build**

Run sequentially (build depends on type-check):
```bash
pnpm lint
pnpm build
```
Expected: both succeed with no errors or warnings beyond pre-existing noise.

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin feature/player-delete-and-gameday-summary
gh pr create --title "feat: player soft-delete + game-day summary" --body "$(cat <<'EOF'
## Summary
- Admin-only soft-delete of players with guards (self, last admin, active participation); audit logged
- Post-finish game-day summary: podium (top 3) + per-player points/matches table
- Replaces placeholder "X / Y Matches gewertet" block on `/game-day` for finished days

## Test plan
- [x] Integration tests for delete service (all guards, audit log, history preservation)
- [x] Integration tests for summary aggregator (aggregation, tie-break, NULL exclusion, unknown id)
- [x] `pnpm test` green
- [x] `pnpm lint` + `pnpm build` green
- [ ] Manual smoke: delete non-admin player in /admin; finish a game-day and view podium
EOF
)"
```
