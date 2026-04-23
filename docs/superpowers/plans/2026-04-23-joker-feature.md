# Joker Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players set or cancel a joker for the upcoming game day via a 3-way segmented toggle in DashboardHero, and give admins a per-row fallback in the participants roster to set or cancel a joker on a player's behalf — always with a PPG preview confirm dialog, persisted via new domain functions and API routes, and with the "Joker setzen" option disabled when the player has no jokers left.

**Architecture:** Extend `src/lib/joker/use.ts` with `JokerNotFoundError`, `cancelJokerUse`, `recordJokerUseAsAdmin`, and `cancelJokerUseAsAdmin` (all writing `AuditLog` entries); add `DELETE /api/jokers` and `POST|DELETE /api/game-days/[id]/participants/[playerId]/joker` routes (admin variant uses the same admin-check pattern as the existing participants PATCH route); reshape `HeroState["member"]` to carry `attendance: "pending"|"confirmed"|"declined"|"joker"` plus `jokersRemaining` and `ppgSnapshot`; redesign `DashboardHero` with a 3-button toggle + shared `<JokerConfirmDialog>`; widen `ParticipantAttendance` to include `"joker"` and add per-row joker controls in `ParticipantsRoster` that reuse the same dialog.

**Tech Stack:** Next.js 15 App Router (server components + `"use client"`), React 19, Prisma 6.19 + Postgres, Tailwind v4, `next-auth`, `zod`, Vitest + `@testing-library/react` + jsdom.

**Reference spec:** `docs/superpowers/specs/2026-04-23-joker-feature-design.md`

---

## File Structure

**Modify:**
- `src/lib/joker/use.ts` — add `JokerNotFoundError` + 3 new domain functions
- `src/app/api/jokers/route.ts` — add `DELETE` handler (self-cancel)
- `src/app/dashboard-hero.tsx` — remove time, add 3-way toggle + confirm dialog wiring
- `src/app/page.tsx` — supply `jokersRemaining`, `ppgSnapshot`, and `joker` in `attendance`
- `src/app/admin/participants-roster.tsx` — widen `ParticipantAttendance`, add joker badge + per-row controls
- `src/app/admin/page.tsx` — compute and pass per-player `jokersRemaining`
- `tests/integration/joker.test.ts` — extend with cancel/admin domain tests

**Create:**
- `src/app/api/game-days/[id]/participants/[playerId]/joker/route.ts` — admin POST/DELETE
- `src/components/joker-confirm-dialog.tsx` — shared confirm dialog
- `tests/integration/jokers-api.test.ts` — `DELETE /api/jokers` route tests
- `tests/integration/admin-jokers-api.test.ts` — admin joker route tests
- `tests/components/joker-confirm-dialog.test.tsx` — dialog component tests
- `tests/components/dashboard-hero.test.tsx` — hero + 3-way toggle tests
- `tests/components/participants-roster.test.tsx` — roster joker UI tests

**Path/convention corrections versus the spec:**
- Admin joker endpoint lives under `/api/game-days/[id]/participants/[playerId]/joker` (the codebase has no `/api/admin/...` namespace — admin endpoints sit on the normal path and gate with `session.user.isAdmin`, matching `src/app/api/game-days/[id]/participants/[playerId]/route.ts`).
- The admin roster is mounted from `src/app/admin/page.tsx` (no `/admin/spieltage/[id]` page exists).
- `gameDayParticipant` uses `attendance` + `respondedAt` (not `status` / `confirmedAt`) — cancel writes `attendance: "pending"` and bumps `respondedAt: new Date()` so the roster UI reflects the change.
- Audit action names stay consistent with existing `joker.use`: use `joker.cancel`, `joker.use.admin`, `joker.cancel.admin`.

---

## Pre-flight: Branch setup

- [ ] **Step 1: Create a feature branch off main**

Run:
```bash
git checkout main && git pull --ff-only && git checkout -b feature/joker-toggle
```
Expected: `Switched to a new branch 'feature/joker-toggle'`.

---

### Task 1: Domain — `JokerNotFoundError` + `cancelJokerUse`

**Files:**
- Modify: `src/lib/joker/use.ts`
- Modify test: `tests/integration/joker.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/joker.test.ts` (keep existing `describe("recordJokerUse", …)` block; add a second `describe` below it):

```ts
import { cancelJokerUse, JokerNotFoundError } from "@/lib/joker/use";

describe("cancelJokerUse", () => {
  beforeEach(resetDb);

  it("deletes the JokerUse, resets attendance to pending, and writes an audit log", async () => {
    const { player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });

    await cancelJokerUse({ playerId: player.id, gameDayId: gameDay.id });

    const uses = await prisma.jokerUse.count({ where: { playerId: player.id } });
    expect(uses).toBe(0);

    const part = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
    });
    expect(part.attendance).toBe("pending");

    const logs = await prisma.auditLog.findMany({
      where: { actorId: player.id, action: "joker.cancel" },
    });
    expect(logs).toHaveLength(1);
  });

  it("throws JokerLockedError when the game day is no longer planned", async () => {
    const { player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    await prisma.gameDay.update({
      where: { id: gameDay.id },
      data: { status: "roster_locked" },
    });
    await expect(
      cancelJokerUse({ playerId: player.id, gameDayId: gameDay.id }),
    ).rejects.toThrow(/locked/i);
  });

  it("throws JokerNotFoundError when no joker is set", async () => {
    const { player, gameDay } = await setup();
    await expect(
      cancelJokerUse({ playerId: player.id, gameDayId: gameDay.id }),
    ).rejects.toBeInstanceOf(JokerNotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/integration/joker.test.ts`
Expected: FAIL — `cancelJokerUse` / `JokerNotFoundError` are not exported from `@/lib/joker/use`.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Append to `src/lib/joker/use.ts`:

```ts
export class JokerNotFoundError extends Error {
  constructor(message = "No Joker set for this player on this game day") {
    super(message);
    this.name = "JokerNotFoundError";
  }
}

export async function cancelJokerUse(args: { playerId: string; gameDayId: string }) {
  const gameDay = await prisma.gameDay.findUniqueOrThrow({
    where: { id: args.gameDayId },
    select: { id: true, status: true, seasonId: true },
  });
  if (gameDay.status !== "planned") {
    throw new JokerLockedError();
  }

  const existing = await prisma.jokerUse.findUnique({
    where: {
      playerId_seasonId_gameDayId: {
        playerId: args.playerId,
        seasonId: gameDay.seasonId,
        gameDayId: args.gameDayId,
      },
    },
  });
  if (!existing) throw new JokerNotFoundError();

  return prisma.$transaction(async (tx) => {
    await tx.jokerUse.delete({ where: { id: existing.id } });
    await tx.gameDayParticipant.update({
      where: {
        gameDayId_playerId: { gameDayId: args.gameDayId, playerId: args.playerId },
      },
      data: { attendance: "pending", respondedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: args.playerId,
        action: "joker.cancel",
        entityType: "JokerUse",
        entityId: existing.id,
        payload: {
          gameDayId: args.gameDayId,
          ppgAtUse: existing.ppgAtUse.toString(),
          pointsCredited: existing.pointsCredited.toString(),
        },
      },
    });
  });
}
```

