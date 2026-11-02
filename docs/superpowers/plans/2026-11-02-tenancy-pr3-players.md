# Mandantenfähigkeit PR 3: Spieler – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Spieler-Routen und die Admin-Seite arbeiten über die Mitgliedschaft der Session-Gruppe: Liste, Anlegen, Ändern, Entfernen, Passwort-Reset und Avatar prüfen die Zielperson als aktives Mitglied, „letzter Admin“ und Besitzerschutz zählen Rollen der Gruppe.

**Architecture:** Ein Routen-Guard `guardGroupAdmin()` liefert den `GroupContext` aus der Session (401/403 als Antwort). Zwei Helfer `findGroupMembership()` und `listActiveMembers()` ersetzen `Player WHERE deletedAt IS NULL` als Spielerquelle. Die Lib-Funktionen `createPlayer`, `updatePlayer`, `deletePlayer`, `resetPlayerPassword` erhalten `groupId` als Pflichtparameter und werfen `PlayerNotFoundError`, wenn die Zielperson kein aktives Mitglied dieser Gruppe ist; `getSoleGroup` verschwindet aus `src/lib/players`. `Player.isAdmin` wird weiter mitgeschrieben (Dual-Write bis PR 6), aber nicht mehr gelesen.

**Tech Stack:** Next.js 15, Prisma 6 (PostgreSQL 16), next-auth 5 beta (JWT), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md` (Session und Autorisierung → Ressourcenprüfung; Abfragen → Spielerlisten, Admin-Schalter; PR-Folge Punkt 3).

## Global Constraints

- Jeder Commit hält `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` grün.
- Verhaltensneutral für die Live-Gruppe (eine Gruppe, alle Spieler Mitglied, Rollen gespiegelt). Einzige gewollte Abweichung: Routen ohne Session antworten einheitlich 401 statt teils 403.
- Fremde Gruppe oder entferntes Mitglied als Ziel → 404 `not_found`, nie 403 (Spec „Ressourcenprüfung“).
- `Player.isAdmin` wird bei Anlegen/Ändern weiter gesetzt, aber nirgends mehr gelesen; „letzter Admin“ zählt `Membership.role IN (admin, owner)` der Gruppe mit `removedAt IS NULL`. `TRACKED_FIELDS` in `update.ts` bleibt unverändert.
- **Entfernen setzt bis PR 6 weiterhin `Player.deletedAt`** zusätzlich zu `Membership.removedAt`, damit der Login eines entfernten Spielers gesperrt bleibt (Spec „Migration“ Punkt 4). PR 6 liefert den Leerzustand „keine Gruppe“ und nimmt `deletedAt` dort heraus. Diese Zeile wird als Ergänzung in die Spec (Abschnitt „Semantik“) übernommen.
- Avatar-Lib (`src/lib/players/avatar.ts`) bleibt unverändert; sie dient auch den Profil-Routen (Selbstbedienung). Die Mitgliedschaftsprüfung liegt für Avatare in der Admin-Route.
- Spieler anlegen: E-Mail existiert bereits (auch als entferntes Mitglied) → 409 `email_taken` wie heute.
- Saison, Spieltag-Suche, Joker-Zähler auf der Admin-Seite bleiben global (PR 4). Die 15 Testdateien anderer Routen, die `auth()` mocken, bleiben unangetastet.
- Fehlertexte im Code englisch, UI-Texte deutsch, Commits kurz, deutsch, ohne Attribution.
- Tests gegen lokale Postgres (5433) über `resetDb` und die Helfer aus `tests/helpers/group.ts`; `prisma.player.create` mit `isAdmin` in den Spieler-Tests wird durch `createMember` ersetzt.

## Review Focus

1. Admin von Gruppe A ruft `PATCH /api/players/<id-aus-B>` auf: 404, kein Schreibzugriff (Task 3).
2. Gruppe hat Besitzer plus genau einen Admin; der Admin wird herabgestuft: erlaubt, weil der Besitzer zählt. Gruppe hat nur den Besitzer als Admin-Rolle und dieser soll herabgestuft werden: 409 `owner_protected` vor `last_admin` (Task 3).
3. Entferntes Mitglied (`removedAt` gesetzt, `deletedAt` evtl. null) als Ziel von Passwort-Reset oder Avatar-Upload: 404 (Task 5, 6).
4. Spieler ohne Gruppe (Session `groupId: null`) ruft Admin-Routen auf: 403, Avatar eines fremden Spielers: 404, eigener Avatar: 200 (Task 1, 6).
5. Admin legt Spieler an, während ein geplanter Spieltag einer anderen Gruppe existiert: der Neue wird nur an Spieltage der eigenen Gruppe gehängt (Task 2).

---

### Task 1: Guard, Mitgliedschafts-Helfer, Testhelfer

**Files:**
- Modify: `src/lib/auth/group-context.ts`
- Create: `src/lib/auth/route-guard.ts`
- Modify: `src/lib/group/active-membership.ts`
- Create: `src/lib/group/members.ts`
- Modify: `tests/helpers/group.ts`
- Test: `tests/unit/auth/route-guard.test.ts`, `tests/integration/members.test.ts`

**Interfaces:**
- Produces in `group-context.ts`: `contextFromSession(session: Session | null): GroupContext | null` (reine Funktion; `getGroupContext()` ruft `auth()` und delegiert).
- Produces in `route-guard.ts`: `type GuardResult = { ctx: GroupContext; response: null } | { ctx: null; response: NextResponse }`; `guardGroupAdmin(): Promise<GuardResult>`: keine Session → 401 `{ error: "unauthorized" }`; Session ohne Gruppe oder Rolle `member` → 403 `{ error: "forbidden" }`; sonst `ctx`.
- Produces in `active-membership.ts`: `findGroupMembership(db: Prisma.TransactionClient | PrismaClient, groupId: string, playerId: string): Promise<{ role: GroupRole } | null>` (nur `removedAt: null`).
- Produces in `members.ts`: `type MemberRow = { id: string; name: string; email: string; username: string | null; role: GroupRole; hasPassword: boolean; avatarVersion: number }`; `listActiveMembers(groupId: string): Promise<MemberRow[]>`, sortiert `player.name asc` per Prisma `orderBy`.
- Produces in `tests/helpers/group.ts`: `createMember` akzeptiert zusätzlich `username?: string | null`; `sessionFor(player, groupId: string | null, role: GroupRole | null)` (für Sessions ohne Gruppe); neu `setupGroupWithAdmin(role: "owner" | "admin" = "owner"): Promise<{ group: Group; admin: Player; session: ReturnType<typeof sessionFor> }>` (Admin `admin@example.com`, Name `Admin`, `passwordHash: "x"`).

- [ ] **Step 1: Failing Tests**
  - `route-guard.test.ts` (mockt `@/auth` wie `group-context.test.ts`): „401 ohne Session“, „403 bei groupId null“, „403 für member“, „liefert ctx für admin“, „liefert ctx für owner“ (jeweils `response?.status` bzw. `ctx` prüfen).
  - `members.test.ts`: „findGroupMembership liefert Rolle des aktiven Mitglieds“, „null für entferntes Mitglied“, „null für Mitglied einer anderen Gruppe“; „listActiveMembers enthält nur aktive Mitglieder der Gruppe, sortiert nach Name, mit hasPassword und role“ (zwei Gruppen, ein entferntes Mitglied, ein Mitglied ohne Passwort).
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/auth/route-guard.test.ts tests/integration/members.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementieren** gemäß Interfaces. `listActiveMembers` per `prisma.membership.findMany({ where: { groupId, removedAt: null }, orderBy: { player: { name: "asc" } }, select: { role, player: { select: { id, name, email, username, passwordHash, avatarVersion } } } })`.
- [ ] **Step 4: Run** → PASS; `pnpm vitest run tests/unit/auth/group-context.test.ts` weiterhin grün.
- [ ] **Step 5:** `pnpm exec tsc --noEmit && pnpm lint` → grün. **Commit** `Routen-Guard und Mitgliedschafts-Helfer`.

### Task 2: Spieler anlegen und auflisten

**Files:**
- Modify: `src/lib/players/create.ts`, `src/app/api/players/route.ts`
- Test: `tests/unit/players/create.test.ts`, `tests/integration/players-create.test.ts`

**Interfaces:**
- Consumes: `guardGroupAdmin`, `listActiveMembers`, `setupGroupWithAdmin`, `createMember`, `createTestGroup`, `sessionFor` (Task 1).
- Produces: `CreatePlayerInput.groupId: string` (Pflicht); `getSoleGroup`-Import entfällt. `GET /api/players` liefert `MemberRow` ohne `avatarVersion` plus wie bisher `isAdmin` (= `isAdminRole(role)`) und zusätzlich `role`.

- [ ] **Step 1: Tests umbauen und ergänzen**
  - Beide Dateien: Admin über `setupGroupWithAdmin()`, Session über `authMock.mockResolvedValue(session)`; `createPlayer` erhält `groupId: group.id`.
  - `create.test.ts` neu: „legt die Mitgliedschaft in der übergebenen Gruppe an, nicht in einer anderen“ (zwei Gruppen; Membership nur in `group.id`, Rolle `admin` bei `isAdmin: true`).
  - `players-create.test.ts` neu: „hängt den Neuen nur an geplante Spieltage der eigenen Gruppe“ (Spieltag mit `groupId` der fremden Gruppe bekommt keinen Teilnehmer); „GET listet nur aktive Mitglieder der Session-Gruppe“ (fremdes Mitglied und entferntes Mitglied fehlen, `role` im Body); „POST ohne Session → 401“; „POST mit Session ohne Gruppe → 403“ (`sessionFor(player, null, null)`).
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/players/create.test.ts tests/integration/players-create.test.ts` → FAIL.
- [ ] **Step 3: Implementieren.** `create.ts`: Membership mit `input.groupId`; `plannedDays` mit `where: { status: "planned", groupId: input.groupId }`. `route.ts`: beide Handler beginnen mit `const g = await guardGroupAdmin(); if (g.response) return g.response;`; POST reicht `groupId: g.ctx.groupId` durch; GET mappt `listActiveMembers(g.ctx.groupId)`.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint` grün. **Commit** `Spieler anlegen und Liste über Mitgliedschaft`.

### Task 3: Spieler ändern

**Files:**
- Modify: `src/lib/players/update.ts`, `src/app/api/players/[id]/route.ts` (nur `PATCH`)
- Test: `tests/unit/players/update.test.ts`, `tests/integration/players-update.test.ts` (nur `describe("PATCH …")`)

**Interfaces:**
- Consumes: `guardGroupAdmin`, `findGroupMembership`, Testhelfer (Task 1).
- Produces: `UpdatePlayerInput.groupId: string`. Importe von `findActiveMembership` und `getSoleGroup` in `update.ts` entfallen.

- [ ] **Step 1: Tests umbauen und ergänzen** (Admin/Ziel über Helfer, `groupId` überall; bestehende Fälle `OwnerProtectedError`, Username/E-Mail-Dubletten, Audit-Payload bleiben):
  - update.test.ts: „PlayerNotFoundError für Mitglied einer anderen Gruppe“; „PlayerNotFoundError für entferntes Mitglied“; „Herabstufen des einzigen Admins erlaubt, wenn ein Besitzer existiert“ (Rolle danach `member`, `Player.isAdmin` false); „LastAdminError, wenn der Spieler die einzige Admin-/Besitzerrolle der Gruppe trägt“ (Admin ohne Besitzer stuft sich selbst herab); „Admin einer anderen Gruppe zählt nicht als verbleibender Admin“; „setzt Rolle auf admin beim Hochstufen“.
  - players-update.test.ts: „404 für Spieler einer anderen Gruppe“; „409 owner_protected beim Herabstufen des Besitzers“ bleibt.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** In der Transaktion: `membership = await findGroupMembership(tx, input.groupId, input.playerId)`; `!membership || !existing || existing.deletedAt` → `PlayerNotFoundError`. Bei `isAdmin !== undefined`: `owner` und `false` → `OwnerProtectedError`; `membership.role === "admin"` und `false` → `tx.membership.count({ where: { groupId, removedAt: null, role: { in: ["admin", "owner"] }, playerId: { not } } }) === 0` → `LastAdminError`; sonst `tx.membership.update({ where: { groupId_playerId }, data: { role: roleForAdminFlag(isAdmin) } })`, außer bei `owner`. `Player.isAdmin` weiter in `data` schreiben. Route: Guard statt `session.user.isAdmin`, `groupId` durchreichen.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Spieler ändern über Mitgliedschaft, letzter Admin zählt Rollen`.

