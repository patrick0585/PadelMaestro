# Mandantenfähigkeit PR 6: Aufräumen – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Player.isAdmin` verschwindet, „Spieler entfernen“ beendet nur noch die Mitgliedschaft, der Leerzustand „keine Gruppe“ ist fertig, die letzten globalen Abfragen sind geprüft und begründet, und die Doku beschreibt Gruppen und Rollen – damit ist Phase 1 der Mandantenfähigkeit abgeschlossen.

**Architecture:** Eine Migration gleicht die Rollen ein letztes Mal aus `isAdmin` ab und löscht dann die Spalte; Prisma-Schema und alle Schreiber/Leser folgen, die API behält `isAdmin` als abgeleitetes Feld (`isAdminRole(role)`). `deletePlayer` setzt kein `deletedAt` mehr; ein entferntes Mitglied kann sich anmelden und sieht auf jeder Gruppenseite den Leerzustand, alle Gruppen-APIs antworten 403 (Guards aus PR 4). Die gemeinsamen Fehlerklassen der Spieler-Libs wandern in ein Modul, `getSeasonGroupId` ersetzt drei gleiche Abfragen. Das Abschluss-Audit der Abfragen ohne `groupId` wird als Tabelle in der Spec festgehalten.

**Tech Stack:** Next.js 15, Prisma 6 (PostgreSQL 16), Vitest 4, Docker-Postgres für die Probe.

**Spec:** `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md` (Datenmodell → `Player.isAdmin`; Semantik → Übergang `deletedAt`, Leerzustand; PR-Folge Punkt 6; Risiken → Abschluss-Audit).

## Global Constraints

- Jeder Commit hält `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` grün. Die Schema-Änderung (Spalte weg) kommt mit allen Code- und Testanpassungen in einem Task, damit kein Zwischenstand rot ist.
- API-Verträge unverändert: `POST/PATCH /api/players` nehmen weiter `isAdmin: boolean`, Antworten enthalten weiter `isAdmin` (abgeleitet aus der Rolle) und `role`; `session.user.isAdmin` bleibt abgeleitet. UI-Komponenten unverändert außer `NoGroupNotice`.
- `TRACKED_FIELDS` in `update.ts` bleibt `["username","name","email","isAdmin"]`; `before.isAdmin`/`after.isAdmin` im Audit werden aus der Rolle abgeleitet (Tests prüfen `changedFields` mit `toEqual`).
- Migration per Hand (kein `migrate dev`): zuerst idempotenter Rollenabgleich (`role` aus `isAdmin`, `owner` unangetastet), dann `ALTER TABLE "Player" DROP COLUMN "isAdmin"`. `prisma migrate diff` danach leer. Probe gegen Produktions-Dump vor dem Deploy.
- `deletePlayer` setzt nur noch `Membership.removedAt`; `Player.deletedAt` bleibt als Kontolöschung für Phase 2 reserviert (bestehende Werte bleiben, Login weiter gesperrt). Spec-Sätze „Übergang: Bis PR 6 …“ werden entfernt, der Leerzustand-Satz auf „ab PR 4, Feinschliff PR 6“ belassen.
- `getSoleGroup` bleibt in `bootstrap-admin.ts` und den Skripten (einzige Gruppe bis Phase 2) und wird in der Doku so benannt.
- Fehlertexte im Code englisch, UI deutsch, Commits kurz, deutsch, ohne Attribution. Tests via `resetDb` und `tests/helpers/group.ts`.

## Reihenfolge

Task 1 (Spalte weg, Entfernen ohne `deletedAt`) und Task 3 (Leerzustand, Doku, Audit-Tabelle) parallel (disjunkte Dateien). Dann Task 2 (Fehlermodul, `getSeasonGroupId`; berührt Spieler-Libs aus Task 1). Dann Task 4 (Probe) und Task 5.

## Review Focus

1. Produktions-Dump: nach der Migration ist `isAdmin` weg, Rollen unverändert (Patrick owner, Thomas admin, 4 member), Login-Daten und Zähler unverändert (Task 4).
2. Admin stuft Spieler hoch/herab per `PATCH … isAdmin`: Rolle wechselt, Antwort `isAdmin` passt, Audit `changedFields` enthält `isAdmin` genau dann, wenn sich die Rolle geändert hat (Task 1).
3. Entfernter Spieler meldet sich an: Login klappt, Dashboard/Spieltag/Rangliste/Archiv zeigen den Leerzustand, Admin-Seite leitet um, Gruppen-APIs antworten 403, Profilseite funktioniert (Task 1, 3).
4. Entfernter Spieler wird vom Admin erneut angelegt (gleiche E-Mail): wie heute 409 `email_taken` – kein Wiederaufnehmen in Phase 1 (Task 1, Test bleibt).
5. Bestehende gelöschte Konten (`deletedAt` gesetzt) bleiben beim Login gesperrt (Task 1, `authorize`-Test bleibt).

