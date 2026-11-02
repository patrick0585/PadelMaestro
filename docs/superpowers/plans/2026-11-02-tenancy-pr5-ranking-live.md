# Mandantenfähigkeit PR 5: Rangliste, Profil, Live – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rangliste, Saisonverlauf und Partner-Statistik nehmen die aktiven Mitglieder der Saison-Gruppe als Spielerquelle, der SSE-Endpunkt prüft die Gruppe vor dem Öffnen des Streams, und alle Spieltag-, Joker- und Teilnahme-Aktionen schreiben `groupId` ins AuditLog.

**Architecture:** Ein Helfer `activeMemberPlayers(groupId, playerIds)` in `src/lib/group/members.ts` liefert Name und Avatar nur für aktive Mitglieder; `computeRanking`, `buildSeasonTrend` und `computePlayerSeasonStats` lösen die Gruppe über `Season.groupId` auf und ersetzen damit `Player.deletedAt IS NULL`. Das Ranking-SQL joint `Membership` statt auf `deletedAt` zu filtern. Die SSE-Route nutzt `guardMember` und `findGroupGameDay`. Die Lib-Funktionen der Spieltag-Aktionen haben den Spieltag bereits geladen und schreiben dessen `groupId` ins AuditLog; Signaturen bleiben. Keine Migration. Eine Probe gegen den Produktions-Dump vergleicht Rangliste, Verlauf und Profilstatistik vor und nach der Umstellung.

**Tech Stack:** Next.js 15, Prisma 6 (PostgreSQL 16), Vitest 4, Docker-Postgres für die Probe.

**Spec:** `docs/superpowers/specs/2026-11-02-multi-tenancy-design.md` (Abfragen → „Ranking-SQL, Verlaufsdiagramm, Partner-Statistik“, „Profil-Statistiken“, „AuditLog“; Session und Autorisierung → „SSE-Endpunkt“; PR-Folge Punkt 5).

## Global Constraints

- Jeder Commit hält `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` grün.
- Verhaltensneutral für die Live-Gruppe: Rangliste, Verlauf und Profilstatistik liefern auf dem Produktions-Dump vor und nach der Umstellung identische Ergebnisse (Probe, Task 1 und Task 5).
- Spielerquelle = `Membership` der Saison-Gruppe mit `removedAt IS NULL`; entfernte Mitglieder und Mitglieder anderer Gruppen erscheinen nicht in Rangliste, Verlauf, Partner-Statistik. `game-day/summary.ts` (Archiv-Podium), `live-standings.ts` und `partnership-counts.tsx` bleiben unverändert (zeigen alle Spieler der Matches).
- Signaturen `computeRanking(seasonId)`, `buildSeasonTrend(seasonId)`, `computePlayerSeasonStats(playerId, seasonId)` und aller Spieltag-Lib-Funktionen bleiben; Rückgabetypen unverändert.
- SSE: ohne Session 401, ohne Gruppe 403, Spieltag fremder Gruppe 404 – alles vor dem Öffnen des Streams; Stream-Inhalt unverändert.
- AuditLog: `groupId` = `GameDay.groupId` bei `game_day.*`, `attendance.*`, `joker.*`, `match.*`-Aktionen; `actorId` unverändert.
- Keine Migration, kein Schema-Change. Fehlertexte englisch, UI deutsch, Commits kurz, deutsch, ohne Attribution. Tests via `resetDb` und `tests/helpers/group.ts`.

## Reihenfolge

Task 1 (Probe „vorher“, Code-Stand = main) zuerst und allein, damit die Messung nicht in halb geänderten Code läuft. Danach Task 2, 3, 4 parallel (disjunkte Dateien). Dann Task 5 (Probe „nachher“, Protokoll) und Task 6.

## Review Focus

1. Produktions-Dump: Rangliste beider Saisons, Verlauf und Profilstatistik jedes Spielers vor/nach identisch (Task 1/5).
2. Spieler mit Matches in der Saison, aber Mitglied nur in Gruppe B (konstruiert): nicht in Gruppe A's Rangliste; entferntes Mitglied mit Matches: nicht in Rangliste/Verlauf/Partnern, aber weiter im Archiv-Podium (Task 2).
3. SSE: Mitglied von Gruppe A öffnet Events eines Spieltags aus B: 404, kein Stream, kein Listener registriert (Task 3).
4. Audit: nach Start, Beenden, Löschen, Joker, Extra-Match, Teilnahme-Änderung trägt jeder neue AuditLog-Eintrag die `groupId` des Spieltags (Task 4).
5. Partner-Statistik eines Spielers, dessen Partner entfernt wurde: Partner fehlt (wie heute bei gelöschten Spielern), Summen der übrigen unverändert (Task 2).

