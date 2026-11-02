# Mandantenfähigkeit PR 2: Gruppenkontext – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gruppe und Rolle in die Session bringen, `isAdmin` aus der Rolle ableiten, Mitgliedschaften überall dort mitschreiben, wo heute `isAdmin` geschrieben wird, und vorab alle Daten abgleichen.

**Architecture:** Eine idempotente SQL-Abgleich-Migration spiegelt den Player-Zustand in `Membership`. Login und Token-Refresh lesen die aktive Mitgliedschaft und tragen `groupId`, `role` und das abgeleitete `isAdmin` im JWT. Ein Helfer `group-context.ts` kapselt die Autorisierung für spätere PRs. Spieler anlegen, ändern und entfernen schreiben `Player.isAdmin` und `Membership` parallel; der Besitzer ist gegen Herabstufung und Entfernen geschützt. Skripte legen Mitgliedschaften an.

**Tech Stack:** Next.js 15, Prisma 6 (PostgreSQL 16), next-auth 5 beta (JWT), Vitest 4, tsx.

**Spec:** `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md` (Session und Autorisierung, Abfragen, Skripte und Tests, PR-Folge Punkt 2).

## Global Constraints

- Jeder Commit hält `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` grün.
- Verhaltensneutral für die Live-Gruppe, mit genau einer gewollten Ausnahme: der Besitzer kann nicht mehr herabgestuft oder entfernt werden (409 `owner_protected`), siehe Spec „Admin-Schalter“.
- `isAdmin` in Token und Session = `role === "admin" || role === "owner"`. UI und API-Routen lesen weiterhin `session.user.isAdmin`; kein Routen-Code liest in diesem PR `groupId` oder `role`.
- Rollen-Typ ohne Prisma-Import: `export type GroupRole = "owner" | "admin" | "member"` in `src/lib/auth/roles.ts`. `src/auth.config.ts` bleibt edge-safe (keine Prisma-Imports, nur Typen).
- Aktive Mitgliedschaft = `removedAt IS NULL`; bei mehreren die mit dem jüngsten `joinedAt`. Keine Mitgliedschaft → `groupId: null`, `role: null`, `isAdmin: false`; kein Logout.
- „Letzter Admin“-Prüfungen bleiben in diesem PR auf `Player.isAdmin` (Dual-Write-Phase; Umstellung in PR 3).
- `TRACKED_FIELDS` in `update.ts` bleibt unverändert (Tests prüfen `changedFields` mit `toEqual`).
- Die 18 Testdateien, die `auth()` mocken, bleiben unangetastet; ihre Session-Mocks ohne `groupId`/`role` müssen weiter funktionieren.
- Commits kurz, deutsch, keine Attribution; Fehlermeldungen in Code englisch wie bisher, Skriptausgaben deutsch.
- Tests gegen lokale Postgres (5433); `resetDb` wird genutzt, keine neuen manuellen Lösch-Ketten.

## Review Focus

1. Spieler ohne Mitgliedschaft meldet sich an (Dev/Test, oder Produktion im Fenster zwischen Deploys): Login klappt, `isAdmin` ist false, kein Absturz (Task 2, Test „authorize without membership“).
2. Thomas stuft Patrick (Besitzer) per Admin-Schalter herab oder entfernt ihn: 409 `owner_protected`, Datenbank unverändert (Task 4).
3. Token-Refresh für einen Spieler, dessen Mitgliedschaft inzwischen `removedAt` hat: Token bekommt `groupId: null`, `isAdmin: false`, Session bleibt (Task 2).
4. Abgleich-Migration auf Daten mit Lücken (Spieler ohne Membership, `isAdmin` ≠ `role`, `deletedAt` ≠ `removedAt`, Saison/Spieltag/AuditLog mit NULL-Gruppe): alles gespiegelt, `owner` unangetastet, zweiter Lauf ändert nichts (Task 1, Probe).
5. `bootstrap:admin` auf leerer DB: Gruppe entsteht, Admin wird Besitzer; auf DB mit Besitzer: neuer Admin wird `admin` (Task 5).

---

### Task 1: Abgleich-Migration und Probe

**Files:**
- Create: `prisma/migrations/<timestamp>_reconcile_memberships/migration.sql`
- Create: `docs/superpowers/plans/2026-11-02-tenancy-pr2-rehearsal.md`

**Interfaces:**
- Produces: das SQL wird in PR 4 vor `NOT NULL` wiederverwendet; Datei bleibt kommentiert.