---

### Task 1: `Player.isAdmin` entfernen, Entfernen ohne `deletedAt`

**Files:**
- Create: `prisma/migrations/20261102180000_drop_player_is_admin/migration.sql`
- Modify: `prisma/schema.prisma`, `src/lib/players/create.ts`, `src/lib/players/update.ts`, `src/lib/players/delete.ts`, `src/lib/group/bootstrap-admin.ts`, `src/lib/group/set-owner.ts`, `scripts/seed-demo.ts`, `scripts/seed-initial.ts`, `scripts/diagnose-attendance.ts`, `tests/helpers/group.ts`, alle Tests mit `isAdmin: true|false` in `prisma.player.create` (24 Dateien, `grep -rln "isAdmin: true\|isAdmin: false" tests`), `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md`
- Test: `tests/unit/players/create.test.ts`, `tests/unit/players/update.test.ts`, `tests/integration/player-delete.test.ts`, `tests/integration/players-update.test.ts`, `tests/integration/auth.test.ts`

**Interfaces:**
- Produces: `CreatePlayerInput.isAdmin` bleibt (steuert die Rolle); `CreatedPlayer.isAdmin` abgeleitet; `UpdatablePlayerFields.isAdmin` bleibt; `UpdatedPlayer.isAdmin = isAdminRole(role)`; `bootstrapAdmin` ohne `isAdmin`-Write; `setGroupOwner` ohne `player.update`; `createMember` ohne `isAdmin`; `deletePlayer` setzt nur `removedAt`.

- [ ] **Step 1: Migration**

```sql
-- letzter Abgleich: Rolle aus isAdmin, Besitzer unangetastet
UPDATE "Membership" m SET "role" = CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole"
FROM "Player" p WHERE p."id" = m."playerId" AND m."role" <> 'owner'
  AND m."role" <> CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole";
ALTER TABLE "Player" DROP COLUMN "isAdmin";
```

- [ ] **Step 2: Schema** ohne `isAdmin`; `migrate deploy` lokal, `migrate diff` leer, `prisma generate`.
- [ ] **Step 3: Failing Tests** (tsc zeigt die Stellen): update.test.ts „leitet isAdmin in Antwort und Audit aus der Rolle ab“ (hochstufen → `after.isAdmin true`, `changedFields` enthält `isAdmin`; gleicher Wert → kein `isAdmin` in `changedFields`); player-delete.test.ts „setzt removedAt, lässt deletedAt null“; players-update.test.ts DELETE: Spieler kann sich danach weiter anmelden (`authorize` liefert `groupId: null`, `isAdmin: false`); auth.test.ts bestehender Fall „deletedAt blockiert Login“ bleibt.
- [ ] **Step 4: Implementieren.** `update.ts`: `before.isAdmin = isAdminRole(membership.role)`, Rolle setzen, `after.isAdmin` aus neuer Rolle; kein `isAdmin` in `tx.player.update`. `create.ts`: kein `isAdmin` in `player.create`, Rückgabe `isAdmin: input.isAdmin`. `delete.ts`: `player.update` entfällt. Skripte/Helfer: `isAdmin`-Felder entfernen (Rolle ist die Quelle). Spec: die beiden „Übergang: Bis PR 6 …“-Sätze (Semantik) und „`Player.isAdmin` wird in PR 6 entfernt …“ (Datenmodell) auf Vergangenheit setzen: „`Player.isAdmin` wurde in PR 6 entfernt.“ / „Seit PR 6 beendet Entfernen nur die Mitgliedschaft; `deletedAt` bleibt für die Kontolöschung in Phase 2.“
- [ ] **Step 5:** `tsc`, `lint`, `pnpm test` grün. **Commit** `Player.isAdmin entfernt, Entfernen beendet nur die Mitgliedschaft`.

### Task 2: Fehlermodul und `getSeasonGroupId`

**Files:**
- Create: `src/lib/players/errors.ts`, `src/lib/group/season-group.ts`
- Modify: `src/lib/players/{create,update,delete,reset-password,avatar,change-password}.ts`, `src/app/api/players/[id]/route.ts` (Aliase weg), `src/lib/ranking/compute.ts`, `src/lib/ranking/season-trend.ts`, `src/lib/player/season-stats.ts`
- Test: `tests/unit/players/errors.test.ts` (klein), bestehende Tests unverändert grün

**Interfaces:**
- Produces: `errors.ts` exportiert `PlayerNotFoundError`, `DuplicateEmailError`, `DuplicateUsernameError`, `LastAdminError` (eine Definition je Klasse, bisherige Konstruktorsignaturen); die Lib-Module re-exportieren sie, damit bestehende Importe weiter funktionieren. `getSeasonGroupId(seasonId: string): Promise<string>` (`findUniqueOrThrow`), genutzt in compute, season-trend, season-stats.

