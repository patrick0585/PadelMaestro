# PR-C — Game-Day Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the status timeline to three steps, enforce one game day per date, add hard-delete / extra-match / manual-finish admin actions, and drop the implicit auto-finish on last score.

**Architecture:** Five independent sub-features (C1–C5) share admin-UI surface and the `GameDayStatus` state machine. All library logic lives under `src/lib/game-day/`; each lib throws typed errors that route handlers map to HTTP codes. Two schema migrations: a unique constraint on `(seasonId, date)` and a cascade on `JokerUse.gameDay`. Auto-finish is replaced by an explicit admin action; a client-side banner nudges the admin when all matches are scored.

**Tech Stack:** Next.js 15 App Router, Prisma 6 (PostgreSQL), Zod 4, Vitest 4 + jsdom, NextAuth v5, lucide-react.

**Spec reference:** `docs/superpowers/specs/2026-04-22-game-day-lifecycle-and-identity-design.md` sections C1–C5.

---

## File Structure

**Created:**
- `src/lib/game-day/delete.ts` — hard delete with status guard + audit log
- `src/lib/game-day/add-extra-match.ts` — append one match with fresh seed
- `src/lib/game-day/finish.ts` — manual finish with status guard
- `src/app/api/game-days/[id]/route.ts` — `DELETE` handler
- `src/app/api/game-days/[id]/matches/route.ts` — `POST` handler
- `src/app/api/game-days/[id]/finish/route.ts` — `POST` handler
- `src/app/admin/delete-game-day-button.tsx` — trash icon + confirm dialog
- `src/app/game-day/add-extra-match-button.tsx` — "+ Zusatz-Match" button (admin-only)
- `src/app/game-day/finish-banner.tsx` — "All scored" banner with finish + extra-match actions
- `prisma/migrations/<TS>_add_gameday_date_unique/migration.sql`
- `prisma/migrations/<TS>_add_joker_gameday_cascade/migration.sql`
- `tests/unit/game-day/delete.test.ts`
- `tests/unit/game-day/add-extra-match.test.ts`
- `tests/unit/game-day/finish.test.ts`
- `tests/integration/game-day-delete.test.ts`
- `tests/integration/game-day-extra-match.test.ts`
- `tests/integration/game-day-finish.test.ts`

**Modified:**
- `src/app/game-day/phase.ts` — 4-step → 3-step timeline
- `tests/unit/game-day/phase.test.ts` — updated assertions
- `src/lib/game-day/create.ts` — wrap P2002 in `GameDayDateExistsError`
- `src/app/api/game-days/route.ts` — map error to 409 `date_exists`
- `src/app/admin/create-game-day-form.tsx` — inline duplicate-date message
- `src/app/admin/page.tsx` — query also includes `roster_locked`, render trash button
- `src/app/game-day/page.tsx` — wire up extra-match button + finish banner for admins
- `src/lib/match/enter-score.ts` — drop auto-finish block
- `tests/integration/enter-score.test.ts` — invert last two assertions (status stays `in_progress`; rejection only after manual finish)
- `prisma/schema.prisma` — `@@unique([seasonId, date])`, drop old index; `onDelete: Cascade` on `JokerUse.gameDay`

---

## Task 1: C1 — Timeline 4 steps → 3 steps

**Scene:** Pure UI rewrite. The DB enum `GameDayStatus` is unchanged — `roster_locked` still exists internally, only the timeline rendering collapses. Both `roster_locked` and `in_progress` map to the "Matches" current step.

**Files:**
- Modify: `src/app/game-day/phase.ts`
- Modify: `tests/unit/game-day/phase.test.ts`

- [ ] **Step 1: Rewrite the unit test first (red)**

Replace the whole file `tests/unit/game-day/phase.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import { timelineForStatus } from "@/app/game-day/phase";

describe("timelineForStatus", () => {
  it("returns exactly 3 steps labelled Geplant / Matches / Fertig", () => {
    const steps = timelineForStatus("planned");
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.label)).toEqual(["Geplant", "Matches", "Fertig"]);
  });

  it("marks Geplant as current when status=planned", () => {
    const steps = timelineForStatus("planned");
    expect(steps.map((s) => s.status)).toEqual(["current", "upcoming", "upcoming"]);
  });

  it("marks Matches as current when status=roster_locked", () => {
    const steps = timelineForStatus("roster_locked");
    expect(steps.map((s) => s.status)).toEqual(["done", "current", "upcoming"]);
  });

  it("marks Matches as current when status=in_progress (same as roster_locked)", () => {
    const steps = timelineForStatus("in_progress");
    expect(steps.map((s) => s.status)).toEqual(["done", "current", "upcoming"]);
  });

  it("marks everything done with Fertig current when finished", () => {
    const steps = timelineForStatus("finished");
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "current"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/unit/game-day/phase.test.ts`
Expected: FAIL — old `timelineForStatus` returns 4 steps.

- [ ] **Step 3: Rewrite `src/app/game-day/phase.ts` (green)**

Replace the whole file with:

