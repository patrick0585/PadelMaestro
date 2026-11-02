# Mandantenfähigkeit PR 1: Schema und Backfill – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gruppen- und Mitgliedschaftsmodell einführen, Live-Daten der Gruppe „Padelmaestro“ zuordnen, ohne sichtbare Verhaltensänderung.

**Architecture:** Neue Modelle `Group` und `Membership`, optionale `groupId` auf `Season`, `GameDay`, `AuditLog`. Eine SQL-Migration legt die Gruppe an und befüllt alle Zeilen. Die drei Schreiber von Saisons und Spieltagen holen die Gruppe über `getSoleGroup()`. Kein Lesepfad wertet die Gruppe aus.

**Tech Stack:** Next.js 15, Prisma 6 (PostgreSQL 16), Vitest 4, pnpm, tsx-Skripte.

**Spec:** `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md` (Abschnitte Datenmodell, Migration der Live-Daten, PR-Folge Punkt 1).

## Global Constraints

- Jeder Commit hält `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` grün (CI läuft bei jedem Push).
- Kein Lesepfad in `src/app` oder `src/lib` filtert in diesem PR nach `groupId`.
- `groupId` auf `Season`, `GameDay`, `AuditLog` ist in Prisma `String?` (Abweichung von der Spec, Begründung: 108 direkte `create`-Aufrufe in Tests; Pflicht ab PR 4).
- Kein partieller Unique-Index für „eine aktive Saison pro Gruppe“ (Prisma-Drift); stattdessen `@@index([groupId, isActive])` und die bestehende Transaktionslogik.
- Gruppenname `Padelmaestro`, Slug `padelmaestro`.
- Rollen-Enum `MembershipRole { owner admin member }`; Migration vergibt `admin` für `isAdmin = true`, sonst `member`, nie `owner`.
- Commit-Messages kurz, deutsch, keine Attribution.
- Tests laufen gegen die lokale Postgres (Port 5433); `resetDb` räumt auch `Membership` und `Group`.

## Review Focus

1. Produktions-Dump mit soft-gelöschten Spielern: Migration muss `removedAt = deletedAt` und `joinedAt = invitedAt` setzen; kein Spieler ohne Mitgliedschaft (Test in Task 4, Probe-SQL).
2. Leere Datenbank (CI, frische Installation): Migration legt die Gruppe trotzdem an; `getSoleGroup()` legt sie neu an, wenn `resetDb` sie entfernt hat (Task 2, Test „creates when none“).
3. Zwei Gruppen in der DB: `getSoleGroup()` wirft `AmbiguousGroupError`, statt still eine zu wählen (Task 2).
4. Saison schließen: die neue Saison übernimmt `groupId` der geschlossenen Saison, nicht blind die „sole group“ (Task 2, Test in season-close).
5. `set-owner` bei bereits vorhandenem Besitzer: alter Besitzer wird Admin, Ergebnis wird ausgegeben; unbekannte E-Mail bricht ab (Task 3).

---

### Task 1: Schema und Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_groups_and_memberships/migration.sql`
- Modify: `tests/helpers/reset-db.ts`

**Interfaces:**
- Produces: Prisma-Modelle `Group { id, name, slug, createdAt, updatedAt }`, `Membership { id, groupId, playerId, role, joinedAt, removedAt }`, Enum `MembershipRole`, Felder `Season.groupId?`, `GameDay.groupId?`, `AuditLog.groupId?` mit Relationen `group`.

- [ ] **Step 1: Schema erweitern** gemäß Spec-Abschnitt „Datenmodell“, mit diesen Abweichungen: `groupId String?` auf Season, GameDay, AuditLog; `Season` erhält `@@unique([groupId, name])` zusätzlich zum bisherigen `name @unique` (das globale Unique bleibt in diesem PR, fällt in PR 4) und `@@index([groupId, isActive])`; `GameDay` erhält `@@index([groupId, status])`. `Player` erhält `memberships Membership[]`.