### Task 4: Spieler entfernen

**Files:**
- Modify: `src/lib/players/delete.ts`, `src/app/api/players/[id]/route.ts` (nur `DELETE`)
- Test: `tests/integration/player-delete.test.ts`, `tests/integration/players-update.test.ts` (nur `describe("DELETE …")`)

**Interfaces:**
- Consumes: `guardGroupAdmin`, `findGroupMembership`, Testhelfer (Task 1).
- Produces: `DeletePlayerInput.groupId: string`.

- [ ] **Step 1: Tests umbauen und ergänzen** (`makeSeasonAndDay` setzt `groupId` auf Saison und Spieltag):
  - player-delete.test.ts: „setzt removedAt auf der Gruppenmitgliedschaft und deletedAt auf dem Spieler“; „PlayerNotFoundError für Mitglied einer anderen Gruppe“; „PlayerNotFoundError für bereits entferntes Mitglied“; „LastAdminError, wenn keine andere Admin-/Besitzerrolle in der Gruppe bleibt“; „Entfernen des einzigen Admins erlaubt, wenn ein Besitzer existiert“; „ActiveParticipationError nur für Spieltage der eigenen Gruppe“ (bestätigte Teilnahme an fremdem Spieltag blockiert nicht); bestehende Fälle `SelfDeleteError`, `OwnerProtectedError`, Audit bleiben.
  - players-update.test.ts DELETE: „404 für Spieler einer anderen Gruppe“; „401 ohne Session“ bleibt.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** `findGroupMembership(tx, groupId, playerId)` → null oder Player fehlt/`deletedAt` → `PlayerNotFoundError`; Reihenfolge: NotFound, Self, Owner (`membership.role === "owner"`), LastAdmin (Count wie Task 3, nur wenn `membership.role === "admin"`), ActiveParticipation mit `gameDay: { groupId, status: { in: [...] } }`. Danach `tx.membership.update({ where: { groupId_playerId }, data: { removedAt: now } })` und `tx.player.update({ data: { deletedAt: now } })`; Audit unverändert.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Spieler entfernen beendet die Gruppenmitgliedschaft`.

### Task 5: Passwort-Reset

**Files:**
- Modify: `src/lib/players/reset-password.ts`, `src/app/api/players/[id]/password/route.ts`
- Test: `tests/unit/players/reset-password.test.ts`, `tests/integration/players-reset.test.ts`

**Interfaces:**
- Consumes: `guardGroupAdmin`, `findGroupMembership`, Testhelfer (Task 1).
- Produces: `ResetPlayerPasswordInput.groupId: string`.

- [ ] **Step 1: Tests umbauen und ergänzen:** reset-password.test.ts: „PlayerNotFoundError für Mitglied einer anderen Gruppe“, „für entferntes Mitglied“. players-reset.test.ts: „404 für Spieler einer anderen Gruppe“, „401 ohne Session“; bestehende 403 für member, 400, 429 bleiben.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** `findGroupMembership(prisma, groupId, playerId)` ersetzt den `deletedAt`-Lookup (null → `PlayerNotFoundError`). Route: Guard, Rate-Limit-Schlüssel weiter `g.ctx.userId`, `groupId` durchreichen.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Passwort-Reset nur für Mitglieder der Gruppe`.