```ts
import type { TimelineStep } from "@/components/ui/timeline";

export type GameDayStatus = "planned" | "roster_locked" | "in_progress" | "finished";

type UiStepId = "planned" | "matches" | "finished";
const STEPS: { id: UiStepId; label: string }[] = [
  { id: "planned", label: "Geplant" },
  { id: "matches", label: "Matches" },
  { id: "finished", label: "Fertig" },
];

function uiIndexFor(status: GameDayStatus): number {
  switch (status) {
    case "planned":
      return 0;
    case "roster_locked":
    case "in_progress":
      return 1;
    case "finished":
      return 2;
  }
}

export function timelineForStatus(status: GameDayStatus): TimelineStep[] {
  const currentIndex = uiIndexFor(status);
  return STEPS.map((step, index) => {
    let stepStatus: TimelineStep["status"];
    if (index < currentIndex) stepStatus = "done";
    else if (index === currentIndex) stepStatus = "current";
    else stepStatus = "upcoming";
    return { id: step.id, label: step.label, status: stepStatus };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/unit/game-day/phase.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Run the typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors. (If a caller relied on the old 4-label set, fix it now — there are none today.)

- [ ] **Step 6: Commit**

```bash
git add src/app/game-day/phase.ts tests/unit/game-day/phase.test.ts
git commit -m "$(cat <<'EOF'
feat(game-day): collapse timeline from 4 to 3 steps

Both roster_locked and in_progress now map to the same "Matches"
step; the DB enum is unchanged.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: C2 — One game day per date (unique constraint + error mapping)

**Scene:** Enforce at most one `GameDay` per `(seasonId, date)` at the DB level. `createGameDay` catches the Prisma P2002 unique-violation and throws a typed `GameDayDateExistsError`. The API route maps it to `409 { error: "date_exists" }`. The admin form renders a specific inline error.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<TS>_add_gameday_date_unique/migration.sql` (via `prisma migrate dev`)
- Modify: `src/lib/game-day/create.ts`
- Modify: `src/app/api/game-days/route.ts`
- Modify: `src/app/admin/create-game-day-form.tsx`
- Create: `tests/integration/game-day-date-unique.test.ts`

- [ ] **Step 1: Pre-migration audit**

Run: `pnpm dlx prisma db execute --stdin --schema=prisma/schema.prisma <<'SQL'
SELECT "seasonId", "date", COUNT(*)
FROM "GameDay"
GROUP BY "seasonId", "date"
HAVING COUNT(*) > 1;
SQL`

Expected: zero rows. If any duplicates exist, STOP and ask the user to resolve manually; do not proceed.

- [ ] **Step 2: Write the integration test first (red)**

Create `tests/integration/game-day-date-unique.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay, GameDayDateExistsError } from "@/lib/game-day/create";
import { resetDb } from "../helpers/reset-db";