- [ ] **Step 2: Migration erzeugen, nicht anwenden**

Run: `pnpm exec prisma migrate dev --create-only --name add_groups_and_memberships`
Expected: neue Ordner unter `prisma/migrations/`, SQL enthält CREATE TYPE, CREATE TABLE Group/Membership, ALTER TABLE mit den drei Spalten, Indizes, Foreign Keys.

- [ ] **Step 3: Backfill an das Ende der Migration anhängen** (SQL, in derselben Migrationsdatei, nach den DDL-Statements):

```sql
INSERT INTO "Group" ("id","name","slug","createdAt","updatedAt")
VALUES (gen_random_uuid(), 'Padelmaestro', 'padelmaestro', now(), now());

INSERT INTO "Membership" ("id","groupId","playerId","role","joinedAt","removedAt")
SELECT gen_random_uuid(), g."id", p."id",
       CASE WHEN p."isAdmin" THEN 'admin'::"MembershipRole" ELSE 'member'::"MembershipRole" END,
       p."invitedAt", p."deletedAt"
FROM "Player" p CROSS JOIN "Group" g WHERE g."slug" = 'padelmaestro';

UPDATE "Season"  SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
UPDATE "GameDay" SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
UPDATE "AuditLog" SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
```

`gen_random_uuid()` ist in Postgres 16 eingebaut (pgcrypto nicht nötig).

- [ ] **Step 4: Migration lokal anwenden und Client generieren**

Run: `pnpm exec prisma migrate deploy && pnpm exec prisma generate`
Expected: „1 migration applied“, kein Fehler.

- [ ] **Step 5: `resetDb` erweitern:** `membership.deleteMany()` vor `player.deleteMany()`, `group.deleteMany()` ganz am Ende.

- [ ] **Step 6: Typecheck und gesamte Suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: PASS, 96 Dateien, 665 Tests (unverändert: nichts liest die neuen Felder).

- [ ] **Step 7: Commit** `Gruppen und Mitgliedschaften im Schema`

### Task 2: `getSoleGroup()` und die drei Schreiber

**Files:**
- Create: `src/lib/group/sole-group.ts`
- Modify: `src/lib/season.ts` (getOrCreateActiveSeason, closeSeasonAndStartNext)
- Modify: `src/lib/game-day/create.ts`
- Test: `tests/integration/sole-group.test.ts`, `tests/integration/season.test.ts`, `tests/integration/season-close.test.ts`, `tests/integration/game-day-create.test.ts`

**Interfaces:**
- Produces: `getSoleGroup(tx?: Prisma.TransactionClient): Promise<Group>`; `class AmbiguousGroupError extends Error`; Konstanten `DEFAULT_GROUP_NAME = "Padelmaestro"`, `DEFAULT_GROUP_SLUG = "padelmaestro"`.
- Später ersetzt durch den Gruppenkontext aus PR 2/4; alle Aufrufer sind die drei genannten Schreiber.

- [ ] **Step 1: Failing Tests für `getSoleGroup`** in `tests/integration/sole-group.test.ts` (beforeEach `resetDb()`):

```ts
it("creates the default group when none exists", async () => {
  const g = await getSoleGroup();
  expect(g.slug).toBe("padelmaestro");
  expect(await prisma.group.count()).toBe(1);
});
it("returns the existing group", async () => {
  const a = await getSoleGroup(); const b = await getSoleGroup();
  expect(b.id).toBe(a.id);
});
it("throws AmbiguousGroupError with two groups", async () => {
  await prisma.group.createMany({ data: [
    { name: "A", slug: "a" }, { name: "B", slug: "b" } ] });
  await expect(getSoleGroup()).rejects.toBeInstanceOf(AmbiguousGroupError);
});
```

- [ ] **Step 2: Run** `pnpm exec vitest run tests/integration/sole-group.test.ts` → FAIL (Modul fehlt).