> Note: the Prisma composite unique key name comes from the existing `JokerUse` model — confirm with `grep -n "playerId_seasonId_gameDayId" prisma/schema.prisma` before running; if the generated accessor differs, use that name verbatim (e.g. `playerId_seasonId_gameDayId` vs. `JokerUse_playerId_seasonId_gameDayId_key`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/integration/joker.test.ts`
Expected: PASS — all three new `cancelJokerUse` tests green; existing `recordJokerUse` tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/joker/use.ts tests/integration/joker.test.ts
git commit -m "feat(joker): add cancelJokerUse + JokerNotFoundError"
```

---

### Task 2: Domain — `recordJokerUseAsAdmin`

**Files:**
- Modify: `src/lib/joker/use.ts`
- Modify test: `tests/integration/joker.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/joker.test.ts`:

```ts
import { recordJokerUseAsAdmin } from "@/lib/joker/use";

describe("recordJokerUseAsAdmin", () => {
  beforeEach(resetDb);

  it("records a JokerUse with actorId=admin and audit action joker.use.admin", async () => {
    const { player, gameDay } = await setup();
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", passwordHash: "x", isAdmin: true },
    });

    await recordJokerUseAsAdmin({
      actorId: admin.id,
      playerId: player.id,
      gameDayId: gameDay.id,
    });

    const use = await prisma.jokerUse.findFirstOrThrow({
      where: { playerId: player.id, gameDayId: gameDay.id },
    });
    expect(Number(use.gamesCredited)).toBe(JOKER_GAMES_CREDITED);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "joker.use.admin" },
    });
    expect(log.actorId).toBe(admin.id);
    expect((log.payload as { targetPlayerId: string }).targetPlayerId).toBe(player.id);
  });

  it("rejects when the cap is already reached", async () => {
    const { season, player, gameDay } = await setup();
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a2@x", passwordHash: "x", isAdmin: true },
    });
    for (let i = 0; i < MAX_JOKERS_PER_SEASON; i++) {
      const g = await prisma.gameDay.create({
        data: { seasonId: season.id, date: new Date(`2026-04-${22 + i}`) },
      });
      await prisma.gameDayParticipant.create({
        data: { gameDayId: g.id, playerId: player.id },
      });
      await recordJokerUse({ playerId: player.id, gameDayId: g.id });
    }
    await expect(
      recordJokerUseAsAdmin({ actorId: admin.id, playerId: player.id, gameDayId: gameDay.id }),
    ).rejects.toThrow(/max/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/integration/joker.test.ts`
Expected: FAIL — `recordJokerUseAsAdmin` not exported.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Refactor `src/lib/joker/use.ts` so both `recordJokerUse` and `recordJokerUseAsAdmin` share a single internal helper, then export the admin wrapper. Replace the existing `recordJokerUse` definition with:

```ts
async function recordJokerUseInternal(args: {
  actorId: string;
  playerId: string;
  gameDayId: string;
  auditAction: "joker.use" | "joker.use.admin";
}) {
  const gameDay = await prisma.gameDay.findUniqueOrThrow({
    where: { id: args.gameDayId },
    include: { season: true },
  });
  if (gameDay.status !== "planned") throw new JokerLockedError();

  const existing = await prisma.jokerUse.count({
    where: { playerId: args.playerId, seasonId: gameDay.seasonId },
  });
  if (existing >= MAX_JOKERS_PER_SEASON) throw new JokerCapExceededError();

  const ppg = await snapshotPpg(args.playerId, gameDay.seasonId);
  const points = ppg * JOKER_GAMES_CREDITED;

  return prisma.$transaction(async (tx) => {
    const use = await tx.jokerUse.create({
      data: {
        playerId: args.playerId,
        seasonId: gameDay.seasonId,
        gameDayId: args.gameDayId,
        ppgAtUse: ppg.toFixed(3),
        gamesCredited: JOKER_GAMES_CREDITED,
        pointsCredited: points.toFixed(2),
      },
    });
    await tx.gameDayParticipant.update({
      where: {
        gameDayId_playerId: { gameDayId: args.gameDayId, playerId: args.playerId },
      },
      data: { attendance: "joker", respondedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: args.auditAction,
        entityType: "JokerUse",
        entityId: use.id,
        payload: {
          ppg,
          points,
          gameDayId: args.gameDayId,
          targetPlayerId: args.playerId,
        },
      },
    });
    return use;
  });
}

export async function recordJokerUse(args: { playerId: string; gameDayId: string }) {
  return recordJokerUseInternal({
    actorId: args.playerId,
    playerId: args.playerId,
    gameDayId: args.gameDayId,
    auditAction: "joker.use",
  });
}

export async function recordJokerUseAsAdmin(args: {
  actorId: string;
  playerId: string;
  gameDayId: string;
}) {
  return recordJokerUseInternal({ ...args, auditAction: "joker.use.admin" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/integration/joker.test.ts`
Expected: PASS — existing `recordJokerUse` tests still green (the `payload.targetPlayerId` addition is backward-compatible), new `recordJokerUseAsAdmin` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/joker/use.ts tests/integration/joker.test.ts
git commit -m "feat(joker): add recordJokerUseAsAdmin via shared internal helper"
```

---

### Task 3: Domain — `cancelJokerUseAsAdmin`

**Files:**
- Modify: `src/lib/joker/use.ts`
- Modify test: `tests/integration/joker.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/integration/joker.test.ts`:

```ts
import { cancelJokerUseAsAdmin } from "@/lib/joker/use";

describe("cancelJokerUseAsAdmin", () => {
  beforeEach(resetDb);

  it("cancels the joker and writes audit action joker.cancel.admin", async () => {
    const { player, gameDay } = await setup();
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "ac@x", passwordHash: "x", isAdmin: true },
    });
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });

    await cancelJokerUseAsAdmin({
      actorId: admin.id,
      playerId: player.id,
      gameDayId: gameDay.id,
    });

    const uses = await prisma.jokerUse.count({ where: { playerId: player.id } });
    expect(uses).toBe(0);
    const part = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
    });
    expect(part.attendance).toBe("pending");
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "joker.cancel.admin" },
    });
    expect(log.actorId).toBe(admin.id);
    expect((log.payload as { targetPlayerId: string }).targetPlayerId).toBe(player.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/integration/joker.test.ts`
Expected: FAIL — `cancelJokerUseAsAdmin` not exported.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Refactor `cancelJokerUse` into a shared internal helper and add the admin wrapper. Replace the `cancelJokerUse` function added in Task 1 with:

```ts
async function cancelJokerUseInternal(args: {
  actorId: string;
  playerId: string;
  gameDayId: string;
  auditAction: "joker.cancel" | "joker.cancel.admin";
}) {
  const gameDay = await prisma.gameDay.findUniqueOrThrow({
    where: { id: args.gameDayId },
    select: { id: true, status: true, seasonId: true },
  });
  if (gameDay.status !== "planned") throw new JokerLockedError();

  const existing = await prisma.jokerUse.findUnique({
    where: {
      playerId_seasonId_gameDayId: {
        playerId: args.playerId,
        seasonId: gameDay.seasonId,
        gameDayId: args.gameDayId,
      },
    },
  });
  if (!existing) throw new JokerNotFoundError();

  return prisma.$transaction(async (tx) => {
    await tx.jokerUse.delete({ where: { id: existing.id } });
    await tx.gameDayParticipant.update({
      where: {
        gameDayId_playerId: { gameDayId: args.gameDayId, playerId: args.playerId },
      },
      data: { attendance: "pending", respondedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: args.auditAction,
        entityType: "JokerUse",
        entityId: existing.id,
        payload: {
          gameDayId: args.gameDayId,
          targetPlayerId: args.playerId,
          ppgAtUse: existing.ppgAtUse.toString(),
          pointsCredited: existing.pointsCredited.toString(),
        },
      },
    });
  });
}

export async function cancelJokerUse(args: { playerId: string; gameDayId: string }) {
  return cancelJokerUseInternal({
    actorId: args.playerId,
    playerId: args.playerId,
    gameDayId: args.gameDayId,
    auditAction: "joker.cancel",
  });
}

export async function cancelJokerUseAsAdmin(args: {
  actorId: string;
  playerId: string;
  gameDayId: string;
}) {
  return cancelJokerUseInternal({ ...args, auditAction: "joker.cancel.admin" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/integration/joker.test.ts`
Expected: PASS — all five describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/joker/use.ts tests/integration/joker.test.ts
git commit -m "feat(joker): add cancelJokerUseAsAdmin via shared internal helper"
```

---

### Task 4: API — `DELETE /api/jokers` (self-cancel)

**Files:**
- Modify: `src/app/api/jokers/route.ts`
- Create test: `tests/integration/jokers-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/jokers-api.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DELETE } from "@/app/api/jokers/route";
import { recordJokerUse } from "@/lib/joker/use";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const player = await prisma.player.create({
    data: { name: "P", email: "p@x", passwordHash: "x" },
  });
  const gameDay = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
  });
  await prisma.gameDayParticipant.create({
    data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
  });
  return { season, player, gameDay };
}

function req(body: unknown) {
  return new Request("http://localhost/api/jokers", {
    method: "DELETE",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("DELETE /api/jokers", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    const { gameDay } = await setup();
    authMock.mockResolvedValue(null);
    const res = await DELETE(req({ gameDayId: gameDay.id }));
    expect(res.status).toBe(401);
  });

  it("returns 204 and clears the joker on success", async () => {
    const { player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await DELETE(req({ gameDayId: gameDay.id }));
    expect(res.status).toBe(204);
    expect(await prisma.jokerUse.count()).toBe(0);
  });

  it("returns 409 JOKER_NOT_FOUND when no joker is set", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await DELETE(req({ gameDayId: gameDay.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_NOT_FOUND" });
  });

  it("returns 409 JOKER_LOCKED when the day is no longer planned", async () => {
    const { player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    await prisma.gameDay.update({ where: { id: gameDay.id }, data: { status: "roster_locked" } });
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await DELETE(req({ gameDayId: gameDay.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_LOCKED" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/integration/jokers-api.test.ts`
Expected: FAIL — `DELETE` not exported from `@/app/api/jokers/route`.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Replace `src/app/api/jokers/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  recordJokerUse,
  cancelJokerUse,
  JokerLockedError,
  JokerCapExceededError,
  JokerNotFoundError,
} from "@/lib/joker/use";

const Schema = z.object({ gameDayId: z.string().uuid() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const jokerUse = await recordJokerUse({
      playerId: session.user.id,
      gameDayId: body.data.gameDayId,
    });
    return NextResponse.json({ jokerUse }, { status: 201 });
  } catch (err) {
    if (err instanceof JokerLockedError) {
      return NextResponse.json({ code: "JOKER_LOCKED" }, { status: 409 });
    }
    if (err instanceof JokerCapExceededError) {
      return NextResponse.json({ code: "JOKER_CAP_EXCEEDED" }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    await cancelJokerUse({
      playerId: session.user.id,
      gameDayId: body.data.gameDayId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof JokerLockedError) {
      return NextResponse.json({ code: "JOKER_LOCKED" }, { status: 409 });
    }
    if (err instanceof JokerNotFoundError) {
      return NextResponse.json({ code: "JOKER_NOT_FOUND" }, { status: 409 });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/integration/jokers-api.test.ts`
Expected: PASS — all four cases green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/jokers/route.ts tests/integration/jokers-api.test.ts
git commit -m "feat(api): add DELETE /api/jokers + structured error codes on POST"
```

---

### Task 5: API — admin POST/DELETE at `/api/game-days/[id]/participants/[playerId]/joker`

**Files:**
- Create: `src/app/api/game-days/[id]/participants/[playerId]/joker/route.ts`
- Create test: `tests/integration/admin-jokers-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/admin-jokers-api.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST, DELETE } from "@/app/api/game-days/[id]/participants/[playerId]/joker/route";
import { recordJokerUse } from "@/lib/joker/use";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function setup() {
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const admin = await prisma.player.create({
    data: { name: "Admin", email: "a@x", passwordHash: "x", isAdmin: true },
  });
  const player = await prisma.player.create({
    data: { name: "P", email: "p@x", passwordHash: "x" },
  });
  const gameDay = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
  });
  await prisma.gameDayParticipant.create({
    data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
  });
  return { season, admin, player, gameDay };
}

function buildReq(method: "POST" | "DELETE", gameDayId: string, playerId: string) {
  return new Request(
    `http://localhost/api/game-days/${gameDayId}/participants/${playerId}/joker`,
    { method },
  );
}

describe("/api/game-days/[id]/participants/[playerId]/joker", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("POST returns 401 when unauthenticated", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue(null);
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(401);
  });

  it("POST returns 403 for non-admin", async () => {
    const { player, gameDay } = await setup();
    authMock.mockResolvedValue({
      user: { id: player.id, isAdmin: false, email: player.email, name: player.name },
    });
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(403);
  });

  it("POST returns 201 and sets attendance=joker", async () => {
    const { admin, player, gameDay } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await POST(buildReq("POST", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(201);
    const part = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
    });
    expect(part.attendance).toBe("joker");
  });

  it("DELETE returns 204 and clears the joker", async () => {
    const { admin, player, gameDay } = await setup();
    await recordJokerUse({ playerId: player.id, gameDayId: gameDay.id });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await DELETE(buildReq("DELETE", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(204);
    expect(await prisma.jokerUse.count()).toBe(0);
  });

  it("DELETE returns 409 JOKER_NOT_FOUND when nothing to cancel", async () => {
    const { admin, player, gameDay } = await setup();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await DELETE(buildReq("DELETE", gameDay.id, player.id), {
      params: Promise.resolve({ id: gameDay.id, playerId: player.id }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: "JOKER_NOT_FOUND" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/integration/admin-jokers-api.test.ts`
Expected: FAIL — the route file does not exist.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Create `src/app/api/game-days/[id]/participants/[playerId]/joker/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  recordJokerUseAsAdmin,
  cancelJokerUseAsAdmin,
  JokerLockedError,
  JokerCapExceededError,
  JokerNotFoundError,
} from "@/lib/joker/use";

type Params = { params: Promise<{ id: string; playerId: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (!session.user.isAdmin) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}

export async function POST(_req: Request, ctx: Params) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const { id, playerId } = await ctx.params;

  try {
    await recordJokerUseAsAdmin({ actorId: session!.user.id, playerId, gameDayId: id });
    return new NextResponse(null, { status: 201 });
  } catch (err) {
    if (err instanceof JokerLockedError) return NextResponse.json({ code: "JOKER_LOCKED" }, { status: 409 });
    if (err instanceof JokerCapExceededError) return NextResponse.json({ code: "JOKER_CAP_EXCEEDED" }, { status: 409 });
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Params) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  const { id, playerId } = await ctx.params;

  try {
    await cancelJokerUseAsAdmin({ actorId: session!.user.id, playerId, gameDayId: id });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof JokerLockedError) return NextResponse.json({ code: "JOKER_LOCKED" }, { status: 409 });
    if (err instanceof JokerNotFoundError) return NextResponse.json({ code: "JOKER_NOT_FOUND" }, { status: 409 });
    throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/integration/admin-jokers-api.test.ts`
Expected: PASS — all five cases green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/game-days/[id]/participants/[playerId]/joker/route.ts tests/integration/admin-jokers-api.test.ts
git commit -m "feat(api): admin POST/DELETE joker on participant"
```

---

### Task 6: Component — `<JokerConfirmDialog>`

**Files:**
- Create: `src/components/joker-confirm-dialog.tsx`
- Create test: `tests/components/joker-confirm-dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/joker-confirm-dialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { JokerConfirmDialog } from "@/components/joker-confirm-dialog";

describe("<JokerConfirmDialog>", () => {
  it("renders the 1-of-2 wording when two jokers are remaining", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={2}
        ppgSnapshot={1.64}
      />,
    );
    expect(screen.getByText(/1\. von 2 Jokern/)).toBeInTheDocument();
    expect(screen.getByText(/1,64/)).toBeInTheDocument();
    expect(screen.getByText(/16,4 Punkte/)).toBeInTheDocument();
  });

  it("renders the 2-of-2 wording when one joker is remaining", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={1}
        ppgSnapshot={1.64}
      />,
    );
    expect(screen.getByText(/2\. von 2 Jokern/)).toBeInTheDocument();
  });

  it("renders the PPG fallback when the snapshot is null", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={2}
        ppgSnapshot={null}
      />,
    );
    expect(screen.getByText(/Bisher keine Statistik/)).toBeInTheDocument();
  });

  it("includes an optional target player name in the title when provided", () => {
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={() => {}}
        jokersRemaining={2}
        ppgSnapshot={1.5}
        targetName="Werner"
      />,
    );
    expect(screen.getByRole("dialog", { name: /Werner/ })).toBeInTheDocument();
  });

  it("calls onConfirm when the primary button is clicked", async () => {
    const onConfirm = vi.fn();
    render(
      <JokerConfirmDialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        jokersRemaining={2}
        ppgSnapshot={1.5}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Joker setzen/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/components/joker-confirm-dialog.test.tsx`
Expected: FAIL — `@/components/joker-confirm-dialog` cannot be resolved.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Create `src/components/joker-confirm-dialog.tsx`:

```tsx
"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface JokerConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  jokersRemaining: number;
  ppgSnapshot: number | null;
  loading?: boolean;
  targetName?: string;
}

function formatDe(value: number, digits: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function JokerConfirmDialog({
  open,
  onClose,
  onConfirm,
  jokersRemaining,
  ppgSnapshot,
  loading = false,
  targetName,
}: JokerConfirmDialogProps) {
  const nth = 2 - jokersRemaining + 1;
  const title = targetName ? `Joker für ${targetName} setzen?` : "Joker einsetzen?";

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-3 text-sm text-foreground">
        <p>
          {targetName ? `${targetName} setzt` : "Du setzt"} den{" "}
          <strong>{nth}. von 2 Jokern</strong> ein.
        </p>
        {ppgSnapshot !== null ? (
          <p>
            Aktuelle PPG: <strong>{formatDe(ppgSnapshot, 2)}</strong> → gutgeschrieben werden{" "}
            <strong>10 × {formatDe(ppgSnapshot, 2)} ≈ {formatDe(ppgSnapshot * 10, 1)} Punkte</strong>.
          </p>
        ) : (
          <p>Bisher keine Statistik — die PPG wird beim Setzen des Jokers festgeschrieben.</p>
        )}
        <p className="text-foreground-muted">
          Der Joker kann bis zum Beginn des Spieltags wieder entfernt werden.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm} loading={loading}>
            Joker setzen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/components/joker-confirm-dialog.test.tsx`
Expected: PASS — all five cases green.

- [ ] **Step 5: Commit**

```bash
git add src/components/joker-confirm-dialog.tsx tests/components/joker-confirm-dialog.test.tsx
git commit -m "feat(ui): add JokerConfirmDialog with PPG preview"
```

---

### Task 7: DashboardHero redesign — 3-way toggle + confirm dialog + remove time

**Files:**
- Modify: `src/app/dashboard-hero.tsx`
- Create test: `tests/components/dashboard-hero.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/dashboard-hero.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DashboardHero, type HeroState } from "@/app/dashboard-hero";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function member(overrides: Partial<Extract<HeroState, { kind: "member" }>> = {}): HeroState {
  return {
    kind: "member",
    gameDayId: "gd-1",
    date: "2026-04-30T18:00:00.000Z",
    confirmed: 3,
    total: 6,
    attendance: "pending",
    jokersRemaining: 2,
    ppgSnapshot: 1.64,
    ...overrides,
  };
}

describe("<DashboardHero> (member)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204 }));
  });

  it("renders three toggle buttons labelled Dabei sein / Nicht dabei / Joker setzen", () => {
    render(<DashboardHero state={member()} />);
    expect(screen.getByRole("button", { name: "Dabei sein" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nicht dabei" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Joker setzen" })).toBeInTheDocument();
  });

  it("marks the active choice with aria-pressed=true", () => {
    render(<DashboardHero state={member({ attendance: "confirmed" })} />);
    expect(screen.getByRole("button", { name: "Dabei sein" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Nicht dabei" })).toHaveAttribute("aria-pressed", "false");
  });

  it("disables Joker setzen when no jokers are remaining and shows helper text", () => {
    render(<DashboardHero state={member({ jokersRemaining: 0 })} />);
    expect(screen.getByRole("button", { name: "Joker setzen" })).toBeDisabled();
    expect(screen.getByText(/Keine Joker mehr in dieser Saison/)).toBeInTheDocument();
  });

  it("opens the confirm dialog when Joker setzen is clicked", async () => {
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Joker setzen" }));
    expect(await screen.findByRole("dialog", { name: /Joker einsetzen/ })).toBeInTheDocument();
  });

  it("POSTs /api/jokers after confirming the dialog", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchSpy);
    render(<DashboardHero state={member()} />);
    await userEvent.click(screen.getByRole("button", { name: "Joker setzen" }));
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Joker setzen" }))[1],
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/jokers");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ gameDayId: "gd-1" });
  });

  it("DELETEs /api/jokers then POSTs attendance when switching away from joker", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchSpy);
    render(<DashboardHero state={member({ attendance: "joker" })} />);
    await userEvent.click(screen.getByRole("button", { name: "Dabei sein" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/jokers");
    expect(fetchSpy.mock.calls[0][1].method).toBe("DELETE");
    expect(fetchSpy.mock.calls[1][0]).toBe("/api/game-days/gd-1/attendance");
    expect(fetchSpy.mock.calls[1][1].method).toBe("POST");
  });

  it("does not render the time in the header", () => {
    render(<DashboardHero state={member()} />);
    expect(screen.queryByText(/^\d{2}:\d{2}$/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/components/dashboard-hero.test.tsx`
Expected: FAIL — the new `HeroState` fields (`jokersRemaining`, `ppgSnapshot`, `"joker"` attendance) and toggle UI do not exist yet.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

Replace `src/app/dashboard-hero.tsx` with:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JokerConfirmDialog } from "@/components/joker-confirm-dialog";

export type HeroState =
  | {
      kind: "not-member";
      gameDayId: string;
      date: string;
      confirmed: number;
      total: number;
    }
  | {
      kind: "member";
      gameDayId: string;
      date: string;
      confirmed: number;
      total: number;
      attendance: "pending" | "confirmed" | "declined" | "joker";
      jokersRemaining: number;
      ppgSnapshot: number | null;
    };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

type ErrorCode = "JOKER_LOCKED" | "JOKER_CAP_EXCEEDED" | "JOKER_NOT_FOUND";
const ERROR_MESSAGES: Record<ErrorCode, string> = {
  JOKER_LOCKED: "Spieltag ist bereits gestartet — Änderungen nicht mehr möglich.",
  JOKER_CAP_EXCEEDED: "Du hast deine 2 Joker dieser Saison bereits verbraucht.",
  JOKER_NOT_FOUND: "Joker war nicht gesetzt.",
};

export function DashboardHero({ state }: { state: HeroState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    if (state.kind !== "not-member") return;
    setBusy(true);
    const res = await fetch(`/api/game-days/${state.gameDayId}/join`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function postAttendance(next: "confirmed" | "declined" | "pending"): Promise<boolean> {
    const res = await fetch(`/api/game-days/${state.gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    return res.ok;
  }

  async function deleteJoker(): Promise<boolean> {
    const res = await fetch("/api/jokers", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameDayId: state.gameDayId }),
    });
    if (res.ok) return true;
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { code?: ErrorCode } | null;
      if (body?.code) setError(ERROR_MESSAGES[body.code]);
    }
    return false;
  }

  async function postJoker(): Promise<boolean> {
    const res = await fetch("/api/jokers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameDayId: state.gameDayId }),
    });
    if (res.ok) return true;
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as { code?: ErrorCode } | null;
      if (body?.code) setError(ERROR_MESSAGES[body.code]);
    }
    return false;
  }

  async function handleChoose(next: "confirmed" | "declined") {
    if (state.kind !== "member") return;
    setBusy(true);
    setError(null);
    if (state.attendance === "joker") {
      const cleared = await deleteJoker();
      if (!cleared) {
        setBusy(false);
        return;
      }
    }
    const ok = await postAttendance(next);
    setBusy(false);
    if (ok) router.refresh();
  }

  async function handleConfirmJoker() {
    if (state.kind !== "member") return;
    setBusy(true);
    setError(null);
    const ok = await postJoker();
    setBusy(false);
    setDialogOpen(false);
    if (ok) router.refresh();
  }

  return (
    <div className="rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] p-5 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)]">
      <div className="flex items-center">
        <Badge variant="primary">Nächster Spieltag</Badge>
      </div>
      <div className="mt-2 text-xl font-extrabold text-foreground">{formatDate(state.date)}</div>
      <div className="mt-1">
        <span className="text-[0.7rem] font-semibold text-primary-strong">
          {state.confirmed} / {state.total} bestätigt
        </span>
      </div>
      {state.kind === "not-member" ? (
        <Button className="mt-3 w-full" disabled={busy} onClick={join}>
          Teilnehmen
        </Button>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button
              variant={state.attendance === "confirmed" ? "primary" : "ghost"}
              aria-pressed={state.attendance === "confirmed"}
              disabled={busy}
              onClick={() => handleChoose("confirmed")}
            >
              Dabei sein
            </Button>
            <Button
              variant={state.attendance === "declined" ? "primary" : "ghost"}
              aria-pressed={state.attendance === "declined"}
              disabled={busy}
              onClick={() => handleChoose("declined")}
            >
              Nicht dabei
            </Button>
            <Button
              variant={state.attendance === "joker" ? "primary" : "ghost"}
              aria-pressed={state.attendance === "joker"}
              disabled={busy || state.jokersRemaining === 0 || state.attendance === "joker"}
              onClick={() => setDialogOpen(true)}
            >
              Joker setzen
            </Button>
          </div>
          {state.jokersRemaining === 0 && (
            <p className="mt-2 text-xs text-foreground-muted">
              Keine Joker mehr in dieser Saison
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <JokerConfirmDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            onConfirm={handleConfirmJoker}
            jokersRemaining={state.jokersRemaining}
            ppgSnapshot={state.ppgSnapshot}
            loading={busy}
          />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/components/dashboard-hero.test.tsx`
Expected: PASS — all seven cases green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard-hero.tsx tests/components/dashboard-hero.test.tsx
git commit -m "feat(ui): 3-way dashboard-hero toggle with joker confirm dialog"
```

---

### Task 8: Wire `jokersRemaining`, `ppgSnapshot`, and `attendance: "joker"` in `src/app/page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

This task has no dedicated unit test (the page is a server component); verify manually via `pnpm dev` after TypeScript passes. The task only reshapes data already available from `computePlayerSeasonStats`.

- [ ] **Step 1: Build a PPG snapshot helper**

Open `src/app/page.tsx`. At the top-level (above `DashboardPage`), add:

```ts
function ppgFromStats(stats: { winRate: { matches: number } }, myRow: { pointsPerGame: number } | undefined): number | null {
  if (!myRow || stats.winRate.matches === 0) return null;
  return myRow.pointsPerGame;
}
```

- [ ] **Step 2: Reshape the `heroState` branch for members**

Inside `DashboardPage`, replace the existing member branch (the `if (!meParticipant) { … } else { … }` block) with:

```ts
    if (!meParticipant) {
      heroState = { kind: "not-member", gameDayId: plannedDay.id, date, confirmed, total };
    } else {
      const attendance =
        meParticipant.attendance === "confirmed" ||
        meParticipant.attendance === "declined" ||
        meParticipant.attendance === "joker"
          ? meParticipant.attendance
          : "pending";
      heroState = {
        kind: "member",
        gameDayId: plannedDay.id,
        date,
        confirmed,
        total,
        attendance,
        jokersRemaining: stats.jokers.remaining,
        ppgSnapshot: ppgFromStats(stats, myRow),
      };
    }
```

Also remove the now-unused `time` and `formatTime` references in this file: delete the `const time = …` line above `const meParticipant = …` and delete the `formatTime` helper at the top of the file (it had a single call site, which is now gone).

- [ ] **Step 3: Also drop `time` from the `not-member` branch**

The replacement above already does this — double-check there is no remaining reference to `time:` in the file:

Run: `grep -n "time[:,]" src/app/page.tsx`
Expected: no output (or only unrelated lines).

- [ ] **Step 4: Run the type checker and full test suite**

Run: `pnpm next build --no-lint 2>&1 | tail -30`
Expected: build succeeds. If TypeScript flags a missing property, re-read the `HeroState` definition from Task 7 and align the call site.

Run: `pnpm test`
Expected: all tests green (domain + API + components).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(dashboard): pass jokersRemaining + ppgSnapshot into hero state"
```

---

### Task 9: ParticipantsRoster — accept `"joker"` attendance and render a badge

**Files:**
- Modify: `src/app/admin/participants-roster.tsx`
- Modify: `src/app/admin/page.tsx`
- Create test: `tests/components/participants-roster.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/participants-roster.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ParticipantsRoster, type RosterRow } from "@/app/admin/participants-roster";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function row(overrides: Partial<RosterRow> = {}): RosterRow {
  return {
    playerId: "p1",
    name: "Werner",
    attendance: "pending",
    jokersRemaining: 2,
    ...overrides,
  };
}

describe("<ParticipantsRoster>", () => {
  it("renders a Joker badge when the player's attendance is joker", () => {
    render(<ParticipantsRoster gameDayId="gd-1" participants={[row({ attendance: "joker" })]} />);
    expect(screen.getByText("Joker")).toBeInTheDocument();
  });

  it("pool rows without a joker and with jokers remaining show a set-joker button", () => {
    render(<ParticipantsRoster gameDayId="gd-1" participants={[row()]} />);
    expect(screen.getByRole("button", { name: /Joker für Werner setzen/ })).toBeInTheDocument();
  });

  it("pool rows with no jokers remaining show a disabled 'Keine Joker übrig' button", () => {
    render(
      <ParticipantsRoster
        gameDayId="gd-1"
        participants={[row({ jokersRemaining: 0 })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Keine Joker übrig/ })).toBeDisabled();
  });

  it("joker rows show a remove-joker button", () => {
    render(
      <ParticipantsRoster
        gameDayId="gd-1"
        participants={[row({ attendance: "joker" })]}
      />,
    );
    expect(screen.getByRole("button", { name: /Joker entfernen/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/components/participants-roster.test.tsx`
Expected: FAIL — `jokersRemaining` is not a known prop; the joker badge and buttons do not exist yet.

- [ ] **Step 3: Widen the type + render the badge**

In `src/app/admin/participants-roster.tsx`:

1. Change the attendance union:

```ts
export type ParticipantAttendance = "pending" | "confirmed" | "declined" | "joker";
```

2. Extend `RosterRow`:

```ts
export interface RosterRow {
  playerId: string;
  name: string;
  attendance: ParticipantAttendance;
  jokersRemaining: number;
}
```

3. In `PlayerCard`, render a badge immediately after the name when `row.attendance === "joker"`:

```tsx
<span className="flex-1 text-sm font-medium text-foreground">
  {row.name}
  {row.attendance === "joker" && (
    <span className="ml-2 rounded-full border border-primary/50 bg-primary-soft px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-primary-strong">
      Joker
    </span>
  )}
</span>
```

4. Update the `toRoster` / `zoneLabel` logic so a joker row is treated the same as a confirmed row for drag semantics (keeps existing pool/roster split intact):

```tsx
const isAttending = row.attendance === "confirmed" || row.attendance === "joker";
const toRoster = !isAttending;
const zoneLabel = isAttending ? "Dabei" : "Pool";
```

5. Update the pool/roster filters at the bottom of `ParticipantsRoster`:

```tsx
const pool = local.filter((r) => r.attendance !== "confirmed" && r.attendance !== "joker");
const roster = local.filter((r) => r.attendance === "confirmed" || r.attendance === "joker");
```

6. Update the drag-end zone logic so dragging a `joker` row into the pool uses the admin joker-cancel API instead of the attendance PATCH — for this task, keep it simple: disallow drag-out for joker rows (real cancel flow is in Task 10). Change:

```ts
} else if (zone === POOL && row.attendance === "confirmed") {
  void patch(playerId, "pending");
}
```

to:

```ts
} else if (zone === POOL && row.attendance === "confirmed") {
  void patch(playerId, "pending");
}
// intentionally no drag-cancel for joker: admin must click the explicit "Joker entfernen" button
```

7. Add a per-row joker control block inside `PlayerCard`, to the right of the existing arrow button:

```tsx
{row.attendance === "joker" ? (
  <button
    type="button"
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onCancelJoker();
    }}
    className="ml-2 inline-flex h-8 items-center rounded-lg border border-border-strong px-2 text-xs font-semibold text-foreground hover:bg-surface-muted"
  >
    Joker entfernen
  </button>
) : row.jokersRemaining > 0 ? (
  <button
    type="button"
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => {
      e.stopPropagation();
      onSetJoker();
    }}
    className="ml-2 inline-flex h-8 items-center rounded-lg border border-border-strong px-2 text-xs font-semibold text-foreground hover:bg-surface-muted"
  >
    Joker für {row.name} setzen
  </button>
) : (
  <button
    type="button"
    disabled
    className="ml-2 inline-flex h-8 items-center rounded-lg border border-border px-2 text-xs font-semibold text-foreground-muted opacity-60"
  >
    Keine Joker übrig
  </button>
)}
```

Accept the two new handlers by updating the `PlayerCard` signature:

```tsx
function PlayerCard({
  row,
  dimmed,
  onMove,
  onSetJoker,
  onCancelJoker,
}: {
  row: RosterRow;
  dimmed: boolean;
  onMove: () => void;
  onSetJoker: () => void;
  onCancelJoker: () => void;
}) { … }
```

Wire no-op stubs in `ParticipantsRoster` for now (real calls land in Task 10):

```tsx
<PlayerCard
  key={r.playerId}
  row={r}
  dimmed={pendingIds.has(r.playerId)}
  onMove={() => patch(r.playerId, "confirmed")}
  onSetJoker={() => {}}
  onCancelJoker={() => {}}
/>
```

(Do the same wiring in the `roster` branch.)

8. Update `src/app/admin/page.tsx`:

Replace the `buildRosterRows` function with a version that accepts per-player joker counts:

```ts
function buildRosterRows(
  participants: ParticipantWithPlayer[],
  activePlayers: { id: string; name: string }[],
  jokersRemainingByPlayer: Map<string, number>,
): RosterRow[] {
  const byId = new Map(participants.map((p) => [p.playerId, p]));
  return activePlayers
    .map((player) => {
      const participant = byId.get(player.id);
      const attendance: ParticipantAttendance =
        participant?.attendance === "confirmed" ||
        participant?.attendance === "declined" ||
        participant?.attendance === "joker"
          ? participant.attendance
          : "pending";
      return {
        playerId: player.id,
        name: player.name,
        attendance,
        jokersRemaining: jokersRemainingByPlayer.get(player.id) ?? 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
```

Also widen `ParticipantWithPlayer`:

```ts
type ParticipantWithPlayer = {
  playerId: string;
  attendance: ParticipantAttendance;
  player: { id: string; name: string };
};
```

(No `| "joker"` needed any more — it's part of `ParticipantAttendance` now.)

Before the `return` block, compute the remaining-jokers map. Add these two loads to the parallel `Promise.all` (just above the existing `playersForUi` line, inside `AdminPage`):

```ts
const season = await prisma.season.findFirstOrThrow({ where: { isActive: true }, select: { id: true } });
const jokerCounts = await prisma.jokerUse.groupBy({
  by: ["playerId"],
  where: { seasonId: season.id },
  _count: { _all: true },
});
const MAX_JOKERS = 2;
const jokersRemaining = new Map<string, number>(
  players.map((p) => {
    const used = jokerCounts.find((j) => j.playerId === p.id)?._count._all ?? 0;
    return [p.id, Math.max(0, MAX_JOKERS - used)];
  }),
);
```

Then change the `<ParticipantsRoster …>` call site to:

```tsx
<ParticipantsRoster
  gameDayId={manageableDay.id}
  participants={buildRosterRows(manageableDay.participants, players, jokersRemaining)}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/components/participants-roster.test.tsx`
Expected: PASS — all four cases green.

Run: `pnpm test`
Expected: entire suite green.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/participants-roster.tsx src/app/admin/page.tsx tests/components/participants-roster.test.tsx
git commit -m "feat(admin): roster joker badge + per-row controls (stub handlers)"
```

---

### Task 10: ParticipantsRoster — wire set/cancel handlers to the admin joker API via the confirm dialog

**Files:**
- Modify: `src/app/admin/participants-roster.tsx`
- Modify test: `tests/components/participants-roster.test.tsx`

- [ ] **Step 1: Extend the test to cover the API calls**

Append to `tests/components/participants-roster.test.tsx`:

```tsx
import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";
import { beforeEach } from "vitest";

describe("<ParticipantsRoster> admin joker actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("opens the confirm dialog and POSTs the admin joker route on confirm", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    vi.stubGlobal("fetch", fetchSpy);
    render(<ParticipantsRoster gameDayId="gd-1" participants={[row()]} />);
    await userEvent.click(screen.getByRole("button", { name: /Joker für Werner setzen/ }));
    expect(await screen.findByRole("dialog", { name: /Joker für Werner setzen/ })).toBeInTheDocument();
    await userEvent.click(
      (await screen.findAllByRole("button", { name: "Joker setzen" }))[0],
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/game-days/gd-1/participants/p1/joker");
    expect(init.method).toBe("POST");
  });

  it("DELETEs the admin joker route when 'Joker entfernen' is confirmed", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <ParticipantsRoster
        gameDayId="gd-1"
        participants={[row({ attendance: "joker" })]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Joker entfernen/ }));
    // The cancel confirm is a simple confirm (no PPG preview) — an inline
    // destructive button inside the same dialog component suffices.
    await userEvent.click(screen.getByRole("button", { name: /Ja, entfernen/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/game-days/gd-1/participants/p1/joker");
    expect(init.method).toBe("DELETE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/components/participants-roster.test.tsx`
Expected: FAIL — handlers are no-ops, the cancel dialog doesn't exist.

- [ ] **Step 3: Implement the minimal code to make the tests pass**

In `src/app/admin/participants-roster.tsx`:

1. Add imports at the top of the file:

```tsx
import { JokerConfirmDialog } from "@/components/joker-confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
```

2. Inside `ParticipantsRoster`, add two pieces of state and the wired handlers (below the existing `setError` declaration):

```tsx
const [jokerTarget, setJokerTarget] = useState<RosterRow | null>(null);
const [cancelTarget, setCancelTarget] = useState<RosterRow | null>(null);
const [jokerBusy, setJokerBusy] = useState(false);

async function adminSetJoker(row: RosterRow) {
  setJokerBusy(true);
  setError(null);
  const res = await fetch(
    `/api/game-days/${gameDayId}/participants/${row.playerId}/joker`,
    { method: "POST" },
  );
  setJokerBusy(false);
  if (res.ok) {
    setJokerTarget(null);
    router.refresh();
    return;
  }
  setError("Konnte Joker nicht setzen");
}

async function adminCancelJoker(row: RosterRow) {
  setJokerBusy(true);
  setError(null);
  const res = await fetch(
    `/api/game-days/${gameDayId}/participants/${row.playerId}/joker`,
    { method: "DELETE" },
  );
  setJokerBusy(false);
  if (res.ok) {
    setCancelTarget(null);
    router.refresh();
    return;
  }
  setError("Konnte Joker nicht entfernen");
}
```

3. Change the `<PlayerCard>` wiring to call the new state setters:

```tsx
<PlayerCard
  key={r.playerId}
  row={r}
  dimmed={pendingIds.has(r.playerId)}
  onMove={() => patch(r.playerId, "confirmed")}
  onSetJoker={() => setJokerTarget(r)}
  onCancelJoker={() => setCancelTarget(r)}
/>
```

(Both branches — pool and roster — need this change.)

4. Render the two dialogs at the bottom of `ParticipantsRoster` (just above the closing `</div>` of the top-level container):

```tsx
<JokerConfirmDialog
  open={jokerTarget !== null}
  onClose={() => setJokerTarget(null)}
  onConfirm={() => jokerTarget && adminSetJoker(jokerTarget)}
  jokersRemaining={jokerTarget?.jokersRemaining ?? 0}
  ppgSnapshot={null}
  loading={jokerBusy}
  targetName={jokerTarget?.name}
/>
<Dialog
  open={cancelTarget !== null}
  onClose={() => setCancelTarget(null)}
  title={cancelTarget ? `Joker von ${cancelTarget.name} entfernen?` : ""}
>
  <div className="space-y-3 text-sm text-foreground">
    <p>
      Der Joker wird entfernt und die Teilnahme auf „unbestätigt“ zurückgesetzt.
      Der Slot steht wieder zur Verfügung.
    </p>
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={() => setCancelTarget(null)} disabled={jokerBusy}>
        Abbrechen
      </Button>
      <Button
        type="button"
        variant="destructive"
        onClick={() => cancelTarget && adminCancelJoker(cancelTarget)}
        loading={jokerBusy}
      >
        Ja, entfernen
      </Button>
    </div>
  </div>
</Dialog>
```

> Note: `ppgSnapshot` is `null` in the admin flow because we don't preload every player's PPG; the dialog will render the "Bisher keine Statistik — die PPG wird beim Setzen des Jokers festgeschrieben." fallback, which is accurate here.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/components/participants-roster.test.tsx`
Expected: PASS — the two new cases and all four existing ones green.

Run: `pnpm test`
Expected: full suite green.

- [ ] **Step 5: Manual verification in the browser**

Run: `pnpm dev`

Verify in order:

1. Log in as Patrick (admin).
2. Create a planned game day for tomorrow if none exists.
3. Ensure you (Patrick) are a participant on the dashboard.
4. On `/` (dashboard), the hero shows three buttons: Dabei sein / Nicht dabei / Joker setzen; the time in the top-right is gone.
5. Click "Joker setzen" → confirm dialog shows the PPG preview (or fallback if you have no matches yet).
6. Confirm → page refreshes, "Joker setzen" becomes aria-pressed, dashboard "Joker" strip shows 1 used.
7. Click "Dabei sein" → page refreshes, joker cancelled, attendance confirmed.
8. Burn through two jokers across two planned days so `jokersRemaining === 0`. Verify "Joker setzen" becomes disabled with the "Keine Joker mehr in dieser Saison" helper text.
9. Open `/admin`, switch the planned day to the test day, and inside the roster:
   - Click "Joker für Werner setzen" on a pool row → dialog titled "Joker für Werner setzen?" → confirm → Werner moves to "Dabei" column with a "Joker" badge.
   - Click "Joker entfernen" on the badge row → dialog titled "Joker von Werner entfernen?" → "Ja, entfernen" → Werner drops back to the pool with no badge.
   - Force-use both of Werner's season jokers, then confirm the roster shows "Keine Joker übrig" (disabled) on his row.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/participants-roster.tsx tests/components/participants-roster.test.tsx
git commit -m "feat(admin): wire joker set/cancel dialogs to admin joker API"
```

---

### Task 11: Final check — full suite + lint

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm test`
Expected: every test file green.

- [ ] **Step 2: Run the linter**

Run: `pnpm lint`
Expected: no errors. Warnings acceptable if they match pre-existing warnings in the repo.

- [ ] **Step 3: Run the type-check/build**

Run: `pnpm build`
Expected: Next.js build succeeds with no TypeScript errors.

- [ ] **Step 4: Open a PR**

```bash
git push -u origin feature/joker-toggle
gh pr create --title "feat: joker 3-way toggle + admin fallback" --body "$(cat <<'EOF'
## Summary
- DashboardHero now offers Dabei sein / Nicht dabei / Joker setzen with a PPG-preview confirm dialog; the time is no longer shown above the date.
- Admin participants roster gains a per-row joker badge, "Joker für {name} setzen", "Joker entfernen", and a disabled "Keine Joker übrig" state.
- New domain functions `cancelJokerUse`, `recordJokerUseAsAdmin`, `cancelJokerUseAsAdmin` share internal helpers with the existing `recordJokerUse`; audit logs gain `joker.cancel`, `joker.use.admin`, `joker.cancel.admin` actions.
- New routes: `DELETE /api/jokers` and `POST|DELETE /api/game-days/[id]/participants/[playerId]/joker`, both returning structured `{ code }` errors on 409.

## Test plan
- [ ] `pnpm test` green end-to-end
- [ ] Manual run-through from Task 10 Step 5 on `pnpm dev`
- [ ] Spot-check audit log entries after joker set/cancel via admin and self flows
EOF
)"
```

---

## Spec coverage audit (self-review)

| Spec section / requirement | Task |
|---|---|
| §3.1 `cancelJokerUse` | Task 1 |
| §3.2 `recordJokerUseAsAdmin` | Task 2 |
| §3.3 `cancelJokerUseAsAdmin` | Task 3 |
| §3.4 `DELETE /api/jokers` | Task 4 |
| §3.4 admin POST joker | Task 5 |
| §3.4 admin DELETE joker | Task 5 |
| §4.1 remove time display | Task 7 / Task 8 |
| §4.2 new HeroState props | Task 7 (type) + Task 8 (data) |
| §4.3 3-way toggle | Task 7 |
| §4.3 switch-from-joker sequencing | Task 7 |
| §4.3 disabled + helper text when 0 jokers | Task 7 |
| §4.4 confirm dialog copy + PPG fallback | Task 6 |
| §4.5 German error toasts | Task 7 |
| §5.1 `"joker"` in `ParticipantAttendance` | Task 9 |
| §5.2 joker badge + per-row controls | Task 9 + Task 10 |
| §5.3 per-player jokersRemaining data flow | Task 9 |
| §5.4 admin joker dispatch | Task 10 |
| §6.1 domain unit tests | Tasks 1-3 |
| §6.2 API tests | Tasks 4-5 |
| §6.3 component tests | Tasks 6-7, 9-10 |

All spec items are covered by at least one task. No placeholders remain; all code snippets are concrete; function names (`cancelJokerUse`, `recordJokerUseAsAdmin`, `cancelJokerUseAsAdmin`, `JokerNotFoundError`) and prop names (`jokersRemaining`, `ppgSnapshot`) stay identical across all tasks.