describe("createGameDay — unique date constraint", () => {
  beforeEach(resetDb);

  it("throws GameDayDateExistsError when a day for the same date already exists", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await createGameDay(new Date("2026-04-21"), admin.id);

    await expect(createGameDay(new Date("2026-04-21"), admin.id)).rejects.toBeInstanceOf(
      GameDayDateExistsError,
    );
  });

  it("allows different dates in the same season", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await createGameDay(new Date("2026-04-21"), admin.id);
    await expect(createGameDay(new Date("2026-04-22"), admin.id)).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run tests/integration/game-day-date-unique.test.ts`
Expected: FAIL — `GameDayDateExistsError` is not exported; second `createGameDay` currently succeeds.

- [ ] **Step 4: Update `prisma/schema.prisma`**

In the `GameDay` model, replace:

```prisma
  @@index([seasonId, date])
```

with:

```prisma
  @@unique([seasonId, date])
```

(Unique already implies an index, so the separate `@@index` line is removed.)

- [ ] **Step 5: Generate the migration**

Run: `pnpm dlx prisma migrate dev --name add_gameday_date_unique`
Expected: new migration folder under `prisma/migrations/`. The SQL should DROP the old `GameDay_seasonId_date_idx` and CREATE a `GameDay_seasonId_date_key` unique index.

Verify the generated `migration.sql` contains both steps. If Prisma emits additional unrelated changes, STOP and investigate.

- [ ] **Step 6: Update `src/lib/game-day/create.ts`**

Replace the whole file with:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";

export class GameDayDateExistsError extends Error {
  constructor(date: Date) {
    super(`game day for ${date.toISOString().slice(0, 10)} already exists`);
    this.name = "GameDayDateExistsError";
  }
}

export async function createGameDay(date: Date, actorId: string) {
  const season = await getOrCreateActiveSeason();
  const players = await prisma.player.findMany({ where: { deletedAt: null } });

  try {
    return await prisma.$transaction(async (tx) => {
      const day = await tx.gameDay.create({
        data: {
          seasonId: season.id,
          date,
          status: "planned",
          participants: {
            create: players.map((p) => ({ playerId: p.id })),
          },
        },
        include: { participants: true },
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "game_day.create",
          entityType: "GameDay",
          entityId: day.id,
          payload: { date: date.toISOString() },
        },
      });

      return day;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("date") || target.includes("seasonId")) {
        throw new GameDayDateExistsError(date);
      }
      throw e;
    }
    throw e;
  }
}
```

- [ ] **Step 7: Run the integration test to verify it passes**

Run: `pnpm vitest run tests/integration/game-day-date-unique.test.ts`
Expected: PASS (2/2). The pre-existing `tests/integration/game-day-create.test.ts` must still pass; run it too.

Run: `pnpm vitest run tests/integration/game-day-create.test.ts`
Expected: PASS.

- [ ] **Step 8: Update the API route — `src/app/api/game-days/route.ts`**

Replace the whole file with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createGameDay, GameDayDateExistsError } from "@/lib/game-day/create";

const CreateSchema = z.object({ date: z.string() });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const days = await prisma.gameDay.findMany({
    orderBy: { date: "desc" },
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({ gameDays: days });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const day = await createGameDay(new Date(parsed.data.date), session.user.id);
    return NextResponse.json({ gameDay: day }, { status: 201 });
  } catch (e) {
    if (e instanceof GameDayDateExistsError) {
      return NextResponse.json({ error: "date_exists" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 9: Add an API-level integration test**

Append to `tests/integration/game-day-date-unique.test.ts` (keep the existing imports):

```ts
import { POST } from "@/app/api/game-days/route";
import { vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function postReq(body: unknown) {
  return new Request("http://localhost/api/game-days", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/game-days — duplicate date", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 409 date_exists when the date is taken", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    await createGameDay(new Date("2026-04-21"), admin.id);

    const res = await POST(postReq({ date: "2026-04-21" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "date_exists" });
  });
});
```

- [ ] **Step 10: Run the updated test file to verify it passes**

Run: `pnpm vitest run tests/integration/game-day-date-unique.test.ts`
Expected: PASS (3/3).

- [ ] **Step 11: Update the admin form — `src/app/admin/create-game-day-form.tsx`**

Replace the whole file with:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateGameDayForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/game-days", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    setLoading(false);
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "date_exists") {
        setError("Für diesen Tag existiert bereits ein Spieltag");
      } else {
        setError("Anlegen fehlgeschlagen");
      }
      return;
    }
    if (!res.ok) {
      setError("Anlegen fehlgeschlagen");
      return;
    }
    setDate("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[12rem]">
        <Label htmlFor="game-day-date">Datum</Label>
        <Input
          id="game-day-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <Button type="submit" loading={loading}>
        Spieltag anlegen
      </Button>
      {error && (
        <p className="w-full rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 12: Run the full suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git add prisma/schema.prisma prisma/migrations \
  src/lib/game-day/create.ts src/app/api/game-days/route.ts \
  src/app/admin/create-game-day-form.tsx \
  tests/integration/game-day-date-unique.test.ts
git commit -m "$(cat <<'EOF'
feat(game-day): enforce one game day per date

- Adds @@unique([seasonId, date]) + migration
- createGameDay throws GameDayDateExistsError on P2002
- POST /api/game-days returns 409 date_exists
- Admin form renders inline German error on duplicate

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: C3 — Delete game day (hard, planned + roster_locked)

**Scene:** Admin may delete any game day still in `planned` or `roster_locked`. Delete cascades to `Match` and `GameDayParticipant` (already wired) and — after this task's schema migration — to `JokerUse`. The `AuditLog` entry is created BEFORE the hard delete inside the transaction, since the log has no FK to GameDay and we want the record to survive. The admin page now also surfaces `roster_locked` days so the trash icon is reachable.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<TS>_add_joker_gameday_cascade/migration.sql`
- Create: `src/lib/game-day/delete.ts`
- Create: `src/app/api/game-days/[id]/route.ts`
- Create: `src/app/admin/delete-game-day-button.tsx`
- Modify: `src/app/admin/page.tsx`
- Create: `tests/unit/game-day/delete.test.ts`
- Create: `tests/integration/game-day-delete.test.ts`

- [ ] **Step 1: Update `prisma/schema.prisma`**

In the `JokerUse` model, change:

```prisma
  gameDay GameDay @relation(fields: [gameDayId], references: [id])
```

to:

```prisma
  gameDay GameDay @relation(fields: [gameDayId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm dlx prisma migrate dev --name add_joker_gameday_cascade`
Expected: migration SQL drops and re-creates the `JokerUse_gameDayId_fkey` with `ON DELETE CASCADE`. If unrelated changes appear, STOP.

- [ ] **Step 3: Write the unit test for `deleteGameDay` (red)**

Create `tests/unit/game-day/delete.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { deleteGameDay, GameDayNotDeletableError } from "@/lib/game-day/delete";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";
import { resetDb } from "../../helpers/reset-db";

async function makeDay(status: "planned" | "roster_locked" | "in_progress" | "finished") {
  const admin = await prisma.player.create({
    data: { name: "A", email: `a-${status}@example.com`, passwordHash: "x", isAdmin: true },
  });
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const day = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status },
  });
  return { admin, day };
}

describe("deleteGameDay", () => {
  beforeEach(resetDb);

  it("deletes a planned day and writes an audit log entry", async () => {
    const { admin, day } = await makeDay("planned");
    await deleteGameDay(day.id, admin.id);

    expect(await prisma.gameDay.findUnique({ where: { id: day.id } })).toBeNull();
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.delete", entityId: day.id },
    });
    expect(entries).toHaveLength(1);
  });

  it("deletes a roster_locked day", async () => {
    const { admin, day } = await makeDay("roster_locked");
    await deleteGameDay(day.id, admin.id);
    expect(await prisma.gameDay.findUnique({ where: { id: day.id } })).toBeNull();
  });

  it("rejects in_progress with GameDayNotDeletableError", async () => {
    const { admin, day } = await makeDay("in_progress");
    await expect(deleteGameDay(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotDeletableError);
  });

  it("rejects finished with GameDayNotDeletableError", async () => {
    const { admin, day } = await makeDay("finished");
    await expect(deleteGameDay(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotDeletableError);
  });

  it("throws GameDayNotFoundError for an unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await expect(deleteGameDay("00000000-0000-0000-0000-000000000000", admin.id)).rejects.toBeInstanceOf(
      GameDayNotFoundError,
    );
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm vitest run tests/unit/game-day/delete.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 5: Implement `src/lib/game-day/delete.ts` (green)**

Create:

```ts
import { prisma } from "@/lib/db";
import { GameDayNotFoundError } from "./attendance";

export class GameDayNotDeletableError extends Error {
  constructor(status: string) {
    super(`game day cannot be deleted in status ${status}`);
    this.name = "GameDayNotDeletableError";
  }
}

export async function deleteGameDay(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({ where: { id: gameDayId } });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    if (day.status !== "planned" && day.status !== "roster_locked") {
      throw new GameDayNotDeletableError(day.status);
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.delete",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: {
          date: day.date.toISOString(),
          status: day.status,
          playerCount: day.playerCount,
        },
      },
    });

    await tx.gameDay.delete({ where: { id: gameDayId } });
  });
}
```

- [ ] **Step 6: Run the unit test to verify it passes**

Run: `pnpm vitest run tests/unit/game-day/delete.test.ts`
Expected: PASS (5/5).

- [ ] **Step 7: Write the integration test for the API route (red)**

Create `tests/integration/game-day-delete.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE } from "@/app/api/game-days/[id]/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup(status: "planned" | "roster_locked" | "in_progress" | "finished") {
  const admin = await prisma.player.create({
    data: { name: "A", email: `a-${status}@example.com`, passwordHash: "x", isAdmin: true },
  });
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const day = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status },
  });
  return { admin, day };
}

