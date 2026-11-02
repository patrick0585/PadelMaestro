# Mandantenfähigkeit PR 4: Saison und Spieltag – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aktive Saison und aktiver Spieltag gehören zur Session-Gruppe; Spieltag-Teilnehmer kommen aus den Mitgliedern; jede Spieltag-, Match-, Joker- und Saison-Route prüft die Gruppe; `Season.groupId` und `GameDay.groupId` werden Pflicht.

**Architecture:** `getOrCreateActiveSeason(groupId)` und `closeSeasonAndStartNext({ groupId, … })` arbeiten pro Gruppe, `createGameDay(groupId, date, actorId)` nimmt aktive Mitglieder als Teilnehmer. Routen prüfen den Spieltag mit `findGroupGameDay(groupId, id)` (bzw. das Match mit `findGroupMatchGameDay`) vor dem Lib-Aufruf und antworten 404; Mitglieder-Routen nutzen den neuen `guardMember()`, Admin-Routen `guardGroupAdmin()`. Seiten lesen die Gruppe aus der Session und zeigen ohne Gruppe einen Hinweis statt abzustürzen. Zum Schluss setzt eine Migration `groupId` auf NOT NULL (nach erneutem Abgleich) und ersetzt `Season.name @unique` durch `@@unique([groupId, name])`; die Lib-Funktionen der Spieltag-Aktionen (`startGameDay`, `finishGameDay`, …) behalten ihre Signaturen.

**Tech Stack:** Next.js 15, Prisma 6 (PostgreSQL 16), next-auth 5 beta (JWT), Vitest 4, Docker-Postgres für die Migrationsprobe.

**Spec:** `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md` (Datenmodell → Season/GameDay; Session und Autorisierung → Ressourcenprüfung; Abfragen, die gruppenbezogen werden; PR-Folge Punkt 4).

## Global Constraints

- Jeder Commit hält `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` grün. Die Schema-Umstellung auf NOT NULL kommt deshalb als letzter Code-Task, nachdem alle Schreiber `groupId` setzen.
- Verhaltensneutral für die Live-Gruppe (eine Gruppe, alle Spieler Mitglied). Zugriff auf Spieltag/Match einer fremden Gruppe → 404 mit dem Fehlercode, den die Route heute für „nicht gefunden“ nutzt (`not_found`, `game_day_not_found`, `ATTENDANCE_GAME_DAY_NOT_FOUND`), nie 403.
- Admin-Routen: `guardGroupAdmin()` (401 ohne Session, 403 ohne Gruppe oder Rolle `member`). Mitglieder-Routen: `guardMember()` (401 ohne Session, 403 ohne Gruppe). Beide aus `src/lib/auth/route-guard.ts`.
- Gruppe kommt ausschließlich aus der Session, nie aus Request-Body oder URL.
- Lib-Signaturen von `startGameDay`, `finishGameDay`, `deleteGameDay`, `setAttendance`, `joinGameDay`, `setAttendanceAsAdmin`, `shufflePreviewSeed`, `addExtraMatch`, `removeExtraMatch`, `recordJokerUse*`, `cancelJokerUse*`, `enterScore` bleiben unverändert; die Gruppenprüfung liegt in der Route (wie Avatar in PR 3).
- Geändert werden nur: `getOrCreateActiveSeason(groupId)`, `closeSeasonAndStartNext({ groupId, closedName, nextName, actorId })`, `createGameDay(groupId, date, actorId)`, `listArchivedGameDays(groupId, currentPlayerId)`.
- Ranking-SQL, Profil-Statistiken, SSE-Route (`/api/game-day/[id]/events`), `game-day/summary.ts`, `live-standings.ts` bleiben inhaltlich PR 5; nur Aufrufer von `getOrCreateActiveSeason` reichen `groupId` durch.
- Leerzustand „keine Gruppe“: minimale Komponente `NoGroupNotice` jetzt, weil Seiten ohne Gruppe keine Saison mehr laden können; Feinschliff in PR 6 (Spec sagt PR 6, Ergänzung dort eintragen).
- `getSoleGroup` verschwindet aus `src/lib/season.ts` und `src/lib/game-day/create.ts`; bleibt in `bootstrap-admin.ts` und Skripten.
- Migration per Hand (kein `migrate dev`), idempotenter Abgleich davor (nur Mitgliedschaften und NULL-Gruppen, nicht Rolle/`removedAt`), danach `prisma migrate diff` → „empty migration“. Probe gegen Produktions-Dump vor dem Deploy.
- Tests gegen lokale Postgres (5433) via `resetDb`; Fixtures über `tests/helpers/group.ts`. Fehlertexte im Code englisch, UI deutsch, Commits kurz, deutsch, ohne Attribution.

