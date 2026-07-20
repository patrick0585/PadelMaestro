# Saison-Abschluss & Saison-Archiv — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin kann die laufende Saison unter frei gewähltem Namen abschließen und eine neue starten; das Archiv zeigt pro abgeschlossener Saison die Abschlusstabelle plus Spieltagsliste.

**Architecture:** `Season` bekommt ein Pflichtfeld `name` (unique, Jahr-Unique entfällt). Abschließen = Transaktion: aktive Saison umbenennen + deaktivieren, neue aktive Saison anlegen. Rangliste/Joker hängen bereits per `seasonId` an der Saison — nichts wird kopiert oder genullt; das Archiv berechnet Abschlusstabellen live über `computeRanking(seasonId)`.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, zod, Vitest (+ Testing Library für Komponenten), Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-20-season-close-design.md` (freigegeben).

## Global Constraints

- UI-Texte auf Deutsch; API-Fehlercodes snake_case (wie `date_exists`).
- Keine Co-Authored-By-/Claude-Trailer in Commits.
- Tests laufen gegen die lokale Postgres (`docker compose -f docker-compose.dev.yml up -d`, Port 5433); `pnpm test` führt die gesamte Suite aus. Achtung: `pnpm test` wischt die lokale DB (inkl. Admin) — danach ggf. re-seeden.
- CSRF/Origin-Prüfung passiert in der Middleware für alle `/api/*`-Mutationen — Route-Handler prüfen nur Session + `isAdmin` (Muster: `src/app/api/game-days/route.ts`).
- Auth-Mock-Muster für API-Tests: `vi.mock("@/auth", ...)` wie in `tests/integration/attendance-api.test.ts`.
- Branch: `feat/season-close` (existiert bereits, Spec liegt darauf).

---

### Task 1: Schema-Migration `Season.name` + alle Erzeuger-Callsites

**Files:**
- Modify: `prisma/schema.prisma:41-52` (model Season)
- Create: `prisma/migrations/<timestamp>_add_season_name/migration.sql` (via `--create-only`, dann Hand-SQL)
- Modify: `src/lib/season.ts` (`getOrCreateActiveSeason` setzt Fallback-Namen)
- Modify: `tests/integration/season.test.ts`
- Modify: alle `prisma.season.create`-Callsites in `tests/` und `scripts/` (Liste in Step 5)

**Interfaces:**
- Produces: `Season.name: string` (unique, Pflicht). `getOrCreateActiveSeason()` liefert Seasons immer mit `name`; Fallback-Name ist `` `Saison ${year}` ``.

- [ ] **Step 1: Failing Test — Fallback-Name**

In `tests/integration/season.test.ts` den ersten Test erweitern:

```ts
  it("creates the current-year season if none exists", async () => {
    const year = new Date().getFullYear();
    const s = await getOrCreateActiveSeason();
    expect(s.year).toBe(year);
    expect(s.isActive).toBe(true);
    expect(s.name).toBe(`Saison ${year}`);
  });
```

- [ ] **Step 2: Test läuft rot**

Run: `pnpm vitest run tests/integration/season.test.ts`
Expected: FAIL (`name` ist `undefined` bzw. TS-Fehler „Property 'name' does not exist").

- [ ] **Step 3: Schema ändern**

In `prisma/schema.prisma`, model `Season`: Zeile `year Int @unique` ersetzen und `name` ergänzen:

```prisma
model Season {
  id        String   @id @default(uuid())
  name      String   @unique
  year      Int
  startDate DateTime @db.Date
  endDate   DateTime @db.Date
  isActive  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  gameDays   GameDay[]
  jokerUses  JokerUse[]
}
```

- [ ] **Step 4: Migration mit Backfill anlegen**

```bash
pnpm prisma migrate dev --create-only --name add_season_name
```

Die generierte `migration.sql` komplett ersetzen durch:

```sql
-- Add Season.name with backfill (existing rows get "Saison <year>"),
-- then swap the unique constraint from year to name.
ALTER TABLE "Season" ADD COLUMN "name" TEXT;
UPDATE "Season" SET "name" = 'Saison ' || "year";
ALTER TABLE "Season" ALTER COLUMN "name" SET NOT NULL;
DROP INDEX "Season_year_key";
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");
```

Dann anwenden: `pnpm prisma migrate dev`
Expected: Migration applied, Prisma Client neu generiert.

- [ ] **Step 5: Alle Season-Erzeuger anpassen**

`getOrCreateActiveSeason` in `src/lib/season.ts`:

```ts
export async function getOrCreateActiveSeason() {
  const year = new Date().getFullYear();
  const existing = await prisma.season.findFirst({ where: { isActive: true } });
  if (existing) return existing;

  return prisma.season.create({
    data: {
      name: `Saison ${year}`,
      year,
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31),
      isActive: true,
    },
  });
}
```

(Akzeptierte Edge: Kollision des Fallback-Namens wirft P2002 — tritt nur bei leerer DB + Alt-Saison gleichen Namens auf, laut Spec ok.)

Dann alle übrigen Erzeuger finden und `name` ergänzen:

```bash
grep -rn "season.create" tests scripts src
```

Regel: `name: \`Saison ${year}\`` analog zum Fallback; wenn ein Test **zwei Seasons im selben Jahr** anlegt (z. B. `otherSeason` in `tests/integration/player-season-stats.test.ts`), bekommt die zweite `name: \`Saison ${year} B\``. Betroffene Dateien (Stand heute — maßgeblich ist der grep):
`tests/integration/{admin-jokers-api,archive-list,attendance-api,game-day-delete,game-day-finish,gameday-summary,joker-list,joker,jokers-api,matches-api,player-delete,player-season-stats,ranking,season-trend,shuffle-preview-api}.test.ts`, `tests/unit/game-day/{delete,finish}.test.ts`, `scripts/{seed-initial,import-statistik}.ts`, `scripts/dev/seed-demo-day.ts`. Reine Leser (`findFirst` etc., z. B. diagnose-Skripte) nicht anfassen.

- [ ] **Step 6: Suite grün**

Run: `pnpm test`
Expected: PASS komplett (insbesondere season.test.ts inkl. neuem Assert).

- [ ] **Step 7: Commit**

```bash
git add prisma src/lib/season.ts tests scripts
git commit -m "feat(season): add required unique Season.name with backfill migration"
```

---

### Task 2: `closeSeasonAndStartNext` (Lib + Integrationstests)

**Files:**
- Modify: `src/lib/season.ts` (Funktion + Fehlerklassen; unbenutztes `closeSeason` entfernen)
- Create: `tests/integration/season-close.test.ts`

**Interfaces:**
- Consumes: `Season.name` aus Task 1.
- Produces (für Task 3):

```ts
export class NoActiveSeasonError extends Error {}
export class OpenGameDaysError extends Error { readonly days: { date: Date; status: string }[] }
export class InvalidSeasonNamesError extends Error {}
export class SeasonNameConflictError extends Error {}
export function closeSeasonAndStartNext(args: {
  closedName: string; nextName: string; actorId: string;
}): Promise<{ closedSeason: Season; newSeason: Season }>
```

- [ ] **Step 1: Failing Tests schreiben**

`tests/integration/season-close.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  closeSeasonAndStartNext,
  getOrCreateActiveSeason,
  InvalidSeasonNamesError,
  NoActiveSeasonError,
  OpenGameDaysError,
  SeasonNameConflictError,
} from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { resetDb } from "../helpers/reset-db";

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "admin@x", passwordHash: "x", isAdmin: true },
  });
}

describe("closeSeasonAndStartNext", () => {
  beforeEach(resetDb);

  it("renames+deactivates the old season, creates a new active one, writes an audit log", async () => {
    const admin = await makeAdmin();
    const season = await getOrCreateActiveSeason();

    const { closedSeason, newSeason } = await closeSeasonAndStartNext({
      closedName: "Hinrunde 2026",
      nextName: "Rückrunde 2026",
      actorId: admin.id,
    });

    expect(closedSeason.id).toBe(season.id);
    expect(closedSeason.name).toBe("Hinrunde 2026");
    expect(closedSeason.isActive).toBe(false);
    expect(newSeason.name).toBe("Rückrunde 2026");
    expect(newSeason.isActive).toBe(true);
    expect(newSeason.id).not.toBe(season.id);

    const active = await prisma.season.findMany({ where: { isActive: true } });
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(newSeason.id);

    const log = await prisma.auditLog.findFirst({ where: { action: "season.close" } });
    expect(log?.entityId).toBe(season.id);
    expect(log?.actorId).toBe(admin.id);
  });

  it("starts the new season with an empty ranking and a fresh joker budget", async () => {
    const admin = await makeAdmin();
    const season = await getOrCreateActiveSeason();
    const players = await Promise.all(
      ["A", "B", "C", "D"].map((n) =>
        prisma.player.create({ data: { name: n, email: `${n}@x`, passwordHash: "x" } }),
      ),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-07-14"), status: "finished" },
    });
    await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: players[0].id,
        team1PlayerBId: players[1].id,
        team2PlayerAId: players[2].id,
        team2PlayerBId: players[3].id,
        team1Score: 6,
        team2Score: 1,
      },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: players[0].id,
        seasonId: season.id,
        gameDayId: day.id,
        ppgAtUse: 1.5,
        pointsCredited: 15,
      },
    });

    const { newSeason } = await closeSeasonAndStartNext({
      closedName: "Hinrunde 2026",
      nextName: "Rückrunde 2026",
      actorId: admin.id,
    });

    expect(await computeRanking(newSeason.id)).toEqual([]);
    expect(await prisma.jokerUse.count({ where: { seasonId: newSeason.id } })).toBe(0);
    // Alte Saison bleibt vollständig: Ranking weiterhin berechenbar, Joker zugeordnet.
    expect((await computeRanking(season.id)).length).toBeGreaterThan(0);
    expect(await prisma.jokerUse.count({ where: { seasonId: season.id } })).toBe(1);
  });

  it.each(["planned", "in_progress"] as const)(
    "refuses to close while a %s game day exists and changes nothing",
    async (status) => {
      const admin = await makeAdmin();
      const season = await getOrCreateActiveSeason();
      await prisma.gameDay.create({
        data: { seasonId: season.id, date: new Date("2026-07-21"), status },
      });

      await expect(
        closeSeasonAndStartNext({
          closedName: "Hinrunde 2026",
          nextName: "Rückrunde 2026",
          actorId: admin.id,
        }),
      ).rejects.toThrow(OpenGameDaysError);

      const unchanged = await prisma.season.findUniqueOrThrow({ where: { id: season.id } });
      expect(unchanged.isActive).toBe(true);
      expect(await prisma.season.count()).toBe(1);
    },
  );

  it("reports the open days in the error", async () => {
    const admin = await makeAdmin();
    const season = await getOrCreateActiveSeason();
    await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-07-21"), status: "planned" },
    });
    const err = await closeSeasonAndStartNext({
      closedName: "A",
      nextName: "B",
      actorId: admin.id,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OpenGameDaysError);
    expect((err as OpenGameDaysError).days).toHaveLength(1);
    expect((err as OpenGameDaysError).days[0].status).toBe("planned");
  });

  it("rejects empty or identical names", async () => {
    const admin = await makeAdmin();
    await getOrCreateActiveSeason();
    for (const [closedName, nextName] of [
      ["", "Rückrunde 2026"],
      ["Hinrunde 2026", "   "],
      ["Gleich", "Gleich"],
    ]) {
      await expect(
        closeSeasonAndStartNext({ closedName, nextName, actorId: admin.id }),
      ).rejects.toThrow(InvalidSeasonNamesError);
    }
  });

  it("rejects names already taken by another season", async () => {
    const admin = await makeAdmin();
    const year = new Date().getFullYear();
    await prisma.season.create({
      data: {
        name: "Hinrunde 2026",
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 5, 30),
        isActive: false,
      },
    });
    await getOrCreateActiveSeason();
    await expect(
      closeSeasonAndStartNext({
        closedName: "Egal",
        nextName: "Hinrunde 2026",
        actorId: admin.id,
      }),
    ).rejects.toThrow(SeasonNameConflictError);
  });

  it("throws NoActiveSeasonError when no season is active", async () => {
    const admin = await makeAdmin();
    await expect(
      closeSeasonAndStartNext({ closedName: "A", nextName: "B", actorId: admin.id }),
    ).rejects.toThrow(NoActiveSeasonError);
  });
});
```

- [ ] **Step 2: Tests laufen rot**

Run: `pnpm vitest run tests/integration/season-close.test.ts`
Expected: FAIL („closeSeasonAndStartNext is not exported" / not defined).

- [ ] **Step 3: Implementierung in `src/lib/season.ts`**

Unbenutztes `closeSeason` (Zeile 18-20) **entfernen** und ergänzen:

```ts
export class NoActiveSeasonError extends Error {
  constructor() {
    super("no active season");
    this.name = "NoActiveSeasonError";
  }
}

export class OpenGameDaysError extends Error {
  readonly days: { date: Date; status: string }[];
  constructor(days: { date: Date; status: string }[]) {
    super(`season has ${days.length} unfinished game day(s)`);
    this.name = "OpenGameDaysError";
    this.days = days;
  }
}

export class InvalidSeasonNamesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSeasonNamesError";
  }
}

export class SeasonNameConflictError extends Error {
  constructor(name: string) {
    super(`season name already taken: ${name}`);
    this.name = "SeasonNameConflictError";
  }
}

export async function closeSeasonAndStartNext(args: {
  closedName: string;
  nextName: string;
  actorId: string;
}) {
  const closedName = args.closedName.trim();
  const nextName = args.nextName.trim();
  if (!closedName || !nextName)
    throw new InvalidSeasonNamesError("both names are required");
  if (closedName === nextName)
    throw new InvalidSeasonNamesError("names must differ");

  return prisma.$transaction(async (tx) => {
    const active = await tx.season.findFirst({ where: { isActive: true } });
    if (!active) throw new NoActiveSeasonError();

    const openDays = await tx.gameDay.findMany({
      where: { seasonId: active.id, status: { not: "finished" } },
      select: { date: true, status: true },
      orderBy: { date: "asc" },
    });
    if (openDays.length > 0) throw new OpenGameDaysError(openDays);

    const clash = await tx.season.findFirst({
      where: { name: { in: [closedName, nextName] }, id: { not: active.id } },
      select: { name: true },
    });
    if (clash) throw new SeasonNameConflictError(clash.name);

    const now = new Date();
    const year = now.getFullYear();
    const closedSeason = await tx.season.update({
      where: { id: active.id },
      data: { name: closedName, isActive: false, endDate: now },
    });
    const newSeason = await tx.season.create({
      data: {
        name: nextName,
        year,
        startDate: now,
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: "season.close",
        entityType: "Season",
        entityId: closedSeason.id,
        payload: { closedName, nextName, newSeasonId: newSeason.id },
      },
    });
    return { closedSeason, newSeason };
  });
}
```

- [ ] **Step 4: Tests grün**

Run: `pnpm vitest run tests/integration/season-close.test.ts tests/integration/season.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/season.ts tests/integration/season-close.test.ts
git commit -m "feat(season): closeSeasonAndStartNext with open-day guard and name validation"
```

---

### Task 3: API-Route `POST /api/seasons/close`

**Files:**
- Create: `src/app/api/seasons/close/route.ts`
- Create: `tests/integration/seasons-close-api.test.ts`

**Interfaces:**
- Consumes: `closeSeasonAndStartNext` + Fehlerklassen aus Task 2.
- Produces (für Task 5, Dialog): `POST /api/seasons/close` mit Body `{ closedName, nextName }`. 200 → `{ closedSeason, newSeason }`. Fehler: 400 `{ error: "invalid_names" }` | 409 `{ error: "name_conflict" }` | 409 `{ error: "no_active_season" }` | 409 `{ error: "open_game_days", days: ["2026-07-21", …] }` (ISO-Datum) | 401/403 wie üblich.

- [ ] **Step 1: Failing Tests**

`tests/integration/seasons-close-api.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/seasons/close/route";
import { getOrCreateActiveSeason } from "@/lib/season";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://localhost/api/seasons/close", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "admin@x", passwordHash: "x", isAdmin: true },
  });
}

describe("POST /api/seasons/close", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admins", async () => {
    const player = await prisma.player.create({
      data: { name: "P", email: "p@x", passwordHash: "x" },
    });
    authMock.mockResolvedValue({ user: { id: player.id, isAdmin: false } });
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for an invalid body", async () => {
    const admin = await makeAdmin();
    authMock.mockResolvedValue({ user: { id: admin.id, isAdmin: true } });
    const res = await POST(req({ closedName: "A" }));
    expect(res.status).toBe(400);
  });

  it("closes the season and returns both seasons", async () => {
    const admin = await makeAdmin();
    await getOrCreateActiveSeason();
    authMock.mockResolvedValue({ user: { id: admin.id, isAdmin: true } });
    const res = await POST(req({ closedName: "Hinrunde 2026", nextName: "Rückrunde 2026" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.closedSeason.name).toBe("Hinrunde 2026");
    expect(body.newSeason.name).toBe("Rückrunde 2026");
  });

  it("returns 409 open_game_days with the blocking dates", async () => {
    const admin = await makeAdmin();
    const season = await getOrCreateActiveSeason();
    await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-07-21"), status: "planned" },
    });
    authMock.mockResolvedValue({ user: { id: admin.id, isAdmin: true } });
    const res = await POST(req({ closedName: "A", nextName: "B" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("open_game_days");
    expect(body.days).toEqual(["2026-07-21"]);
  });

  it("returns 400 invalid_names for identical names", async () => {
    const admin = await makeAdmin();
    await getOrCreateActiveSeason();
    authMock.mockResolvedValue({ user: { id: admin.id, isAdmin: true } });
    const res = await POST(req({ closedName: "X", nextName: "X" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_names");
  });
});
```

- [ ] **Step 2: Tests laufen rot**

Run: `pnpm vitest run tests/integration/seasons-close-api.test.ts`
Expected: FAIL (Modul `@/app/api/seasons/close/route` existiert nicht).

- [ ] **Step 3: Route implementieren**

`src/app/api/seasons/close/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  closeSeasonAndStartNext,
  InvalidSeasonNamesError,
  NoActiveSeasonError,
  OpenGameDaysError,
  SeasonNameConflictError,
} from "@/lib/season";

const CloseSchema = z.object({ closedName: z.string(), nextName: z.string() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CloseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const result = await closeSeasonAndStartNext({
      closedName: parsed.data.closedName,
      nextName: parsed.data.nextName,
      actorId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof InvalidSeasonNamesError)
      return NextResponse.json({ error: "invalid_names" }, { status: 400 });
    if (e instanceof SeasonNameConflictError)
      return NextResponse.json({ error: "name_conflict" }, { status: 409 });
    if (e instanceof NoActiveSeasonError)
      return NextResponse.json({ error: "no_active_season" }, { status: 409 });
    if (e instanceof OpenGameDaysError)
      return NextResponse.json(
        {
          error: "open_game_days",
          days: e.days.map((d) => d.date.toISOString().slice(0, 10)),
        },
        { status: 409 },
      );
    throw e;
  }
}
```

- [ ] **Step 4: Tests grün**

Run: `pnpm vitest run tests/integration/seasons-close-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/seasons tests/integration/seasons-close-api.test.ts
git commit -m "feat(api): POST /api/seasons/close (admin) with typed error codes"
```

---

### Task 4: Archiv — Saison-Gruppierung + Abschlusstabelle

**Files:**
- Modify: `src/lib/archive/list.ts` (Season-Daten statt `seasonYear`)
- Modify: `src/app/archive/page.tsx` (Gruppierung nach Saison, RankingTable für abgeschlossene)
- Modify: `tests/integration/archive-list.test.ts`

**Interfaces:**
- Consumes: `computeRanking(seasonId)` (bestehend), `RankingTable` (bestehend).
- Produces: `ArchivedGameDayRow` hat statt `seasonYear: number` neu `seasonId: string; seasonName: string; seasonIsActive: boolean`.

- [ ] **Step 1: Failing Test — Season-Felder in den Rows**

In `tests/integration/archive-list.test.ts`: den lokalen Helper `makeSeason` um einen Namensparameter erweitern (er hat nach Task 1 bereits ein `name`-Feld):

```ts
async function makeSeason(year = new Date().getFullYear(), name = `Saison ${year}`) {
  return prisma.season.create({
    data: { name, year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
}
```

Alle Asserts auf `seasonYear` im File auf die neuen Felder umstellen und diesen Test ergänzen:

```ts
  it("carries season id, name and active flag on every row", async () => {
    const season = await makeSeason(2026, "Hinrunde 2026");
    const players = await Promise.all(["A", "B", "C", "D"].map(makeUser));
    await makeFinishedDayWithOneMatch(season.id, new Date("2026-04-17"), players);

    const [row] = await listArchivedGameDays(null);
    expect(row.seasonId).toBe(season.id);
    expect(row.seasonName).toBe("Hinrunde 2026");
    expect(row.seasonIsActive).toBe(true);
  });
```

- [ ] **Step 2: Test läuft rot**

Run: `pnpm vitest run tests/integration/archive-list.test.ts`
Expected: FAIL (`seasonId`/`seasonName` undefined).

- [ ] **Step 3: `src/lib/archive/list.ts` anpassen**

Interface-Felder ersetzen:

```ts
export interface ArchivedGameDayRow {
  id: string;
  date: Date;
  seasonId: string;
  seasonName: string;
  seasonIsActive: boolean;
  matchCount: number;
  playerCount: number;
  jokerCount: number;
  podium: ArchivePodiumEntry[];
  self: { points: number; matches: number } | null;
}
```

Im `findMany`-`select` ergänzen:

```ts
      season: { select: { id: true, name: true, isActive: true } },
```

und beim Row-Bau `seasonYear: day.date.getUTCFullYear(),` ersetzen durch:

```ts
      seasonId: day.season.id,
      seasonName: day.season.name,
      seasonIsActive: day.season.isActive,
```

- [ ] **Step 4: Archiv-Seite umbauen**

`src/app/archive/page.tsx` — `groupBySeason` und das Rendering ersetzen (Empty-State und das `<li>`-Markup der Spieltage bleiben unverändert):

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Archive } from "lucide-react";
import { listArchivedGameDays, type ArchivedGameDayRow } from "@/lib/archive/list";
import { formatGameDayDate } from "@/lib/archive/format";
import { computeRanking, type RankingRow } from "@/lib/ranking/compute";
import { RankingTable } from "@/components/ranking-table";
import { Badge } from "@/components/ui/badge";

interface SeasonSection {
  seasonId: string;
  seasonName: string;
  seasonIsActive: boolean;
  rows: ArchivedGameDayRow[];
}

// rows kommen nach Datum absteigend sortiert — die Insertion-Order der
// Sections entspricht damit „neueste Saison zuerst".
function groupBySeason(rows: ArchivedGameDayRow[]): SeasonSection[] {
  const sections = new Map<string, SeasonSection>();
  for (const row of rows) {
    const section = sections.get(row.seasonId);
    if (section) section.rows.push(row);
    else
      sections.set(row.seasonId, {
        seasonId: row.seasonId,
        seasonName: row.seasonName,
        seasonIsActive: row.seasonIsActive,
        rows: [row],
      });
  }
  return [...sections.values()];
}
```

Im Body der Komponente nach dem Empty-State:

```tsx
  const sections = groupBySeason(rows);
  const finalTables = new Map<string, RankingRow[]>();
  for (const section of sections) {
    if (!section.seasonIsActive) {
      finalTables.set(section.seasonId, await computeRanking(section.seasonId));
    }
  }
```

Rendering (ersetzt die bisherige `years.map`-Schleife; das innere `<li>` bleibt 1:1 wie heute):

```tsx
      {sections.map((section) => (
        <section key={section.seasonId} className="space-y-2">
          <h2 className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            {section.seasonName}
            {section.seasonIsActive && <Badge variant="neutral">laufend</Badge>}
          </h2>
          {!section.seasonIsActive && (
            <RankingTable ranking={finalTables.get(section.seasonId) ?? []} />
          )}
          <ul className="space-y-2">
            {section.rows.map((row) => (
              /* bestehendes <li>…</li> unverändert übernehmen */
            ))}
          </ul>
        </section>
      ))}