function delReq(id: string) {
  return new Request(`http://localhost/api/game-days/${id}`, { method: "DELETE" });
}
async function call(id: string) {
  return DELETE(delReq(id), { params: Promise.resolve({ id }) });
}

describe("DELETE /api/game-days/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("deletes a planned day and returns 204", async () => {
    const { admin, day } = await setup("planned");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(204);
    expect(await prisma.gameDay.findUnique({ where: { id: day.id } })).toBeNull();
  });

  it("deletes a roster_locked day and cascades to JokerUse", async () => {
    const { admin, day } = await setup("roster_locked");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: admin.id,
        seasonId: day.seasonId,
        gameDayId: day.id,
        ppgAtUse: "0",
        gamesCredited: 10,
        pointsCredited: "0",
      },
    });
    const res = await call(day.id);
    expect(res.status).toBe(204);
    expect(await prisma.jokerUse.count({ where: { gameDayId: day.id } })).toBe(0);
  });

  it("returns 409 for in_progress", async () => {
    const { admin, day } = await setup("in_progress");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 for finished", async () => {
    const { admin, day } = await setup("finished");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 404 for unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    const { day } = await setup("planned");
    const user = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: user.id, isAdmin: false, email: user.email, name: user.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(403);
    expect(await prisma.gameDay.count({ where: { id: day.id } })).toBe(1);
  });

  it("audit log entry persists after delete", async () => {
    const { admin, day } = await setup("planned");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    await call(day.id);
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.delete", entityId: day.id },
    });
    expect(entries).toHaveLength(1);
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `pnpm vitest run tests/integration/game-day-delete.test.ts`
Expected: FAIL — route file missing.

- [ ] **Step 9: Implement `src/app/api/game-days/[id]/route.ts` (green)**