---

### Task 1: Probe „vorher“ gegen den Produktions-Dump

**Files:**
- Create: `scripts/dev/tenancy-snapshot.ts` (Snapshot-Skript, bleibt im Repo für PR 6)

**Interfaces:**
- Produces: `pnpm exec tsx scripts/dev/tenancy-snapshot.ts <out.json>` schreibt `{ seasons: [{ id, name, ranking: RankingRow[], trend: SeasonTrend, stats: { [playerId]: PlayerSeasonStats } }] }` für alle Saisons, Spieler je Saison = alle Spieler mit Matches oder Jokern in der Saison, deterministisch sortiert (Saison nach `year`, Spieler nach `id`). Nutzt `../../src/lib/...`-Importe wie die anderen Skripte in `scripts/`.

- [ ] **Step 1:** Frischen Dump holen: `ssh root@217.154.83.37 'sudo -u postgres pg_dump -Fc padel_tracker' > <scratch>/prod-pr5.dump` (Produktion ist nach PR 4 migriert). Wegwerf-Postgres 16 per Docker auf Port 5438 (`padel-probe-pr5`), `pg_restore --no-owner --no-acl`.
- [ ] **Step 2:** Skript schreiben; mit `DATABASE_URL=…5438…` ausführen → `<scratch>/before.json`. Plausibilität: 2 Saisons, Rangliste der aktiven Saison mit 6 Zeilen.
- [ ] **Step 3:** Container laufen lassen (Task 5 braucht ihn). `tsc`, `lint`. **Commit** `Snapshot-Skript für Rangliste und Statistik`.

### Task 2: Mitglieder als Spielerquelle

**Files:**
- Modify: `src/lib/group/members.ts`, `src/lib/ranking/compute.ts`, `src/lib/ranking/season-trend.ts`, `src/lib/player/season-stats.ts`
- Test: `tests/integration/members.test.ts`, `tests/integration/ranking.test.ts`, `tests/integration/season-trend.test.ts`, `tests/integration/player-season-stats.test.ts`

**Interfaces:**
- Produces in `members.ts`: `activeMemberPlayers(groupId: string, playerIds: string[]): Promise<{ id: string; name: string; avatarVersion: number }[]>` (nur `removedAt: null`, leeres Array bei leerer Liste).
- `computeRanking`: lädt `season.groupId` (`findUniqueOrThrow`), SQL joint `"Membership" ms ON ms."playerId" = p.id AND ms."groupId" = ${groupId} AND ms."removedAt" IS NULL` in `played` und im äußeren SELECT; beide `p."deletedAt" IS NULL` entfallen.
- `buildSeasonTrend`: `activePlayers` aus `activeMemberPlayers(season.groupId, ids)` statt `deletedAt`-Filter.
- `computePlayerSeasonStats`: Partnernamen aus `activeMemberPlayers(season.groupId, partnerIds)`.

- [ ] **Step 1: Failing Tests.** Spieler in diesen vier Testdateien über `createMember(group.id, …)` statt `prisma.player.create`. Neu: ranking „schließt Mitglieder anderer Gruppen aus“ (Spieler mit Match in Saison A, aber nur Mitglied in B → fehlt), „schließt entfernte Mitglieder aus“ (`removedAt` gesetzt, `deletedAt` null → fehlt; Summen der anderen unverändert); season-trend „entferntes Mitglied fehlt im Verlauf“; player-season-stats „entfernter Partner fehlt, übrige Partner unverändert“; members „activeMemberPlayers liefert nur aktive Mitglieder der Gruppe“.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `Rangliste, Verlauf und Partner aus Mitgliedschaften`.

### Task 3: SSE-Autorisierung

**Files:**
- Modify: `src/app/api/game-day/[id]/events/route.ts`
- Test: `tests/integration/game-day-events-api.test.ts`