- [ ] **Step 1: Migration anlegen** (leerer Ordner mit korrektem Zeitstempel-Namen, SQL von Hand; `prisma migrate dev` ist im Projekt nicht nutzbar, siehe PR 1). Inhalt, Zielgruppe = `(SELECT "id" FROM "Group" WHERE "slug" = 'padelmaestro')`:

```sql
-- 1 fehlende Mitgliedschaften
INSERT INTO "Membership" ("id","groupId","playerId","role","joinedAt","removedAt")
SELECT gen_random_uuid(), g."id", p."id",
       CASE WHEN p."isAdmin" THEN 'admin'::"MembershipRole" ELSE 'member'::"MembershipRole" END,
       p."invitedAt", p."deletedAt"
FROM "Player" p CROSS JOIN "Group" g
WHERE g."slug" = 'padelmaestro'
  AND NOT EXISTS (SELECT 1 FROM "Membership" m WHERE m."playerId" = p."id" AND m."groupId" = g."id");
-- 2 Rolle aus isAdmin, owner unangetastet
UPDATE "Membership" m SET "role" = CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole"
FROM "Player" p WHERE p."id" = m."playerId" AND m."role" <> 'owner'
  AND m."role" <> CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole";
-- 3 removedAt aus deletedAt
UPDATE "Membership" m SET "removedAt" = p."deletedAt"
FROM "Player" p WHERE p."id" = m."playerId" AND m."removedAt" IS DISTINCT FROM p."deletedAt";
-- 4 NULL-Gruppen füllen
UPDATE "Season"   SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
UPDATE "GameDay"  SET "groupId" = s."groupId" FROM "Season" s WHERE "GameDay"."seasonId" = s."id" AND "GameDay"."groupId" IS NULL;
UPDATE "AuditLog" SET "groupId" = (SELECT "id" FROM "Group" WHERE "slug"='padelmaestro') WHERE "groupId" IS NULL;
```

- [ ] **Step 2: Lokal anwenden:** `pnpm exec prisma migrate deploy` → applied; `pnpm exec prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` → „empty migration“ (kein Drift).

- [ ] **Step 3: Probe** gegen den Produktions-Dump (Vorgehen wie PR 1: Docker-Container Port 5438, `pg_restore`, dann `migrate deploy` bis einschließlich PR-1-Migration). Danach Lücken erzeugen per SQL: einen Spieler ohne Membership anlegen; bei einem bestehenden Mitglied `isAdmin` auf true setzen (Rolle bleibt member); einen Spieler soft-löschen (`deletedAt`), Membership bleibt aktiv; eine Saison und einen Spieltag mit `groupId NULL` anlegen; den Besitzer (`role owner`) mit `isAdmin true` belassen. Dann Abgleich-Migration anwenden und prüfen: alle Prüf-SQL aus PR 1 (ohne Owner-Zählung = 1 erwartet), Besitzer weiterhin `owner`. Migration ein zweites Mal als SQL ausführen → 0 betroffene Zeilen.

- [ ] **Step 4: Protokoll** in `docs/superpowers/plans/2026-11-02-tenancy-pr2-rehearsal.md` (Dump-Alter, Lücken, Ergebnisse, Idempotenz, Deploy-Ablauf wie PR 1 ohne `set-owner`). Container und Dump entfernen.

- [ ] **Step 5: Suite** `pnpm exec tsc --noEmit && pnpm test` → grün. **Commit** `Abgleich-Migration für Mitgliedschaften`.

### Task 2: Rollen, Login und Token

**Files:**
- Create: `src/lib/auth/roles.ts`
- Modify: `src/lib/auth/authorize.ts`, `src/auth.ts`, `src/auth.config.ts`, `src/lib/auth/refresh-token.ts`
- Test: `tests/unit/auth/roles.test.ts`, `tests/unit/refresh-token.test.ts`, `tests/integration/auth.test.ts`

**Interfaces:**
- Produces: `type GroupRole`, `isAdminRole(role: GroupRole | null | undefined): boolean`, `ACTIVE_MEMBERSHIP_ORDER` (Prisma `orderBy: { joinedAt: "desc" }`) in `roles.ts`.
- `AuthorizedUser` erweitert um `groupId: string | null; role: GroupRole | null`.
- `PlayerLookup` wird `{ username: string | null; deletedAt: Date | null; membership: { groupId: string; role: GroupRole } | null }`.
- `Session.user` erweitert um `groupId: string | null; role: GroupRole | null`; JWT-Augmentation in `src/auth.ts` für `id, isAdmin, username, groupId, role, refreshedAt`.