Create:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteGameDay, GameDayNotDeletableError } from "@/lib/game-day/delete";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    await deleteGameDay(id, session.user.id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof GameDayNotDeletableError) {
      return NextResponse.json({ error: "not_deletable" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 10: Run the integration tests to verify they pass**

Run: `pnpm vitest run tests/integration/game-day-delete.test.ts`
Expected: PASS (7/7).

- [ ] **Step 11: Create the admin trash button — `src/app/admin/delete-game-day-button.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

interface Props {
  gameDayId: string;
  dateLabel: string;
  status: "planned" | "roster_locked";
}

export function DeleteGameDayButton({ gameDayId, dateLabel, status }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      setError("Löschen fehlgeschlagen");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const message =
    status === "roster_locked"
      ? `Spieltag ${dateLabel} löschen? Generierte Matches gehen verloren — Scores sind noch keine vorhanden.`
      : `Spieltag ${dateLabel} löschen?`;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Spieltag ${dateLabel} löschen`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Spieltag löschen">
        <p className="text-sm text-foreground">{message}</p>
        {error && (
          <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} loading={loading}>
            Löschen
          </Button>
        </div>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 12: Update `src/app/admin/page.tsx` to include roster_locked days and render the trash button**

Replace the `plannedDay` query and its rendering. Change the query to:

```ts
  const manageableDay = await prisma.gameDay.findFirst({
    where: { status: { in: ["planned", "roster_locked"] } },
    orderBy: { date: "desc" },
    include: {
      participants: {
        include: { player: { select: { id: true, name: true } } },
        orderBy: { player: { name: "asc" } },
      },
    },
  });
```

Update the import block to include the delete button:

```ts
import { DeleteGameDayButton } from "./delete-game-day-button";
```

Replace the `plannedDay && (...)` block with a branching render:

```tsx
          {manageableDay && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium text-foreground">
                    {manageableDay.status === "planned" ? "Offener Spieltag" : "Spieltag läuft"}
                    : {new Date(manageableDay.date).toLocaleDateString("de-DE")}
                  </div>
                  <Badge variant="neutral">{manageableDay.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {manageableDay.status === "planned" && (
                    <StartGameDayButton gameDayId={manageableDay.id} />
                  )}
                  <DeleteGameDayButton
                    gameDayId={manageableDay.id}
                    dateLabel={new Date(manageableDay.date).toLocaleDateString("de-DE")}
                    status={manageableDay.status as "planned" | "roster_locked"}
                  />
                </div>
              </div>
              {manageableDay.status === "planned" && (
                <ParticipantsRoster
                  gameDayId={manageableDay.id}
                  participants={buildRosterRows(manageableDay.participants, players)}
                />
              )}
            </div>
          )}
```

- [ ] **Step 13: Run the full suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: all green.

- [ ] **Step 14: Commit**

```bash
git add prisma/schema.prisma prisma/migrations \
  src/lib/game-day/delete.ts \
  src/app/api/game-days/\[id\]/route.ts \
  src/app/admin/delete-game-day-button.tsx \
  src/app/admin/page.tsx \
  tests/unit/game-day/delete.test.ts \
  tests/integration/game-day-delete.test.ts
git commit -m "$(cat <<'EOF'
feat(game-day): admin can delete planned + roster_locked days

- Hard delete via DELETE /api/game-days/[id], 204 on success
- GameDayNotDeletableError → 409, not found → 404, non-admin → 403
- Audit log entry written before delete; cascades to JokerUse
- Admin page surfaces roster_locked days with trash icon

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: C4 — Add extra match

**Scene:** Admin may append one more match to a `roster_locked` or `in_progress` day. Players are drawn only from the `confirmed` pool (pending/declined/joker ignored). A fresh random seed drives the shuffle — repeated teams are acceptable (with 4 confirmed players, a repeat is inevitable). The new match's `matchNumber` is `max(existing) + 1`.

**Files:**
- Create: `src/lib/game-day/add-extra-match.ts`
- Create: `src/app/api/game-days/[id]/matches/route.ts`
- Create: `src/app/game-day/add-extra-match-button.tsx`
- Modify: `src/app/game-day/page.tsx`
- Create: `tests/unit/game-day/add-extra-match.test.ts`
- Create: `tests/integration/game-day-extra-match.test.ts`

- [ ] **Step 1: Write the unit test (red)**

Create `tests/unit/game-day/add-extra-match.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";
import {
  addExtraMatch,
  GameDayNotActiveError,
} from "@/lib/game-day/add-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";
import { resetDb } from "../../helpers/reset-db";

async function setupFive() {
  const players = [];
  for (let i = 1; i <= 5; i++) {
    players.push(
      await prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@example.com`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await lockRoster(day.id, players[0].id);
  return { players, day };
}

describe("addExtraMatch", () => {
  beforeEach(resetDb);

  it("creates a 16th match in roster_locked and writes audit log", async () => {
    const { players, day } = await setupFive();
    const match = await addExtraMatch(day.id, players[0].id);

    expect(match.matchNumber).toBe(16);
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.add_extra_match", entityId: match.id },
    });
    expect(entries).toHaveLength(1);
  });

  it("creates a match in in_progress", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "in_progress" } });
    const match = await addExtraMatch(day.id, players[0].id);
    expect(match.matchNumber).toBe(16);
  });

  it("uses only confirmed players", async () => {
    const { players, day } = await setupFive();
    // setAttendance refuses after lock, so flip one participant directly via prisma.
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: players[4].id } },
      data: { attendance: "declined" },
    });
    const confirmedIds = new Set(players.slice(0, 4).map((p) => p.id));

    const match = await addExtraMatch(day.id, players[0].id);
    for (const id of [
      match.team1PlayerAId,
      match.team1PlayerBId,
      match.team2PlayerAId,
      match.team2PlayerBId,
    ]) {
      expect(confirmedIds.has(id)).toBe(true);
    }
  });

  it("rejects in planned with GameDayNotActiveError", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    await expect(addExtraMatch(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotActiveError);
  });

  it("rejects in finished with GameDayNotActiveError", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });
    await expect(addExtraMatch(day.id, players[0].id)).rejects.toBeInstanceOf(GameDayNotActiveError);
  });

  it("throws GameDayNotFoundError for an unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await expect(
      addExtraMatch("00000000-0000-0000-0000-000000000000", admin.id),
    ).rejects.toBeInstanceOf(GameDayNotFoundError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/unit/game-day/add-extra-match.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/lib/game-day/add-extra-match.ts` (green)**

```ts
import { prisma } from "@/lib/db";
import { loadTemplate } from "@/lib/pairings/load";
import { generateSeed, seededShuffle } from "@/lib/pairings/shuffle";
import { GameDayNotFoundError } from "./attendance";

export class GameDayNotActiveError extends Error {
  constructor(status: string) {
    super(`game day is not active (status=${status})`);
    this.name = "GameDayNotActiveError";
  }
}

export async function addExtraMatch(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({
      where: { id: gameDayId },
      include: {
        participants: { include: { player: { select: { id: true, name: true } } } },
        matches: { select: { matchNumber: true } },
      },
    });
    if (!day) throw new GameDayNotFoundError(gameDayId);
    if (day.status !== "roster_locked" && day.status !== "in_progress") {
      throw new GameDayNotActiveError(day.status);
    }

    const confirmed = day.participants
      .filter((p) => p.attendance === "confirmed")
      .map((p) => ({ id: p.player.id, name: p.player.name }));
    if (confirmed.length < 4) {
      throw new GameDayNotActiveError(`only ${confirmed.length} confirmed players`);
    }

    const template = loadTemplate(Math.min(confirmed.length, 6));
    const slot = template.matches[Math.floor(Math.random() * template.matches.length)];
    const shuffled = seededShuffle(confirmed, generateSeed());
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
        payload: {
          gameDayId,
          matchNumber: nextMatchNumber,
          templateSlot: slot.matchNumber,
        },
      },
    });

    return match;
  });
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `pnpm vitest run tests/unit/game-day/add-extra-match.test.ts`
Expected: PASS (6/6).

- [ ] **Step 5: Write the API integration test (red)**

Create `tests/integration/game-day-extra-match.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/matches/route";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setupFive() {
  const players = [];
  for (let i = 1; i <= 5; i++) {
    players.push(
      await prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@example.com`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await lockRoster(day.id, players[0].id);
  return { players, day };
}

function postReq(id: string) {
  return new Request(`http://localhost/api/game-days/${id}/matches`, { method: "POST" });
}
async function call(id: string) {
  return POST(postReq(id), { params: Promise.resolve({ id }) });
}

describe("POST /api/game-days/[id]/matches", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("creates match #16 in roster_locked", async () => {
    const { players, day } = await setupFive();
    authMock.mockResolvedValue({
      user: { id: players[0].id, isAdmin: true, email: players[0].email, name: players[0].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { match: { matchNumber: number } };
    expect(body.match.matchNumber).toBe(16);
  });

  it("returns 409 in planned", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 in finished", async () => {
    const { players, day } = await setupFive();
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });
    authMock.mockResolvedValue({
      user: { id: players[0].id, isAdmin: true, email: players[0].email, name: players[0].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 403 for non-admin", async () => {
    const { players, day } = await setupFive();
    authMock.mockResolvedValue({
      user: { id: players[1].id, isAdmin: false, email: players[1].email, name: players[1].name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run tests/integration/game-day-extra-match.test.ts`
Expected: FAIL — route file missing.

- [ ] **Step 7: Implement `src/app/api/game-days/[id]/matches/route.ts` (green)**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  addExtraMatch,
  GameDayNotActiveError,
} from "@/lib/game-day/add-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    const match = await addExtraMatch(id, session.user.id);
    return NextResponse.json({ match }, { status: 201 });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof GameDayNotActiveError) {
      return NextResponse.json({ error: "not_active" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 8: Run the integration tests to verify they pass**

Run: `pnpm vitest run tests/integration/game-day-extra-match.test.ts`
Expected: PASS (5/5).

- [ ] **Step 9: Create the UI button — `src/app/game-day/add-extra-match-button.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AddExtraMatchButton({ gameDayId, label }: { gameDayId: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/matches`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      setError("Hinzufügen fehlgeschlagen");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" size="sm" onClick={onClick} loading={loading}>
        {label ?? "+ Zusatz-Match"}
      </Button>
      {error && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Wire the button into `src/app/game-day/page.tsx`**

At the top, add the import:

```ts
import { AddExtraMatchButton } from "./add-extra-match-button";
```

Inside the `day.matches.length > 0 && ...` section, after the matches list `</div>`, insert the admin-only button:

```tsx
            {session.user.isAdmin &&
              (day.status === "roster_locked" || day.status === "in_progress") && (
                <AddExtraMatchButton gameDayId={day.id} />
              )}
```

The button renders only for admins while the day is active — non-admin and finished views are unaffected.

- [ ] **Step 11: Run the full suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add src/lib/game-day/add-extra-match.ts \
  src/app/api/game-days/\[id\]/matches/route.ts \
  src/app/game-day/add-extra-match-button.tsx \
  src/app/game-day/page.tsx \
  tests/unit/game-day/add-extra-match.test.ts \
  tests/integration/game-day-extra-match.test.ts
git commit -m "$(cat <<'EOF'
feat(game-day): admin can add extra match

- POST /api/game-days/[id]/matches, 201 with match, 409/404/403 otherwise
- Fresh seed per call; only confirmed participants selected
- +Zusatz-Match button visible to admins during roster_locked/in_progress

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: C5 — Manual finish + auto-prompt banner

**Scene:** Auto-finish is removed: `enterScore` no longer flips the day to `finished`. A new `finishGameDay` lib + `POST /api/game-days/[id]/finish` endpoint handles it. The `/game-day` page renders an admin-only banner when all matches are scored and the day is still `in_progress`.

**Files:**
- Modify: `src/lib/match/enter-score.ts`
- Modify: `tests/integration/enter-score.test.ts`
- Create: `src/lib/game-day/finish.ts`
- Create: `src/app/api/game-days/[id]/finish/route.ts`
- Create: `src/app/game-day/finish-banner.tsx`
- Modify: `src/app/game-day/page.tsx`
- Create: `tests/unit/game-day/finish.test.ts`
- Create: `tests/integration/game-day-finish.test.ts`

- [ ] **Step 1: Update the existing enter-score integration tests (red expected on old assertions)**

Edit `tests/integration/enter-score.test.ts`:

**Replace** the test `"advances status to finished when the last match is scored"` with:

```ts
  it("keeps status in_progress when the last match is scored (no auto-finish)", async () => {
    const { players, day, matches } = await setupFivePlayerGame();
    for (const m of matches) {
      await enterScore({
        matchId: m.id,
        team1Score: 3,
        team2Score: 0,
        scoredBy: players[0].id,
        expectedVersion: 0,
      });
    }

    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("in_progress");
  });
```

**Replace** the test `"rejects score edits on a finished game day"` with:

```ts
  it("rejects score edits after the day is manually finished", async () => {
    const { players, day, matches } = await setupFivePlayerGame();
    for (const m of matches) {
      await enterScore({
        matchId: m.id,
        team1Score: 3,
        team2Score: 0,
        scoredBy: players[0].id,
        expectedVersion: 0,
      });
    }
    // Manually finish so the guard fires on the retry.
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "finished" } });

    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 2,
        team2Score: 1,
        scoredBy: players[0].id,
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(GameDayFinishedError);
  });
```

- [ ] **Step 2: Run the updated enter-score tests — they should still fail on the old `auto-finish` behaviour**

Run: `pnpm vitest run tests/integration/enter-score.test.ts`
Expected: the first rewritten test FAILS because auto-finish currently flips the status. The second passes because we manually set status.

- [ ] **Step 3: Remove the auto-finish block in `src/lib/match/enter-score.ts`**

Delete lines 61–72 (the `const unscored = ... if (unscored === 0) { ... }` block):

The surviving tail should look like:

```ts
  await prisma.gameDay.updateMany({
    where: { id: match.gameDayId, status: "roster_locked" },
    data: { status: "in_progress" },
  });

  return prisma.match.findUniqueOrThrow({ where: { id: input.matchId } });
}
```

- [ ] **Step 4: Run the enter-score tests to verify they pass**

Run: `pnpm vitest run tests/integration/enter-score.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: Write the finish unit test (red)**

Create `tests/unit/game-day/finish.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  finishGameDay,
  GameDayAlreadyFinishedError,
} from "@/lib/game-day/finish";
import { GameDayNotActiveError } from "@/lib/game-day/add-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";
import { resetDb } from "../../helpers/reset-db";

async function makeDay(status: "planned" | "roster_locked" | "in_progress" | "finished") {
  const admin = await prisma.player.create({
    data: { name: "A", email: `a-${status}@example.com`, passwordHash: "x", isAdmin: true },
  });
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const day = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status },
  });
  return { admin, day };
}

describe("finishGameDay", () => {
  beforeEach(resetDb);

  it("flips in_progress to finished and writes audit log", async () => {
    const { admin, day } = await makeDay("in_progress");
    await finishGameDay(day.id, admin.id);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("finished");
    const entries = await prisma.auditLog.findMany({
      where: { action: "game_day.finish", entityId: day.id },
    });
    expect(entries).toHaveLength(1);
  });

  it("throws GameDayAlreadyFinishedError on finished", async () => {
    const { admin, day } = await makeDay("finished");
    await expect(finishGameDay(day.id, admin.id)).rejects.toBeInstanceOf(
      GameDayAlreadyFinishedError,
    );
  });

  it("throws GameDayNotActiveError on planned", async () => {
    const { admin, day } = await makeDay("planned");
    await expect(finishGameDay(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotActiveError);
  });

  it("throws GameDayNotActiveError on roster_locked", async () => {
    const { admin, day } = await makeDay("roster_locked");
    await expect(finishGameDay(day.id, admin.id)).rejects.toBeInstanceOf(GameDayNotActiveError);
  });

  it("throws GameDayNotFoundError for unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    await expect(
      finishGameDay("00000000-0000-0000-0000-000000000000", admin.id),
    ).rejects.toBeInstanceOf(GameDayNotFoundError);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm vitest run tests/unit/game-day/finish.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 7: Implement `src/lib/game-day/finish.ts` (green)**

```ts
import { prisma } from "@/lib/db";
import { GameDayNotFoundError } from "./attendance";
import { GameDayNotActiveError } from "./add-extra-match";

export class GameDayAlreadyFinishedError extends Error {
  constructor(gameDayId: string) {
    super(`game day ${gameDayId} is already finished`);
    this.name = "GameDayAlreadyFinishedError";
  }
}

export async function finishGameDay(gameDayId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.findUnique({ where: { id: gameDayId } });
    if (!day) throw new GameDayNotFoundError(gameDayId);
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

- [ ] **Step 8: Run the unit test to verify it passes**

Run: `pnpm vitest run tests/unit/game-day/finish.test.ts`
Expected: PASS (5/5).

- [ ] **Step 9: Write the API integration test (red)**

Create `tests/integration/game-day-finish.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/game-days/[id]/finish/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup(status: "planned" | "roster_locked" | "in_progress" | "finished") {
  const admin = await prisma.player.create({
    data: { name: "A", email: `a-${status}@example.com`, passwordHash: "x", isAdmin: true },
  });
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const day = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status },
  });
  return { admin, day };
}

function postReq(id: string) {
  return new Request(`http://localhost/api/game-days/${id}/finish`, { method: "POST" });
}
async function call(id: string) {
  return POST(postReq(id), { params: Promise.resolve({ id }) });
}

describe("POST /api/game-days/[id]/finish", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 204 and flips in_progress to finished", async () => {
    const { admin, day } = await setup("in_progress");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(204);
    const after = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe("finished");
  });

  it("returns 409 when already finished", async () => {
    const { admin, day } = await setup("finished");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 409 when planned", async () => {
    const { admin, day } = await setup("planned");
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(409);
  });

  it("returns 403 for non-admin", async () => {
    const { day } = await setup("in_progress");
    const user = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: user.id, isAdmin: false, email: user.email, name: user.name },
    });
    const res = await call(day.id);
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown id", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@example.com", passwordHash: "x", isAdmin: true },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call("00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm vitest run tests/integration/game-day-finish.test.ts`
Expected: FAIL — route file missing.

- [ ] **Step 11: Implement `src/app/api/game-days/[id]/finish/route.ts` (green)**

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  finishGameDay,
  GameDayAlreadyFinishedError,
} from "@/lib/game-day/finish";
import { GameDayNotActiveError } from "@/lib/game-day/add-extra-match";
import { GameDayNotFoundError } from "@/lib/game-day/attendance";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  try {
    await finishGameDay(id, session.user.id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof GameDayNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof GameDayAlreadyFinishedError) {
      return NextResponse.json({ error: "already_finished" }, { status: 409 });
    }
    if (e instanceof GameDayNotActiveError) {
      return NextResponse.json({ error: "not_active" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 12: Run the integration tests to verify they pass**

Run: `pnpm vitest run tests/integration/game-day-finish.test.ts`
Expected: PASS (5/5).

- [ ] **Step 13: Create the banner component — `src/app/game-day/finish-banner.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddExtraMatchButton } from "./add-extra-match-button";

export function FinishBanner({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFinish() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/finish`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      setError("Abschließen fehlgeschlagen");
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary-soft p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-foreground">Alle Matches gewertet.</div>
        <div className="text-sm text-foreground-muted">
          Spieltag abschließen oder noch ein Zusatz-Match einplanen?
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onFinish} loading={loading} size="sm">
          Spieltag abschließen
        </Button>
        <AddExtraMatchButton gameDayId={gameDayId} label="Zusatz-Match hinzufügen" />
      </div>
      {error && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
```

If `bg-primary-soft` is not a valid Tailwind token in this project, fall back to `bg-surface-elevated`. Verify by checking `tailwind.config.*` or the existing classes in components like `Badge`.

- [ ] **Step 14: Wire the banner into `src/app/game-day/page.tsx`**

Add the import near the existing ones:

```ts
import { FinishBanner } from "./finish-banner";
```

After the matches `<section>` (and before the `day.status === "finished"` summary block), insert:

```tsx
      {(() => {
        const allScored =
          day.matches.length > 0 &&
          day.matches.every((m) => m.team1Score !== null && m.team2Score !== null);
        if (session.user.isAdmin && day.status === "in_progress" && allScored) {
          return <FinishBanner gameDayId={day.id} />;
        }
        return null;
      })()}
```

- [ ] **Step 15: Run the full suite**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: all green.

- [ ] **Step 16: Commit**

```bash
git add src/lib/match/enter-score.ts \
  src/lib/game-day/finish.ts \
  src/app/api/game-days/\[id\]/finish/route.ts \
  src/app/game-day/finish-banner.tsx \
  src/app/game-day/page.tsx \
  tests/integration/enter-score.test.ts \
  tests/unit/game-day/finish.test.ts \
  tests/integration/game-day-finish.test.ts
git commit -m "$(cat <<'EOF'
feat(game-day): manual finish replaces auto-advance on last score

- enterScore no longer flips status to finished
- finishGameDay lib + POST /api/game-days/[id]/finish
- Admin sees a banner when all matches scored in_progress
- enter-score tests updated to reflect the new contract

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final regression + commit-guard + PR

**Scene:** All code is in place. Run the full regression, ensure migrations are clean, then commit-guard + push + open PR.

- [ ] **Step 1: Full regression**

Run: `pnpm tsc --noEmit && pnpm vitest run && pnpm lint`
Expected: all green.

- [ ] **Step 2: Verify migrations apply cleanly on a fresh DB**

Run: `pnpm dlx prisma migrate reset --force --skip-seed && pnpm dlx prisma migrate deploy`
Expected: both new migrations apply without error.

(If the project uses a separate `TEST_DATABASE_URL`, substitute that.)

- [ ] **Step 3: Commit-guard on the staged diff — no staged diff at this point**

Run: `git status`
Expected: clean. No action needed here; commit-guard ran per-task via user-preferred agent flow.

- [ ] **Step 4: Push the branch**

Run: `git push -u origin feature/game-day-lifecycle`

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "feat(game-day): lifecycle — 3-step timeline, unique date, delete, extra match, manual finish" --body "$(cat <<'EOF'
## Summary

Bundle of five game-day lifecycle changes (PR-C in the spec):

- **C1** Timeline collapsed 4 → 3 steps (Geplant / Matches / Fertig). DB enum unchanged.
- **C2** `@@unique([seasonId, date])` — one game day per date. API returns `409 date_exists` on duplicate, admin form shows inline German message.
- **C3** Admin may hard-delete game days in `planned` or `roster_locked`. Cascade added for `JokerUse.gameDay`. Audit log entry survives the delete.
- **C4** Admin can append a "+ Zusatz-Match" during `roster_locked` / `in_progress`. Fresh seed per call; only confirmed participants.
- **C5** Auto-finish removed from `enterScore`. New manual `finishGameDay` lib + `POST /api/game-days/[id]/finish`. Banner nudges admins when all matches are scored.

Spec: `docs/superpowers/specs/2026-04-22-game-day-lifecycle-and-identity-design.md`.

## Migrations

1. `add_gameday_date_unique` — drops old non-unique index, adds unique.
2. `add_joker_gameday_cascade` — re-creates `JokerUse_gameDayId_fkey` with `ON DELETE CASCADE`.

Both are additive/non-destructive; no backfill needed.

## Test plan

- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm vitest run` all green (new suites: phase, delete, add-extra-match, finish, game-day-date-unique, game-day-delete, game-day-extra-match, game-day-finish; updated: enter-score)
- [ ] Smoke: create the same date twice → inline error
- [ ] Smoke: delete a planned day, then delete a roster_locked day
- [ ] Smoke: add an extra match during `in_progress`, verify it appears
- [ ] Smoke: score every match — status stays `in_progress`; banner appears for admin; clicking "Spieltag abschließen" flips to `finished`
- [ ] Smoke: non-admin sees neither delete, extra-match, nor finish controls

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Return the PR URL to the user.

---

## Done

- 5 user-visible features shipped behind 2 additive migrations
- 1 unit test file rewritten (phase); 3 new unit test files (delete, add-extra-match, finish)
- 4 new integration test files; 1 updated (enter-score)
- No backwards-compat shims, no feature flags, no dead code left