**Interfaces:**
- Consumes: `guardMember` (`src/lib/auth/route-guard.ts`), `findGroupGameDay` (`src/lib/game-day/group-scope.ts`), `getActiveSubscriberCount` (`src/lib/game-day/live-broadcast.ts`).

- [ ] **Step 1: Failing Tests** (mockt `@/auth`, `sessionFor`): „401 ohne Session“, „403 ohne Gruppe“, „404 für Spieltag einer anderen Gruppe, kein Subscriber registriert“ (`getActiveSubscriberCount(dayB.id) === 0`), „200 mit text/event-stream für eigenen Spieltag“ (Stream danach per `res.body?.cancel()` schließen, `__resetLiveBroadcastForTests()` im `afterEach`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** `const g = await guardMember(); if (g.response) return g.response;` dann `findGroupGameDay(g.ctx.groupId, gameDayId)` → `new Response("Not Found", { status: 404 })`; Rest unverändert. **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`. **Commit** `SSE prüft die Gruppe vor dem Stream`.

### Task 4: AuditLog mit Gruppe

**Files:**
- Modify: `src/lib/game-day/start.ts`, `finish.ts`, `delete.ts`, `shuffle-preview.ts`, `add-extra-match.ts`, `remove-extra-match.ts`, `attendance.ts` (beide Audit-Stellen), `src/lib/joker/use.ts` (beide Audit-Stellen)
- Test: `tests/integration/start.test.ts`, `tests/unit/game-day/finish.test.ts`, `tests/unit/game-day/delete.test.ts`, `tests/integration/shuffle-preview.test.ts`, `tests/unit/game-day/add-extra-match.test.ts`, `tests/unit/game-day/remove-extra-match.test.ts`, `tests/integration/attendance.test.ts`, `tests/integration/joker.test.ts`

**Interfaces:**
- Produces: jeder `tx.auditLog.create` dieser Dateien erhält `groupId: day.groupId` (den bereits geladenen Spieltag; wo das Select eingeschränkt ist – `shuffle-preview.ts`, `joker/use.ts` – `groupId: true` ins Select aufnehmen). Keine Signaturänderung.

- [ ] **Step 1: Failing Tests:** je Datei eine Assertion im bestehenden Audit-Test (oder ein neuer kleiner Test): `auditLog.findFirst({ where: { action } })` → `groupId === group.id`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implementieren.** **Step 4: Run** → PASS. **Step 5:** `tsc`, `lint`, `pnpm test` grün. **Commit** `AuditLog trägt die Gruppe des Spieltags`.

### Task 5: Probe „nachher“ und Protokoll

**Files:**
- Create: `docs/superpowers/plans/2026-11-02-tenancy-pr5-rehearsal.md`

- [ ] **Step 1:** `DATABASE_URL=…5438… pnpm exec tsx scripts/dev/tenancy-snapshot.ts <scratch>/after.json`; `diff <(jq -S . before.json) <(jq -S . after.json)` → leer. Bei Abweichung: Ursache klären (erwartet keine; Produktion hat 6 aktive Mitglieder = 6 Spieler ohne `deletedAt`).
- [ ] **Step 2:** Protokoll (Datum, Dump-Alter, Vorgehen, Ergebnis „identisch“, Zeilenzahlen, Deploy-Ablauf: Dump nach `/root/backups/<datum>-pre-tenancy-5/`, `deploy.sh` ohne Migration, Login/Rangliste/Spieltag-Live prüfen). Container und Dumps löschen. **Commit** `Probe PR 5: Rangliste identisch`.

### Task 6: PR, Review, Deploy

- [ ] **Step 1:** Branch `feat/tenancy-5-ranking-live` pushen, PR mit kurzem deutschem Body (Spielerquelle Mitgliedschaft, SSE-Gruppenprüfung, AuditLog-Gruppe, Probe identisch, keine Migration).
- [ ] **Step 2:** CI grün. **Step 3:** Fan-out `reviewer` (stärkstes Modell, Security-Lens SSE + SQL) + `test-engineer` + `refactor-cleanup` + `commit-guard`; eine Fix-Runde, ein Re-Review.
- [ ] **Step 4:** Lokal `pnpm e2e` (Live-Updates laufen über SSE) → grün.
- [ ] **Step 5:** Patrick merged. **Step 6:** Deploy nach Protokoll. **Step 7:** Memory aktualisieren.