## Reihenfolge

Task 1 → Task 2 und 3 zusammen (ändern Signaturen und deren Aufrufer in vielen Testdateien) → Task 4, 5, 6 parallel (berühren disjunkte Routen/Seiten; ihre Testdateien sind nach Task 2/3 bereits auf die neuen Signaturen umgestellt) → Task 7 → Task 8 → Task 9.

## Review Focus

1. Admin von Gruppe A ruft `POST /api/game-days/<id-aus-B>/start` (oder finish, delete, participants, joker, matches/[matchId]) auf: 404, keine Änderung (Task 4).
2. Zwei Gruppen, beide ohne Saison: `getOrCreateActiveSeason` liefert pro Gruppe eine eigene aktive Saison mit gleichem Namen „Saison 2026“ (Task 2, Migration Task 7 erlaubt gleiche Namen in verschiedenen Gruppen).
3. Spieltag anlegen, während ein Mitglied entfernt ist und ein Spieler nur in Gruppe B Mitglied ist: beide fehlen in den Teilnehmern (Task 3).
4. Sechs gleichzeitige erste Seitenaufrufe auf leerer DB: genau eine Saison, kein 500 (Task 2, Race aus dem PR-3-E2E).
5. Spieler ohne Gruppe öffnet `/`, `/game-day`, `/ranking`, `/archive`: Hinweis „Du bist in keiner Gruppe“, kein Absturz (Task 6).

---

### Task 1: Guards, Spieltag-Scope, Fixtures, Leerzustand

**Files:**
- Modify: `src/lib/auth/route-guard.ts`, `tests/helpers/group.ts`
- Create: `src/lib/game-day/group-scope.ts`, `src/components/no-group-notice.tsx`
- Test: `tests/unit/auth/route-guard.test.ts`, `tests/integration/game-day-group-scope.test.ts`

**Interfaces:**
- Produces in `route-guard.ts`: `guardMember(): Promise<GuardResult>` (401 ohne Session/`user.id`, 403 wenn `contextFromSession` null; sonst `ctx`).
- Produces in `group-scope.ts`: `findGroupGameDay(groupId: string, gameDayId: string): Promise<{ id: string; status: GameDayStatus } | null>` (nur Spieltage mit `groupId`); `findGroupMatchGameDay(groupId: string, matchId: string): Promise<{ gameDayId: string } | null>` (Match → `gameDay.groupId`).
- Produces in `no-group-notice.tsx`: `NoGroupNotice()` Server-Komponente, `Card`/`CardBody`, Überschrift „Du bist in keiner Gruppe“, Text „Bitte einen Admin deiner Gruppe um Aufnahme.“
- Produces in `tests/helpers/group.ts`: `createTestSeason(groupId: string, overrides?: Partial<Prisma.SeasonUncheckedCreateInput>): Promise<Season>` (Default: Name `Saison <year>-<zufall>`, aktuelles Jahr, 1.1.–31.12., `isActive: true`); `createTestGameDay(groupId: string, seasonId: string, overrides?: Partial<Prisma.GameDayUncheckedCreateInput>): Promise<GameDay>` (Default: heutiges Datum UTC, `status: "planned"`, `playerCount: 4`).