- [ ] **Step 3: Implementieren** `getSoleGroup` in `src/lib/group/sole-group.ts`: `findMany({ take: 2 })`; 0 → create Default; 1 → return; 2 → throw. Optionaler `tx`-Parameter, damit `closeSeasonAndStartNext` innerhalb seiner Transaktion bleiben kann.

- [ ] **Step 4: Run** derselbe Befehl → PASS.

- [ ] **Step 5: Failing Tests für die Schreiber** ergänzen:
  - `season.test.ts`: `expect(s.groupId).toBe((await getSoleGroup()).id)` in „creates the current-year season“.
  - `season-close.test.ts`: neuer Test „new season inherits groupId of the closed season“: Gruppe B anlegen, aktive Saison mit `groupId: B.id` anlegen, schließen, `newSeason.groupId === B.id` (nicht die Default-Gruppe; beweist Review-Focus 4). Hinweis: mit zwei Gruppen darf `closeSeasonAndStartNext` `getSoleGroup` nicht aufrufen.
  - `game-day-create.test.ts`: `expect(day.groupId).toBe(season.groupId)` und AuditLog-Eintrag `game_day.create` hat dieselbe `groupId`.

- [ ] **Step 6: Run** die drei Dateien → FAIL an den neuen Assertions.

- [ ] **Step 7: Implementieren**
  - `getOrCreateActiveSeason()`: unverändertes `findFirst({ isActive: true })`; beim Anlegen `groupId: (await getSoleGroup()).id`.
  - `closeSeasonAndStartNext`: `newSeason.groupId = active.groupId`, AuditLog `groupId: active.groupId`. Kein `getSoleGroup`-Aufruf.
  - `createGameDay`: `groupId: season.groupId` am GameDay und am AuditLog.

- [ ] **Step 8: Run** `pnpm exec tsc --noEmit && pnpm test` → PASS.

- [ ] **Step 9: Commit** `Saison und Spieltag erhalten ihre Gruppe`

### Task 3: Besitzer setzen (`tenancy:set-owner`)

**Files:**
- Create: `src/lib/group/set-owner.ts`
- Create: `scripts/tenancy-set-owner.ts`
- Modify: `package.json` (Script `"tenancy:set-owner": "tsx scripts/tenancy-set-owner.ts"`)
- Test: `tests/integration/set-owner.test.ts`

**Interfaces:**
- Produces: `setGroupOwner(args: { email: string; groupId: string }): Promise<{ newOwnerId: string; previousOwnerId: string | null }>`; `class PlayerNotFoundError extends Error`.
- Skript: `pnpm tenancy:set-owner <email>` nutzt `getSoleGroup()` aus Task 2 und gibt beide IDs plus Namen aus.

- [ ] **Step 1: Failing Tests**

```ts
it("makes the player owner, creating the membership if missing", ...)  // role === "owner", removedAt null
it("demotes the previous owner to admin and reports them", ...)        // previousOwnerId gesetzt, alter Eintrag role === "admin"
it("reactivates a removed membership when promoting", ...)             // removedAt wird null
it("throws PlayerNotFoundError for an unknown email", ...)
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren** als eine `$transaction` (upsert auf `@@unique([groupId, playerId])`). **Step 4: Run** → PASS.

- [ ] **Step 5: Skript** `scripts/tenancy-set-owner.ts` nach dem Muster von `scripts/bootstrap-admin.ts` (argv-Prüfung, `prisma.$disconnect` in `finally`, Exit 1 bei Fehler).

- [ ] **Step 6: Smoke lokal:** `pnpm tenancy:set-owner <lokale Admin-Mail>` → Ausgabe „<Name> ist jetzt Besitzer von Padelmaestro“.

- [ ] **Step 7: Commit** `Skript: Gruppenbesitzer setzen`

### Task 4: Migrationsprobe gegen den Produktions-Dump

**Files:**
- Create: `docs/superpowers/plans/2026-11-02-tenancy-pr1-rehearsal.md` (Ergebnisprotokoll, wird im PR verlinkt)

- [ ] **Step 1: Dump holen:** `scp root@217.154.83.37:/var/backups/padel/<neueste>.dump <scratchpad>/prod.dump` (nur lesen; nichts auf dem VPS ändern).

- [ ] **Step 2: Wegwerf-DB:** `docker run -d --name padel-rehearsal -p 5436:5432 -e POSTGRES_USER=padel -e POSTGRES_PASSWORD=padel -e POSTGRES_DB=padel postgres:16-alpine`; `pg_restore --no-owner --no-acl -d postgresql://padel:padel@localhost:5436/padel prod.dump` (bei fehlendem lokalem `pg_restore`: `docker exec -i` im Container).