### Task 6: Avatar-Routen

**Files:**
- Modify: `src/app/api/players/[id]/avatar/route.ts`
- Test: `tests/integration/players-avatar.test.ts` (nur die drei `describe` zu `/api/players/[id]/avatar`; Lib- und Profil-Tests unverändert)

**Interfaces:**
- Consumes: `guardGroupAdmin`, `findGroupMembership`, `contextFromSession`, Testhelfer (Task 1).

- [ ] **Step 1: Tests umbauen und ergänzen:** Admin über `setupGroupWithAdmin`, Ziele über `createMember`. Neu: PUT/DELETE „404 für Spieler einer anderen Gruppe“; GET „404 für Spieler einer anderen Gruppe“, „200 für den eigenen Avatar ohne Gruppe“ (Session `groupId: null`), „404 für fremden Avatar ohne Gruppe“. Bestehende 401/403/413 bleiben.
- [ ] **Step 2: Run** `pnpm vitest run tests/integration/players-avatar.test.ts` → FAIL. **Step 3: Implementieren.** PUT/DELETE: Guard, dann `findGroupMembership(prisma, g.ctx.groupId, id)` → null → 404 `not_found` vor dem Lib-Aufruf. GET: `auth()` → 401; `id === session.user.id` → wie heute; sonst `ctx = contextFromSession(session)`; `!ctx || !(await findGroupMembership(prisma, ctx.groupId, id))` → 404.
- [ ] **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Avatar-Routen prüfen Mitgliedschaft`.

### Task 7: Admin-Seite und Spec-Ergänzung

**Files:**
- Modify: `src/app/admin/page.tsx`, `src/app/admin/players-section.tsx`, `src/app/admin/edit-player-dialog.tsx`, `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md`
- Test: `tests/unit/components/players-section.test.tsx`

**Interfaces:**
- Consumes: `contextFromSession`, `isAdminRole`, `listActiveMembers` (Task 1).
- Produces: `PlayerRow.role: GroupRole` (zusätzlich zu `isAdmin`); `EditablePlayer.role: GroupRole`.

- [ ] **Step 1: Failing Test** `players-section.test.tsx` (Rendering wie `tests/unit/components/*.test.tsx`): „zeigt Badge ‚Besitzer‘ für owner und ‚Admin‘ für admin“; „blendet den Löschen-Button für den Besitzer aus“ (kein `aria-label="Spieler <Name> löschen"` für owner, vorhanden für member).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** `page.tsx`: `session = await auth()`, `!session` → `/login`; `ctx = contextFromSession(session)`; `!ctx || !isAdminRole(ctx.role)` → `/ranking`; `players = await listActiveMembers(ctx.groupId)`; `playersForUi` übernimmt `role` und `isAdmin: isAdminRole(role)`; Roster und Joker-Zähler nutzen dieselbe Liste. `players-section.tsx`: Badge `Besitzer` (variant `primary`) für owner, sonst `Admin` bei `isAdmin`; Löschen-Button nur für `role !== "owner"`; `role` an `EditPlayerDialog` durchreichen. `edit-player-dialog.tsx`: Admin-Checkbox `disabled` bei `player.role === "owner"`.
- [ ] **Step 4: Spec ergänzen:** Abschnitt „Semantik“, nach „Der bisherige Soft-Delete …“: „Übergang: Bis PR 6 setzt „Spieler entfernen“ zusätzlich `Player.deletedAt`, damit der Login gesperrt bleibt; PR 6 nimmt das mit dem Leerzustand heraus.“ PR-Folge Punkt 4: Begründung „weil Entfernen ab PR 3 nur die Mitgliedschaft beendet“ ersetzen durch „weil Rolle und Entfernen ab PR 3 auf der Mitgliedschaft geführt werden“.
- [ ] **Step 5: Run** → PASS; `pnpm exec tsc --noEmit && pnpm lint && pnpm test` → grün. **Commit** `Admin-Seite listet Mitglieder, Besitzer sichtbar`.

### Task 8: PR, Review, Deploy

- [ ] **Step 1:** Branch `feat/tenancy-3-players` pushen, PR mit kurzem deutschem Body (Mitgliedschaft als Spielerquelle, 404 für fremde Gruppe, letzter Admin über Rollen, 401-Vereinheitlichung, deletedAt-Übergang).
- [ ] **Step 2:** CI grün. **Step 3:** Fan-out `reviewer` + `test-engineer` + `refactor-cleanup` + `design-reviewer` (Admin-UI), `security-review`-Skill für die Routen; eine Fix-Runde, ein Re-Review.
- [ ] **Step 4:** Smoke lokal: `resetDb`-äquivalent, `pnpm seed:demo`, `pnpm bootstrap:admin`, `pnpm dev`; Admin-Seite: Besitzer-Badge, Spieler anlegen, Admin-Schalter, Passwort setzen, Avatar, Entfernen; danach `pnpm e2e` → grün.
- [ ] **Step 5:** Patrick merged. **Step 6:** Deploy: Dump nach `/root/backups/<datum>-pre-tenancy-3/`, `deploy.sh` (Health-Check auf :3000 schlägt fälschlich fehl), Login, Admin-Seite (Patrick `Besitzer`, Thomas `Admin`), Spieltag, Rangliste prüfen. **Step 7:** Memory aktualisieren.