- [ ] **Step 1: Failing Tests.** `route-guard.test.ts`: „guardMember 401 ohne Session“, „403 ohne Gruppe“, „liefert ctx für member“. `game-day-group-scope.test.ts`: „findGroupGameDay liefert den Spieltag der eigenen Gruppe“, „null für Spieltag einer anderen Gruppe“, „findGroupMatchGameDay liefert gameDayId nur für Match der eigenen Gruppe“ (Match direkt per Prisma mit vier Spielern anlegen).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Mitglieder-Guard, Spieltag-Scope und Fixtures`.

### Task 2: Saison pro Gruppe

**Files:**
- Modify: `src/lib/season.ts`, `src/app/api/seasons/close/route.ts`, `src/app/ranking/page.tsx`, `src/app/api/ranking/route.ts`, `src/app/page.tsx`, `scripts/import-historical.ts`
- Test: `tests/integration/season.test.ts`, `tests/integration/season-close.test.ts`, `tests/integration/seasons-close-api.test.ts`

**Interfaces:**
- Consumes: `guardGroupAdmin`, `guardMember`, `contextFromSession`, `NoGroupNotice`, Fixtures (Task 1).
- Produces: `getOrCreateActiveSeason(groupId: string)`; `closeSeasonAndStartNext({ groupId, closedName, nextName, actorId })`.
- Alle Aufrufer der beiden Funktionen in `src`, `scripts` und `tests` per `grep -rn "getOrCreateActiveSeason\|closeSeasonAndStartNext"` umstellen (Tests nur Signatur, keine neuen Fälle außer den unten genannten).

- [ ] **Step 1: Failing Tests.** season.test.ts: „legt pro Gruppe eine eigene aktive Saison an (gleicher Name erlaubt)“ (zwei Gruppen → zwei Saisons `Saison <year>`, je `isActive`); „liefert bei gleichzeitigen Aufrufen genau eine Saison“ (`Promise.all` mit fünf Aufrufen auf leerer Gruppe → `season.count({ where: { groupId } }) === 1`, alle Rückgaben gleiche `id`). season-close.test.ts: `groupId` überall; „Namenskonflikt nur innerhalb der Gruppe“ (Saison „Alt“ in Gruppe B blockiert `closedName: "Alt"` in Gruppe A nicht); „schließt nur die Saison der eigenen Gruppe“. seasons-close-api.test.ts: Session via `sessionFor`; „403 für member“, „401 ohne Session“ bleiben/ergänzen.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** `getOrCreateActiveSeason`: `findFirst({ where: { groupId, isActive: true } })`, sonst `create` in `try`; bei `P2002` erneut `findFirst` und zurückgeben. `closeSeasonAndStartNext`: `active` mit `groupId`, `clash` mit `groupId`, `groupId` aus Argument (kein `getSoleGroup`). Route `seasons/close`: `guardGroupAdmin`, `groupId: g.ctx.groupId`. `ranking/page.tsx`, `page.tsx`: `ctx = contextFromSession(session)`; `!ctx` → `return <NoGroupNotice />`; `getOrCreateActiveSeason(ctx.groupId)`; Dashboard-`plannedDay` zusätzlich `groupId: ctx.groupId`. `api/ranking`: `guardMember`. `import-historical.ts`: `getOrCreateActiveSeason((await getSoleGroup()).id)`.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Aktive Saison pro Gruppe, Saison schließen gruppenbezogen`.

### Task 3: Spieltag anlegen und auflisten, Admin-Seite

**Files:**
- Modify: `src/lib/game-day/create.ts`, `src/app/api/game-days/route.ts`, `src/app/admin/page.tsx`
- Test: `tests/integration/game-day-create.test.ts`, `tests/integration/game-day-date-unique.test.ts`

**Interfaces:**
- Consumes: `guardGroupAdmin`, `guardMember`, `getOrCreateActiveSeason(groupId)` (Task 2 – bei paralleler Umsetzung die Signatur aus Task 2 Interfaces verwenden), Fixtures (Task 1).
- Produces: `createGameDay(groupId: string, date: Date, actorId: string)`.
- Alle Aufrufer per `grep -rln "createGameDay(" src scripts tests` umstellen (u. a. `attendance.test.ts`, `enter-score.test.ts`, `shuffle-preview.test.ts`, `start.test.ts`, `admin-participant.test.ts`, `game-day-join.test.ts`, `game-day-extra-match.test.ts`, `game-day-remove-extra-match.test.ts`, `tests/unit/game-day/add-extra-match.test.ts`, `remove-extra-match.test.ts`): Gruppe via `createTestGroup()` bzw. `setupGroupWithAdmin()`, Spieler via `createMember`, damit der Spieltag Teilnehmer bekommt.