- [ ] **Step 3: Vorher-Zahlen** per SQL festhalten: `count(*)` von Player (gesamt, isAdmin, deletedAt not null), Season, GameDay, Match, JokerUse, AuditLog.

- [ ] **Step 4: Migration anwenden:** `DATABASE_URL=postgresql://padel:padel@localhost:5436/padel?schema=public pnpm exec prisma migrate deploy` → genau die neue Migration wird angewendet.

- [ ] **Step 5: Nachher-Prüfung** (alle müssen 0 bzw. gleich sein):

```sql
SELECT count(*) FROM "Player" p WHERE NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."playerId"=p."id");            -- 0
SELECT count(*) FROM "Membership" m JOIN "Player" p ON p."id"=m."playerId" WHERE (m."role"='admin') <> p."isAdmin";   -- 0
SELECT count(*) FROM "Membership" m JOIN "Player" p ON p."id"=m."playerId" WHERE m."removedAt" IS DISTINCT FROM p."deletedAt"; -- 0
SELECT count(*) FROM "Season" WHERE "groupId" IS NULL;   -- 0
SELECT count(*) FROM "GameDay" WHERE "groupId" IS NULL;  -- 0
SELECT count(*) FROM "AuditLog" WHERE "groupId" IS NULL; -- 0
SELECT count(*) FROM "Group";                            -- 1
SELECT count(*) FROM "Membership" WHERE "role"='owner';  -- 0
```
Plus: Zeilenzahlen aus Step 3 unverändert.

- [ ] **Step 6: `set-owner` proben:** `DATABASE_URL=... pnpm tenancy:set-owner <Patricks E-Mail>` → Ausgabe prüfen, `role='owner'` genau einmal, Thomas bleibt `admin`.

- [ ] **Step 7: Protokoll schreiben** (Zahlen vorher/nachher, Laufzeit der Migration), Container entfernen (`docker rm -f padel-rehearsal`), Dump löschen.

- [ ] **Step 8: Commit** `Migrationsprobe PR 1 protokolliert`

### Task 5: PR, Review, Deploy

- [ ] **Step 1:** Branch `feat/tenancy-1-schema` pushen, PR gegen `main` mit kurzem deutschem Body (was, warum, Link zum Protokoll, Hinweis „Verhalten unverändert“).
- [ ] **Step 2:** CI grün abwarten (`gh pr checks --watch`).
- [ ] **Step 3:** Review-Fan-out: `reviewer` + `test-engineer` + `refactor-cleanup` parallel; Befunde critical/important beheben.
- [ ] **Step 4:** Patrick merged (Merge-Rechte liegen bei ihm).
- [ ] **Step 5:** Deploy: manueller Dump nach `/root/backups/<datum>-pre-tenancy-1/`, dann `deploy.sh` (Health-Check-Fehlalarm Port 3000 ignorieren), dann `pnpm tenancy:set-owner <Patricks E-Mail>` auf dem VPS im App-Verzeichnis als User `padel`.
- [ ] **Step 6:** Verifikation auf dem VPS: Login 200, Dashboard und Rangliste laden, Nachher-SQL aus Task 4 Step 5 gegen die Produktions-DB (jetzt mit `owner` = 1).
- [ ] **Step 7:** Memory aktualisieren (Stand PR 1 deployt).