- [ ] **Step 1: Failing Tests**
  - `roles.test.ts`: `isAdminRole("owner")`/`("admin")` true, `("member")`/`(null)` false.
  - `refresh-token.test.ts` umbauen: Lookup-Literale auf die neue Form; „copies groupId and role, derives isAdmin true for owner“; „membership null → groupId null, role null, isAdmin false, token kept“; bestehende Tests für Stale-Fenster und `deletedAt → invalidate` behalten.
  - `auth.test.ts`: „authorize returns groupId and role of the active membership“ (Spieler + Membership admin → `role: "admin"`, `isAdmin: true`); „picks the most recently joined active membership“ (zwei Gruppen, ältere entfernt oder älter beigetreten); „authorize without membership returns groupId null and isAdmin false“.

- [ ] **Step 2: Run** die drei Dateien → FAIL (Typ-/Modul-Fehler).

- [ ] **Step 3: Implementieren**
  - `authorize.ts`: nach dem Player-Lookup `prisma.membership.findFirst({ where: { playerId, removedAt: null }, orderBy: { joinedAt: "desc" }, select: { groupId, role } })`; `isAdmin: isAdminRole(m?.role)`.
  - `auth.ts` jwt: Sign-in-Zweig kopiert `groupId`, `role`, `isAdmin`; Refresh-Zweig liefert dem `refreshTokenFromPlayer` einen Lookup, der Player (`username, deletedAt`) und aktive Membership lädt. Session-Callback in `auth.config.ts` kopiert `groupId` und `role` (Casts erweitern).
  - `refresh-token.ts`: setzt `groupId`, `role`, `isAdmin = isAdminRole(role)`.

- [ ] **Step 4: Run** → PASS. **Step 5:** `pnpm exec tsc --noEmit && pnpm test` → grün (alle 18 Mock-Dateien unverändert grün). **Commit** `Gruppe und Rolle in der Session`.

### Task 3: Gruppenkontext-Helfer

**Files:**
- Create: `src/lib/auth/group-context.ts`
- Test: `tests/unit/auth/group-context.test.ts` (mockt `@/auth` wie die Integrationstests)

**Interfaces:**
- Produces: `type GroupContext = { userId: string; groupId: string; role: GroupRole }`; `getGroupContext(): Promise<GroupContext | null>` (null ohne Session oder ohne Gruppe); `requireMember(): Promise<GroupContext>` wirft `NoGroupError`; `requireGroupAdmin()` wirft `ForbiddenError` wenn `!isAdminRole(role)`; `requireOwner()` wirft `ForbiddenError` wenn `role !== "owner"`. Beide Fehlerklassen exportiert, `name` gesetzt. Noch kein Aufrufer (PR 3).

- [ ] **Step 1: Failing Tests:** ohne Session → null; Session mit `groupId null` → null; member → `requireGroupAdmin` wirft `ForbiddenError`; admin → `requireOwner` wirft; owner → alle drei liefern den Kontext; `requireMember` ohne Gruppe wirft `NoGroupError`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** **Step 4: Run** → PASS. **Step 5: Commit** `Gruppenkontext-Helfer`.

### Task 4: Dual-Write bei Spielern und Besitzerschutz

**Files:**
- Modify: `src/lib/players/create.ts`, `src/lib/players/update.ts`, `src/lib/players/delete.ts`, `src/app/api/players/[id]/route.ts`, `src/app/admin/edit-player-dialog.tsx` (nur Fehlertext-Mapping, falls `last_admin` dort gemappt wird)
- Create: `src/lib/players/owner-protected-error.ts`
- Test: `tests/unit/players/create.test.ts`, `tests/unit/players/update.test.ts`, `tests/integration/player-delete.test.ts`, `tests/integration/players-update.test.ts`

**Interfaces:**
- Produces: `class OwnerProtectedError extends Error` (eine Klasse für update und delete). Route mappt sie auf 409 `{ error: "owner_protected" }`.
- `createPlayer` legt zusätzlich `Membership` in `getSoleGroup(tx)` an (`role` aus `isAdmin`), Rückgabe unverändert.
- `updatePlayer`: wenn `isAdmin` übergeben: aktive Membership des Spielers laden; Rolle `owner` und `isAdmin === false` → `OwnerProtectedError`; sonst Upsert (`groupId_playerId` mit `getSoleGroup(tx)`) auf `admin`/`member`, `owner` bleibt `owner`.
- `deletePlayer`: Rolle `owner` in irgendeiner aktiven Membership → `OwnerProtectedError`; sonst `membership.updateMany({ where: { playerId, removedAt: null }, data: { removedAt: now } })` zusätzlich zu `deletedAt`.