- [ ] **Step 1: Failing Tests.** game-day-create.test.ts: „Teilnehmer sind die aktiven Mitglieder der Gruppe“ (entferntes Mitglied und Mitglied einer anderen Gruppe fehlen); „setzt groupId und die aktive Saison der Gruppe“; „gleiches Datum in zwei Gruppen ist erlaubt“. Route: „GET listet nur Spieltage der Session-Gruppe“; „POST 403 für member“; „POST 401 ohne Session“. game-day-date-unique.test.ts: Aufrufe auf neue Signatur.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** `create.ts`: `season = await getOrCreateActiveSeason(groupId)`; Teilnehmer aus `prisma.membership.findMany({ where: { groupId, removedAt: null }, select: { playerId: true } })`; `getSoleGroup`-Import entfällt. Route: GET `guardMember` + `where: { groupId }`; POST `guardGroupAdmin`, `createGameDay(g.ctx.groupId, date, g.ctx.userId)`. `admin/page.tsx`: `manageableDay` mit `groupId: ctx.groupId`; `getOrCreateActiveSeason(ctx.groupId)`; `finishedCount` unverändert (Saison ist schon gruppenbezogen).
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Spieltag anlegen aus Mitgliedern, Liste pro Gruppe`.

### Task 4: Spieltag-Admin-Routen

**Files:**
- Modify: `src/app/api/game-days/[id]/route.ts`, `…/[id]/start/route.ts`, `…/[id]/finish/route.ts`, `…/[id]/shuffle-preview/route.ts`, `…/[id]/participants/[playerId]/route.ts`, `…/[id]/participants/[playerId]/joker/route.ts`, `…/[id]/matches/[matchId]/route.ts`
- Test: `tests/integration/game-day-delete.test.ts`, `tests/integration/start.test.ts`, `tests/integration/game-day-finish.test.ts`, `tests/integration/shuffle-preview-api.test.ts`, `tests/integration/admin-participant.test.ts`, `tests/integration/admin-jokers-api.test.ts`, `tests/integration/game-day-remove-extra-match.test.ts`

**Interfaces:**
- Consumes: `guardGroupAdmin`, `findGroupGameDay`, Fixtures (Task 1).

- [ ] **Step 1: Failing Tests.** In jeder der sieben Testdateien: Sessions via `setupGroupWithAdmin`/`sessionFor`; ein neuer Fall „404 für Spieltag einer anderen Gruppe“ mit Nachweis, dass nichts geschrieben wurde (Status/Teilnehmer/Match unverändert); bestehende 401/403-Fälle bleiben.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** Jede Route: `const g = await guardGroupAdmin(); if (g.response) return g.response;` dann `if (!(await findGroupGameDay(g.ctx.groupId, id))) return 404` mit dem bisherigen Fehlercode der Route; `actorId = g.ctx.userId`. Joker-Admin-Route: lokales `requireAdmin()` entfällt.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Spieltag-Admin-Routen prüfen die Gruppe`.

### Task 5: Mitglieder-Routen (Teilnahme, Joker, Matches)

**Files:**
- Modify: `src/app/api/game-days/[id]/attendance/route.ts`, `…/[id]/join/route.ts`, `…/[id]/matches/route.ts`, `src/app/api/jokers/route.ts`, `src/app/api/matches/[id]/route.ts`
- Test: `tests/integration/attendance-api.test.ts`, `tests/integration/game-day-join.test.ts`, `tests/integration/game-day-extra-match.test.ts`, `tests/integration/jokers-api.test.ts`, `tests/integration/matches-api.test.ts`

**Interfaces:**
- Consumes: `guardMember`, `findGroupGameDay`, `findGroupMatchGameDay`, Fixtures (Task 1).