```

- [ ] **Step 5: Tests + Build grün**

Run: `pnpm vitest run tests/integration/archive-list.test.ts && pnpm test`
Expected: PASS (keine weiteren Verbraucher von `seasonYear` — mit `grep -rn "seasonYear" src tests` gegenprüfen, Treffer beheben).

- [ ] **Step 6: Commit**

```bash
git add src/lib/archive/list.ts src/app/archive/page.tsx tests/integration/archive-list.test.ts
git commit -m "feat(archive): group by season and show final table for closed seasons"
```

---

### Task 5: Admin-Karte „Saison" + Abschluss-Dialog

**Files:**
- Create: `src/app/admin/close-season-dialog.tsx`
- Modify: `src/app/admin/page.tsx` (neue Karte)
- Create: `tests/components/close-season-dialog.test.tsx`

**Interfaces:**
- Consumes: API aus Task 3 (`POST /api/seasons/close`, Fehlercodes `invalid_names` | `name_conflict` | `no_active_season` | `open_game_days` + `days: string[]`).
- Produces: `<CloseSeasonDialog currentName={string} />` (Client-Komponente mit eigenem Trigger-Button).

- [ ] **Step 1: Failing Component-Tests**

`tests/components/close-season-dialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import { CloseSeasonDialog } from "@/app/admin/close-season-dialog";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("<CloseSeasonDialog>", () => {
  it("posts both names and refreshes on success", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse(200, { closedSeason: {}, newSeason: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CloseSeasonDialog currentName="Saison 2026" />);
    await userEvent.click(screen.getByRole("button", { name: /Saison abschließen/ }));

    const closedInput = screen.getByLabelText("Name im Archiv");
    expect(closedInput).toHaveValue("Saison 2026");
    await userEvent.clear(closedInput);
    await userEvent.type(closedInput, "Hinrunde 2026");
    await userEvent.type(screen.getByLabelText("Name der neuen Saison"), "Rückrunde 2026");
    await userEvent.click(screen.getByRole("button", { name: "Abschließen" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seasons/close",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ closedName: "Hinrunde 2026", nextName: "Rückrunde 2026" }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the blocking dates on open_game_days", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(409, { error: "open_game_days", days: ["2026-07-21"] })),
    );

    render(<CloseSeasonDialog currentName="Saison 2026" />);
    await userEvent.click(screen.getByRole("button", { name: /Saison abschließen/ }));
    await userEvent.type(screen.getByLabelText("Name der neuen Saison"), "Rückrunde 2026");
    await userEvent.click(screen.getByRole("button", { name: "Abschließen" }));

    expect(await screen.findByText(/offene Spieltage/)).toBeInTheDocument();
    expect(screen.getByText(/21\.07\.2026/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("maps name_conflict to a German message", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(409, { error: "name_conflict" })));

    render(<CloseSeasonDialog currentName="Saison 2026" />);
    await userEvent.click(screen.getByRole("button", { name: /Saison abschließen/ }));
    await userEvent.type(screen.getByLabelText("Name der neuen Saison"), "Saison 2026 B");
    await userEvent.click(screen.getByRole("button", { name: "Abschließen" }));

    expect(await screen.findByText(/bereits vergeben/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Tests laufen rot**

Run: `pnpm vitest run tests/components/close-season-dialog.test.tsx`
Expected: FAIL (Komponente existiert nicht).

- [ ] **Step 3: Dialog implementieren**

`src/app/admin/close-season-dialog.tsx`:

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_names: "Bitte zwei unterschiedliche, nicht leere Namen angeben.",
  name_conflict: "Dieser Saisonname ist bereits vergeben.",
  no_active_season: "Keine aktive Saison gefunden.",
};

export function CloseSeasonDialog({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [closedName, setClosedName] = useState(currentName);
  const [nextName, setNextName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setClosedName(currentName);
      setNextName("");
      setError(null);
    }
  }, [open, currentName]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/seasons/close", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ closedName, nextName }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        days?: string[];
      };
      if (body.error === "open_game_days") {
        const dates = (body.days ?? [])
          .map((d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" }))
          .join(", ");
        setError(`Es gibt noch offene Spieltage: ${dates}. Bitte erst beenden oder löschen.`);
      } else {
        setError(ERROR_MESSAGES[body.error ?? ""] ?? "Abschließen fehlgeschlagen");
      }
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        Saison abschließen
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Saison abschließen">
        <form onSubmit={onSubmit} className="space-y-3">
          <p className="text-sm text-foreground">
            Die aktuelle Tabelle wandert unter dem Archiv-Namen ins Archiv. Danach
            startet die neue Saison bei 0 Punkten und jeder hat wieder 2 Joker.
          </p>
          <div>
            <Label htmlFor="close-season-closed-name">Name im Archiv</Label>
            <Input
              id="close-season-closed-name"
              value={closedName}
              onChange={(e) => setClosedName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="close-season-next-name">Name der neuen Saison</Label>
            <Input
              id="close-season-next-name"
              value={nextName}
              onChange={(e) => setNextName(e.target.value)}
              placeholder="z. B. Rückrunde 2026"
              required
            />
          </div>
          {error && (
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Abbrechen
            </Button>
            <Button type="submit" variant="destructive" loading={loading}>
              Abschließen
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Admin-Karte einbauen**

In `src/app/admin/page.tsx` (Season + finishedCount sind dort schon/leicht verfügbar — `getOrCreateActiveSeason` wird bereits aufgerufen). Ergänzen:

```tsx
  const finishedCount = await prisma.gameDay.count({
    where: { seasonId: season.id, status: "finished" },
  });
```

Neue Karte zwischen `<PlayersSection>` und der Spieltage-Karte:

```tsx
      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Saison</h2>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <div className="font-medium text-foreground">{season.name}</div>
              <div className="text-xs text-foreground-muted">
                seit {new Date(season.startDate).toLocaleDateString("de-DE", { timeZone: "UTC" })} ·{" "}
                {finishedCount} {finishedCount === 1 ? "Spieltag" : "Spieltage"} gespielt
              </div>
            </div>
            <CloseSeasonDialog currentName={season.name} />
          </div>
        </CardBody>
      </Card>
```

Import ergänzen: `import { CloseSeasonDialog } from "./close-season-dialog";`

- [ ] **Step 5: Tests grün**

Run: `pnpm vitest run tests/components/close-season-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin tests/components/close-season-dialog.test.tsx
git commit -m "feat(admin): season card with close-season dialog"
```

---

### Task 6: Saison-Name in Rangliste & Dashboard

**Files:**
- Modify: `src/app/ranking/page.tsx:26` (Header-Zeile)
- Modify: `src/app/page.tsx:92,139,220` (drei `Saison {season.year}`-Stellen)

**Interfaces:**
- Consumes: `season.name` aus Task 1.

- [ ] **Step 1: Texte umstellen**

- `src/app/ranking/page.tsx`: `Saison {season.year}` → `{season.name}`.
- `src/app/page.tsx` Zeile 92: Fallback-Subtitle `` `Saison ${season.year}` `` → `season.name`.
- `src/app/page.tsx` Zeile 139: `Medaillen Saison {season.year}` → `Medaillen {season.name}`.
- `src/app/page.tsx` Zeile 220: `Joker Saison {season.year}` → `Joker {season.name}`.

(Zeilennummern = Stand bei Planerstellung; maßgeblich ist `grep -n "season.year" src/app`. Danach darf es in `src/app` keine UI-Verwendung von `season.year` mehr geben.)

- [ ] **Step 2: Suite grün**

Run: `pnpm test`
Expected: PASS (Dashboard-/Ranking-Komponententests betreffen Props, nicht diese Header — falls doch ein Snapshot bricht: Erwartungstext auf `season.name` umstellen).

- [ ] **Step 3: Commit**

```bash
git add src/app/ranking/page.tsx src/app/page.tsx
git commit -m "feat(ui): show season name instead of year in ranking and dashboard"
```

---

### Task 7: Verifikation, Live-Demo, PR

**Files:** keine neuen — Verifikations-Task.

- [ ] **Step 1: Komplett-Check**

```bash
pnpm test && pnpm lint && pnpm build
```

Expected: alles grün/fehlerfrei.

- [ ] **Step 2: Lokale Live-Demo (Patricks Workflow: Demo vor Merge)**

Nach `pnpm test` ist die lokale DB leer — neu aufsetzen (siehe `reference_dev_workflow`):

```bash
pnpm seed:demo
pnpm bootstrap:admin patrick@padel.local "Patrick"   # Temp-Passwort sofort an Patrick durchgeben
pnpm dev
```

Demo-Drehbuch (Patrick klickt selbst oder bekommt Screenshots):
1. Admin → Karte „Saison" zeigt „Saison 2026" + Spieltagszähler.
2. Spieltag anlegen (blockiert den Abschluss) → „Saison abschließen" → Fehlermeldung mit Datum erscheint im Dialog.
3. Spieltag wieder löschen → Abschluss mit „Hinrunde 2026" / „Rückrunde 2026" → Rangliste zeigt „Rückrunde 2026" und leere Tabelle, jeder hat 2 Joker.
4. Archiv → Sektion „Hinrunde 2026" mit Abschlusstabelle + Spieltagen; oben „Rückrunde 2026" mit Badge „laufend" (sobald dort ein fertiger Spieltag existiert).

- [ ] **Step 3: Review-Fan-out + Abschluss**

Standard-Fan-out (`reviewer` + `test-engineer` + `refactor-cleanup`, dazu `design-reviewer` wegen UI-Anteil) auf den Branch-Diff; Befunde beheben. Danach `superpowers:finishing-a-development-branch` → PR gegen `main` (kein Auto-Deploy: Deploy auf den VPS erst nach Merge und nur auf Patricks Zuruf — die Migration läuft dann via `deploy.sh` automatisch mit).