- [ ] **Step 1: Failing Tests**
  - create: „creates a membership in the sole group with role admin/member“.
  - update: „syncs membership role when isAdmin toggles“; „keeps owner when isAdmin stays true“; „rejects demoting the owner with OwnerProtectedError“; „creates the membership if missing“.
  - delete: „sets removedAt on active memberships“; „rejects deleting the owner“.
  - players-update (API): PATCH `isAdmin: false` auf Besitzer → 409 `owner_protected`; DELETE auf Besitzer → 409 `owner_protected`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren** (LastAdmin-Zählungen unverändert lassen). **Step 4: Run** → PASS. **Step 5: Suite grün, Commit** `Mitgliedschaft wird mitgeschrieben, Besitzer geschützt`.

### Task 5: Skripte und Testhelfer

**Files:**
- Modify: `scripts/bootstrap-admin.ts`, `scripts/seed-initial.ts`, `scripts/seed-demo.ts`, `scripts/dev/seed-demo-day.ts`, `scripts/import-historical.ts`, `scripts/import-statistik.ts`
- Create: `tests/helpers/group.ts`
- Test: `tests/integration/bootstrap-admin.test.ts` (Logik in `src/lib/group/bootstrap-admin.ts` auslagern, Skript wird dünner Wrapper)

**Interfaces:**
- Produces: `createTestGroup(name = "Testgruppe"): Promise<Group>` (Slug aus Name + Zufallssuffix), `createMember(groupId, { name, email, role = "member", isAdmin? , passwordHash? }): Promise<Player>` (setzt `Player.isAdmin` passend zur Rolle und legt die Membership an), `sessionFor(player, groupId, role)` → Session-Objekt in der Form der bestehenden Mocks plus `groupId`/`role`.
- `bootstrapAdmin({ email, name, password }): Promise<{ playerId; groupId; role }>` in `src/lib/group/bootstrap-admin.ts`: Gruppe via `getSoleGroup()`; Rolle `owner`, wenn die Gruppe keinen Besitzer hat, sonst `admin`; `Player.isAdmin = true`.

- [ ] **Step 1: Failing Tests** `bootstrap-admin.test.ts`: leere DB → Gruppe existiert, Rolle owner; DB mit Besitzer → Rolle admin; bestehende E-Mail → Fehler wie bisher.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren** Lib + Skript; Seeds: `seed-initial` setzt `groupId` auf der Saison und legt Memberships an (Admin → admin); `seed-demo` legt Memberships `member` an (Upsert); `seed-demo-day`, `import-historical`, `import-statistik` setzen `groupId` bei `gameDay.create` aus der Saison bzw. `season.create` aus `getSoleGroup()`.
- [ ] **Step 4: Smoke lokal:** `pnpm seed:demo`, `pnpm bootstrap:admin smoke2@example.com "Smoke Zwei"`, prüfen per Prisma/psql, dass Memberships existieren. Ausgabe ins Report.
- [ ] **Step 5: Run** → PASS, Suite grün. **Commit** `Skripte legen Mitgliedschaften an, Testhelfer`.

### Task 6: PR, Review, Deploy

- [ ] **Step 1:** Branch `feat/tenancy-2-group-context` pushen, PR mit kurzem deutschem Body (Abgleich, Session-Claims, Dual-Write, Besitzerschutz als einzige sichtbare Änderung, Link zur Probe).
- [ ] **Step 2:** CI grün. **Step 3:** Gesamt-Review (stärkstes Modell) + `test-engineer` + `refactor-cleanup`; eine Fix-Runde, ein Re-Review.
- [ ] **Step 4:** E2E lokal: `docker compose` Postgres, `pnpm seed:demo`, `pnpm bootstrap:admin`, `pnpm dev`, `E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... pnpm e2e` → grün (prüft Admin-Buttons über die neue Session-Ableitung).
- [ ] **Step 5:** Patrick merged. **Step 6:** Deploy: Dump nach `/root/backups/<datum>-pre-tenancy-2/`, `deploy.sh`, Prüf-SQL (owner = 1, Patrick owner, Thomas admin), Login-Check. **Step 7:** Memory aktualisieren.