- [ ] **Step 1: Failing Tests.** Pro Datei: Sessions via `sessionFor(player, group.id, "member")`; neu „404 für Spieltag/Match einer anderen Gruppe“ (Teilnahme, Join, Extra-Match, Joker setzen, Score eintragen) und „403 ohne Gruppe“ (`sessionFor(player, null, null)`); bestehende Fälle bleiben.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** `guardMember` statt `auth()`; Spieltag-Routen `findGroupGameDay(g.ctx.groupId, id)` → 404 (Fehlercode der Route); `jokers/route.ts` prüft `body.gameDayId`; `matches/[id]` prüft `findGroupMatchGameDay(g.ctx.groupId, id)` → 404 `not_found` (vor `enterScore`, `diag` mit `reason "not_found"`); `isAdmin: isAdminRole(g.ctx.role)`.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Teilnahme-, Joker- und Match-Routen prüfen die Gruppe`.

### Task 6: Seiten und Archiv

**Files:**
- Modify: `src/app/game-day/page.tsx`, `src/app/game-day/print/page.tsx`, `src/app/archive/page.tsx`, `src/app/archive/[id]/page.tsx`, `src/lib/archive/list.ts`
- Test: `tests/integration/archive-list.test.ts`

**Interfaces:**
- Consumes: `contextFromSession`, `NoGroupNotice`, Fixtures (Task 1).
- Produces: `listArchivedGameDays(groupId: string, currentPlayerId: string | null)`.

- [ ] **Step 1: Failing Tests.** archive-list.test.ts: Aufrufe auf neue Signatur; „listet nur beendete Spieltage der Gruppe“ (beendeter Spieltag in Gruppe B fehlt).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** `list.ts`: `where: { groupId, status: "finished" }`. Seiten: `ctx = contextFromSession(session)`; `!ctx` → `return <NoGroupNotice />` (Print: wie heute Redirect für Nicht-Admin, danach Hinweis); `game-day/page.tsx` beide `findFirst` mit `groupId: ctx.groupId`; `print/page.tsx` ebenso; `archive/page.tsx` ruft `listArchivedGameDays(ctx.groupId, session.user.id)`; `archive/[id]/page.tsx`: `day.groupId !== ctx.groupId` → `notFound()`.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`, `pnpm test` grün. **Commit** `Spieltag-, Druck- und Archivseiten pro Gruppe`.

### Task 7: Schema NOT NULL, Migration, Fixtures

**Files:**
- Create: `prisma/migrations/20261102160000_group_required/migration.sql`
- Modify: `prisma/schema.prisma`, alle Tests mit direktem `season.create`/`gameDay.create` (21 Dateien, Liste per `grep -rl "season.create\|gameDay.create" tests`), `scripts/seed-initial.ts`, `scripts/import-statistik.ts` (nur falls `groupId` dort noch optional gesetzt wird), Spec-Ergänzung in `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md`

**Interfaces:**
- Consumes: `createTestSeason`, `createTestGameDay`, `createTestGroup` (Task 1).

- [ ] **Step 1: Migration schreiben** (SQL von Hand):

```sql
-- Abgleich (idempotent): fehlende Mitgliedschaften, NULL-Gruppen
INSERT INTO "Membership" ("id","groupId","playerId","role","joinedAt","removedAt")
SELECT gen_random_uuid(), g."id", p."id",
       CASE WHEN p."isAdmin" THEN 'admin'::"MembershipRole" ELSE 'member'::"MembershipRole" END,
       p."invitedAt", p."deletedAt"
FROM "Player" p CROSS JOIN "Group" g
WHERE g."slug" = 'padelmaestro'
  AND NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."playerId" = p."id" AND m."groupId" = g."id");
UPDATE "Season"  SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
UPDATE "GameDay" SET "groupId" = s."groupId" FROM "Season" s WHERE "GameDay"."seasonId" = s."id" AND "GameDay"."groupId" IS NULL;
UPDATE "AuditLog" SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
-- Pflichtfelder und Fremdschlüssel
ALTER TABLE "Season"  ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "GameDay" ALTER COLUMN "groupId" SET NOT NULL;
ALTER TABLE "Season"  DROP CONSTRAINT "Season_groupId_fkey";
ALTER TABLE "Season"  ADD CONSTRAINT "Season_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameDay" DROP CONSTRAINT "GameDay_groupId_fkey";
ALTER TABLE "GameDay" ADD CONSTRAINT "GameDay_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Saisonname nur noch pro Gruppe eindeutig
DROP INDEX "Season_name_key";
```