- [ ] **Step 1:** Fehlerklassen zusammenführen, Re-Exports setzen, Aliase in der Route entfernen; `getSeasonGroupId` einführen. **Step 2:** `tsc`, `lint`, `pnpm test` grün. **Commit** `Gemeinsame Spielerfehler, getSeasonGroupId`.

### Task 3: Leerzustand, Doku, Abschluss-Audit

**Files:**
- Modify: `src/components/no-group-notice.tsx`, `README.md`, `docs/DEPLOYMENT.md`, `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md` (neuer Anhang)
- Test: `tests/unit/components/no-group-notice.test.tsx`

**Interfaces:**
- Produces: `NoGroupNotice` im Stil des Archiv-Leerzustands (`src/app/archive/page.tsx`: zentrierte Karte, Icon aus `lucide-react` z. B. `Users`, Überschrift „Du bist in keiner Gruppe“, Text „Bitte einen Admin deiner Gruppe um Aufnahme. Dein Profil und Passwort kannst du weiter unter Profil verwalten.“, Link-Button zu `/profil`).

- [ ] **Step 1: Failing Test:** rendert Überschrift, Text und Link `/profil`.
- [ ] **Step 2: Implementieren.** **Step 3: Doku.** README: Abschnitt „Gruppen und Rollen“ (eine Gruppe pro Installation in Phase 1, Rollen Besitzer/Admin/Mitglied, `bootstrap:admin` legt Gruppe an und macht den ersten Admin zum Besitzer, `tenancy:set-owner <email>`, Entfernen beendet die Mitgliedschaft). DEPLOYMENT.md: nach dem `bootstrap:admin`-Schritt ein Satz zu `tenancy:set-owner`, Hinweis auf die Tenancy-Migrationen und die Probe-Protokolle. Spec: Anhang „Abschluss-Audit PR 6“ mit Tabelle aller `findFirst/findMany/count/groupBy` ohne `groupId` in `src/lib`, `src/app/api`, `src/app` (Liste per `grep -rn "\.\(findFirst\|findMany\|count\|groupBy\|aggregate\)(" src/lib src/app --include='*.ts' --include='*.tsx' | grep -v groupId`), je Zeile Datei:Zeile, Begründung (z. B. „scoped über seasonId der Session-Gruppe“, „scoped über gameDayId nach Gruppenprüfung in der Route“, „Konto-global per Design“, „Bootstrap/Skript“). Jede Stelle begründet oder als Lücke benannt (dann an den Koordinator melden).
- [ ] **Step 4:** `tsc`, `lint`, Test grün. **Commit** `Leerzustand fertig, Doku zu Gruppen und Rollen, Abschluss-Audit`.

### Task 4: Migrationsprobe und Protokoll

**Files:**
- Create: `docs/superpowers/plans/2026-11-02-tenancy-pr6-rehearsal.md`

- [ ] **Step 1:** Frischer Dump (`ssh root@217.154.83.37 'sudo -u postgres pg_dump -Fc padel_tracker'`), Docker-Postgres 16 auf 5438, `pg_restore`, Zählungen und Rollenliste vorher (`SELECT email, role FROM Membership JOIN Player`), `isAdmin`-Werte vorher.
- [ ] **Step 2:** `migrate deploy` → nur `20261102180000_drop_player_is_admin`; nachher: Spalte fehlt (`information_schema.columns`), Rollen identisch, Zähler identisch, `migrate diff` leer.
- [ ] **Step 3:** Protokoll (Struktur wie PR 4/5) inkl. Deploy-Ablauf (Dump `/root/backups/<datum>-pre-tenancy-6/`, `deploy.sh`, Prüf-SQL, Rollback: `prisma migrate resolve --rolled-back` nur wenn die Migration fehlschlägt; nach Erfolg ist die Spalte weg, Rückweg nur über den Dump) und Seitencheck. Container und Dump löschen. **Commit** `Migrationsprobe PR 6`.

### Task 5: PR, Review, E2E, Deploy

- [ ] **Step 1:** Branch `feat/tenancy-6-cleanup` pushen, PR-Body (Spalte weg, Entfernen nur Mitgliedschaft, Leerzustand, Doku, Audit-Tabelle, Probe).
- [ ] **Step 2:** CI grün. **Step 3:** Fan-out `reviewer` (stärkstes Modell) + `test-engineer` + `refactor-cleanup` + `design-reviewer` (Leerzustand) + `commit-guard`; eine Fix-Runde, ein Re-Review.
- [ ] **Step 4:** `pnpm e2e` lokal grün (Spec verlangt E2E nach PR 6).
- [ ] **Step 5:** Patrick merged. **Step 6:** Deploy nach Protokoll. **Step 7:** Memory: Phase 1 abgeschlossen; Follow-ups 13/14 erledigt, 11/12/15/16 offen.