- [ ] **Step 2: Schema.** `Season.groupId String`, `group Group @relation(...)` (Pflicht), `name String` ohne `@unique`; `GameDay.groupId String`, `group Group @relation(...)`. `pnpm exec prisma migrate deploy` lokal → applied; `pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` → „empty migration“ (falls Prisma eine abweichende Constraint-Form erwartet, SQL anpassen, bis der Diff leer ist). `pnpm exec prisma generate`.
- [ ] **Step 3: tsc** → zeigt jede `create` ohne `groupId`. Alle Tests auf `createTestSeason`/`createTestGameDay` oder `groupId: group.id` umstellen (Gruppe je Test via `createTestGroup()`/`setupGroupWithAdmin()`); Skripte prüfen. Spec: Abschnitt „Nicht-Ziele“/„Semantik“ um einen Satz „Leerzustand ‚keine Gruppe‘ als einfache Komponente bereits ab PR 4, Feinschliff in PR 6“ ergänzen.
- [ ] **Step 4:** `pnpm exec tsc --noEmit && pnpm lint && pnpm test` → grün. **Commit** `groupId Pflicht auf Saison und Spieltag`.

### Task 8: Migrationsprobe gegen Produktions-Dump

**Files:**
- Create: `docs/superpowers/plans/2026-11-02-tenancy-pr4-rehearsal.md`

- [ ] **Step 1:** Dump holen: `scp root@217.154.83.37:/root/backups/2026-11-02-pre-tenancy-3/db.dump <scratch>/prod.dump` (oder frischer `pg_dump -Fc`). Wegwerf-Postgres 16 per Docker auf Port 5438, `pg_restore --no-owner --no-acl`.
- [ ] **Step 2:** Vorher zählen: Season, GameDay, Match, GameDayParticipant, JokerUse, AuditLog, Membership; `\d "Season"` zeigt `Season_name_key`.
- [ ] **Step 3:** `DATABASE_URL=…5438… pnpm exec prisma migrate deploy` → nur `20261102160000_group_required` angewendet. Nachher: Zählungen identisch; `groupId` auf Season/GameDay `NOT NULL`; `Season_name_key` fehlt; `Season_groupId_name_key` vorhanden; Prüf-SQL aus PR 2 (Player ohne Membership = 0, NULL-Gruppen = 0, owner = 1).
- [ ] **Step 4:** Protokoll schreiben (Dump-Alter, Laufzeit, Tabellen, Deploy-Ablauf: Dump nach `/root/backups/<datum>-pre-tenancy-4/`, `deploy.sh`, Prüf-SQL, Login/Dashboard/Spieltag/Rangliste/Archiv). Container und Dump löschen. **Commit** `Migrationsprobe PR 4`.

### Task 9: PR, Review, Deploy

- [ ] **Step 1:** Branch `feat/tenancy-4-season-gameday` pushen, PR mit kurzem deutschem Body (Saison/Spieltag pro Gruppe, 404 für fremde Gruppe, Teilnehmer aus Mitgliedern, NOT NULL-Migration mit Probe, Leerzustand vorgezogen, Race-Fix).
- [ ] **Step 2:** CI grün. **Step 3:** Fan-out `reviewer` (stärkstes Modell, Security-Lens auf alle Routen) + `test-engineer` + `refactor-cleanup`; eine Fix-Runde, ein Re-Review.
- [ ] **Step 4:** Lokal: DB leeren, `pnpm seed:demo`, `pnpm bootstrap:admin`, `pnpm dev`, `pnpm e2e` → grün und ohne den Saison-Race-500.
- [ ] **Step 5:** Patrick merged. **Step 6:** Deploy nach Probe-Protokoll, Prüf-SQL, Seiten prüfen. **Step 7:** Memory aktualisieren.
