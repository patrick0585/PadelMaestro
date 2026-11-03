# Phase 2, PR 4 „Konto" – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Datenexport als JSON und Kontolöschung mit Anonymisierung aus dem Profil heraus.

**Architecture:** Zwei Lib-Module `src/lib/account/export.ts` und `src/lib/account/delete.ts`, zwei Routen `GET /api/profile/export` und `DELETE /api/profile` (Session, Rate-Limit pro Konto, Fehlercodes `snake_case`), eine Profilkarte „Konto" mit Export-Link und Lösch-Dialog. Kein Schema-Wechsel: die Löschung anonymisiert den `Player` in place (`deletedAt`), bestehende Filter (`removedAt` in Ranglisten, `deletedAt` im Token-Refresh und beim Login) sorgen für die Darstellung und den Logout.

**Tech Stack:** Next.js 15 (App Router), next-auth 5 beta (JWT; Refresh wirft `deletedAt`-Konten raus), Prisma 6/Postgres, zod 4, vitest 4 (Integrationstests gegen echte DB), Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-02-public-use-design.md` (Abschnitt „Konto löschen und Datenexport", „PR-Folge" Punkt 4).

**Rulings des Planers:**

- Route für die Löschung ist `DELETE /api/profile` mit Body `{ password }` (die Spec nennt keine Route). `WrongPasswordError` wird aus `src/lib/group/delete.ts` nach `src/lib/account/errors.ts` verschoben und dort re-exportiert, damit beide Löschwege dieselbe Klasse nutzen.
- Audit-`entityType` für Personen heißt im Code `"Player"` (Spec schreibt `"player"`); die Anonymisierung trifft alle Zeilen mit `entityType = "Player"` und `entityId = <id>`, unabhängig von der Aktion.
- Konten ohne Passwort („Nur Stats") können sich nicht löschen, weil sie sich nicht anmelden können; der Admin entfernt sie wie bisher.
- Der Export enthält Match-Mitspieler nur mit Namen (keine IDs anderer Personen), Audit-Zeilen nur die eigenen als Actor.
- Keine Migration, keine Downtime, kein `.env`-Eintrag. Statt Migrationsprobe nur der Gesamtlauf.

## Global Constraints

- Branch `feat/public-4-account`, Worktree unter `.claude/worktrees/`. Kein Merge und kein Deploy ohne Patricks Go.
- Export: `GET /api/profile/export`, Session Pflicht (401), Limit 5/h pro Konto (`rateLimit(\`profile-export:${userId}\`)`), Antwort `application/json` mit `Content-Disposition: attachment; filename="padelmaestro-export-<YYYY-MM-DD>.json"`, Audit `account.export` (actor = Person, groupId null, entityType "Player", entityId = Person, ohne Payload). Inhalt: `account { id, name, email, username, createdAt }`, `memberships[] { group, role, joinedAt, removedAt }`, `participations[] { date, group, attendance }`, `matches[] { date, group, matchNumber, team1: [name, name], team2: [name, name], team1Score, team2Score }`, `jokers[] { date, group, season, pointsCredited, gamesCredited }`, `auditLogs[] { action, entityType, entityId, createdAt, payload }` (nur Zeilen mit `actorId` = Person), `avatar { mimeType, base64 } | null`, `exportedAt`.
- Löschung: `DELETE /api/profile`, Session Pflicht (401), Limit 5/h pro Konto (`profile-delete:<userId>`), Body `{ password: z.string().min(1) }` (400 `invalid`), 403 `wrong_password` (auch für Konten ohne `passwordHash`), 409 `owner_of_group` mit Body `{ error, groups: [{ id, name }] }`, solange die Person irgendwo aktive Mitgliedschaft mit Rolle `owner` hat; sonst 204.
- Lösch-Transaktion (eine Transaktion): alle aktiven Mitgliedschaften `removedAt = now`; `GameDayParticipant` an Spieltagen mit `status = planned` löschen (laufende und beendete behalten Teilnahme und Matches); Player: `name = "Gelöschter Spieler"`, `email = "geloescht-<id>@anonym.invalid"`, `username = null`, `passwordHash = null`, `pendingEmail = null`, `emailVerifiedAt = null`, `avatarData = null`, `avatarMimeType = null`, `avatarVersion = 0`, `telegramId = null`, `activeGroupId = null`, `deletedAt = now`, `sessionVersion + 1`; alle `EmailToken` der Person löschen; `InvitationUse` bleiben; `AuditLog`-Zeilen mit `entityType = "Player"` und `entityId = <id>` bekommen `payload = { anonymised: true }`; zuletzt Audit `account.delete` (actor = Person, groupId null, entityType "Player", entityId = Person, payload null).
- Nach 204 meldet der Client die Person ab (`signOut({ callbackUrl: "/login" })`); der Token-Refresh wirft gelöschte Konten ohnehin raus.
- Darstellung: anonymisierte Personen erscheinen über ihren Namen „Gelöschter Spieler" (Archiv-Podium, Match-Zeilen), Avatar fällt auf Initialen „GS" zurück, in Ranglisten sind sie durch `removedAt` ausgeblendet. Keine UI-Änderung nötig, aber Tests.
- Texte Deutsch; Design wie bisher (Karte `rounded-2xl border border-border bg-surface`, `Dialog`, `Button`, `Input`, `InlineMessage`); destruktive Aktion mit Passwort und Bestätigung, Trigger ruhig (ghost mit `text-destructive`), 44 px Tap-Ziele.
- Nirgendwo Claude/Anthropic-Hinweise; Commit-Messages kurz, Deutsch, ohne Conventional-Commit-Präfix.

## Review Focus

1. Konto löschen, während die Person für einen laufenden Spieltag eingeplant ist: Matches und Teilnahme bleiben, Spieltag bleibt bedienbar, Name in den Match-Zeilen wird „Gelöschter Spieler". (Test in Task 2.)
2. Nach der Löschung registriert sich jemand mit derselben E-Mail-Adresse über einen Einladungslink: klappt (Adresse ist frei), das alte Konto bleibt anonymisiert und getrennt. (Test in Task 2.)
3. Person ist Besitzer in Gruppe A und Mitglied in B: 409 mit genau `[A]`, nichts geändert; nach Besitzübertragung klappt die Löschung und beendet beide Mitgliedschaften. (Test in Task 2.)
4. Export einer Person mit Avatar, Joker und entfernter Mitgliedschaft: alle Abschnitte gefüllt, keine fremden IDs außer Gruppen-/Spieltagsbezügen, Download-Header korrekt. (Test in Task 1.)
5. Gelöschtes Konto hält noch ein gültiges JWT in einem anderen Tab: der nächste Request führt zum Logout, kein 500 auf Dashboard oder Profil. (Test in Task 2 über `refreshTokenFromPlayer`/`findPlayerForRefresh`.)

---

### Task 1: Datenexport (Lib + Route)

**Files:**
- Create: `src/lib/account/export.ts`, `src/app/api/profile/export/route.ts`
- Test: `tests/integration/account-export.test.ts`, `tests/integration/api-account-export.test.ts`

**Interfaces:**
- Produces: `type AccountExport = { exportedAt: string; account: { id; name; email; username: string | null; createdAt: string }; memberships: { group: string; role: GroupRole; joinedAt: string; removedAt: string | null }[]; participations: { date: string; group: string; attendance: string }[]; matches: { date: string; group: string; matchNumber: number; team1: [string, string]; team2: [string, string]; team1Score: number | null; team2Score: number | null }[]; jokers: { date: string; group: string; season: string; pointsCredited: string; gamesCredited: number }[]; auditLogs: { action: string; entityType: string; entityId: string; createdAt: string; payload: unknown }[]; avatar: { mimeType: string; base64: string } | null }`.
- Produces: `buildAccountExport(playerId: string): Promise<AccountExport>` – `PlayerNotFoundError` (aus `@/lib/players/errors`) für unbekannte oder gelöschte Konten; Daten als ISO-Strings; Matches über die vier Spieler-Relationen (`matchT1A` …) gesammelt, Namen der Mitspieler aufgelöst; schreibt kein Audit (das macht die Route).
- Produces: `GET /api/profile/export` – 401; Limit; `buildAccountExport`; Audit `account.export`; Antwort mit den Headern aus den Global Constraints; `PlayerNotFoundError` → 404.

- [ ] **Step 1: Failing Tests**:

```ts
// account-export.test.ts
it("collects account, memberships (incl. removed), participations, matches with partner names, jokers, own audit rows and the avatar as base64")
it("omits audit rows where the person is only the entity, and other players' ids")
it("throws PlayerNotFoundError for a deleted account")
// api-account-export.test.ts
it("GET /api/profile/export 401 without session, 200 with attachment header and filename date, writes audit account.export")
it("GET /api/profile/export 429 on the sixth call within an hour")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/account-export.test.ts tests/integration/api-account-export.test.ts` → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Datenexport im Profil (Lib und Route)`

---

### Task 2: Konto löschen (Lib)

**Files:**
- Create: `src/lib/account/delete.ts`
- Modify: `src/lib/account/errors.ts` (`WrongPasswordError` hierher, Re-Export in `src/lib/group/delete.ts`)
- Test: `tests/integration/account-delete.test.ts`, `tests/integration/refresh-lookup.test.ts` (eine Assertion: gelöschtes Konto → `invalidate`)

**Interfaces:**
- Consumes: `verifyPassword` (`@/lib/auth/hash`), `PlayerNotFoundError`, `signupWithInvitation` + `createInvitation` (für den Wieder-Registrierungs-Test), `transferOwnership` (`@/lib/group/transfer`), `summariseGameDay`/Archiv-Helfer aus `src/lib/game-day/summary.ts` (für den Darstellungs-Test).
- Produces: `class OwnerOfGroupError extends Error { groups: { id: string; name: string }[] }`; `deleteOwnAccount(i: { playerId: string; password: string; now?: Date }): Promise<void>` – lädt Player (`deletedAt` → `PlayerNotFoundError`); `passwordHash` null oder falsch → `WrongPasswordError`; aktive Besitzer-Mitgliedschaften → `OwnerOfGroupError` (nach Gruppenname sortiert); sonst die Transaktion aus den Global Constraints.

- [ ] **Step 1: Failing Tests**:

```ts
it("deleteOwnAccount anonymises every Player field listed, ends all active memberships, deletes planned-day participations, keeps in-progress and finished participations and matches, deletes email tokens, keeps InvitationUse, anonymises Player audit payloads, writes account.delete")
it("deleteOwnAccount rejects wrong password and passwordless accounts without changes")
it("owner of A and member of B → OwnerOfGroupError with [A]; after transferOwnership the deletion succeeds and ends both memberships")
it("after deletion the same e-mail can sign up again via an invitation link; the old account stays anonymised")
it("game-day summary shows 'Gelöschter Spieler' for the anonymised player; ranking excludes them")
it("findPlayerForRefresh + refreshTokenFromPlayer invalidate the deleted account's token")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/account-delete.test.ts tests/integration/refresh-lookup.test.ts` → FAIL
- [ ] **Step 3: Implementieren**; `pnpm vitest run tests/integration/group-delete.test.ts` nach dem Verschieben von `WrongPasswordError` → PASS
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Konto löschen mit Anonymisierung`

---

### Task 3: Route und Profilkarte „Konto"

**Files:**
- Create: `src/app/api/profile/route.ts` (DELETE), `src/app/profil/account-section.tsx`, `src/app/profil/delete-account-dialog.tsx`
- Modify: `src/app/profil/page.tsx` (Karte „Konto" als letzte Karte)
- Test: `tests/integration/api-account-delete.test.ts`, `tests/unit/components/delete-account-dialog.test.tsx`, `tests/components/account-section.test.tsx`

**Interfaces:**
- Produces: `DELETE /api/profile` – Codes aus den Global Constraints; `OwnerOfGroupError` → 409 `{ error: "owner_of_group", groups }`.
- Produces (`account-section.tsx`, Client, Prop `hasPassword: boolean`): Karte „Konto" mit Erklärung „Lade alle deine Daten als JSON herunter oder lösche dein Konto." Link-Button „Daten exportieren" (`<a href="/api/profile/export" download>` im Button-Stil, `min-h-11`); darunter muted „Löscht dein Konto und entfernt dich aus allen Gruppen. Spielergebnisse bleiben anonym erhalten." und Button „Konto löschen" (ghost, `text-destructive`); ohne Passwort stattdessen Hinweis „Dieses Konto hat kein Passwort und kann nur von einem Admin entfernt werden."
- Produces (`delete-account-dialog.tsx`): Titel „Konto löschen", Text: fett „Das kann nicht rückgängig gemacht werden.", dann „Du wirst aus allen Gruppen entfernt und abgemeldet. Deine Spielergebnisse bleiben ohne deinen Namen erhalten."; `Input type="password"` „Dein Passwort" (`autoComplete="current-password"`); „Abbrechen" (ghost, `autoFocus`), „Endgültig löschen" (`variant="destructive"`, aktiv bei nicht-leerem Passwort); 204 → `signOut({ callbackUrl: "/login" })` aus `next-auth/react`; 403 → „Passwort falsch." (+ `aria-invalid`); 409 `owner_of_group` → „Du bist Besitzer von: {Namen}. Übertrage den Besitz oder lösche die Gruppe zuerst."; 429 → „Zu viele Versuche, bitte später."; sonst „Löschen fehlgeschlagen."; kein Schließen während der Anfrage.
- Profil: `AccountSection` als letzte Karte, `hasPassword` aus `player.passwordHash !== null` (Select erweitern).

- [ ] **Step 1: Failing Tests**:

```ts
// api-account-delete.test.ts
it("DELETE /api/profile 401, 400 without password, 403 wrong_password, 409 owner_of_group with groups, 204 then player anonymised, 429 after five attempts")
// delete-account-dialog.test.tsx
it("gates the confirm button on the password, sends DELETE with the password, calls signOut on 204, shows the 403 and 409 texts with group names")
// account-section.test.tsx
it("renders the export link with download attribute and the delete trigger; shows the no-password hint instead when hasPassword is false")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS; `AUTH_SECRET=$(openssl rand -base64 32) pnpm build` → `/api/profile` und `/api/profile/export` in der Route-Liste.
- [ ] **Step 5: Commit** `Profilkarte Konto: Export und Löschung`

---

### Task 4: Doku, Gesamtlauf, PR

**Files:**
- Modify: `README.md` (Absatz Konto: Export und Löschung, Anonymisierung), `docs/legal/datenschutz-stichpunkte.md` (Export und Löschung als Betroffenenrechte, Anonymisierung statt Löschung der Ergebnisse), `docs/DEPLOYMENT.md` §4.6 (ein Satz: Kontolöschung anonymisiert, Admin-Entfernen bleibt für Konten ohne Passwort)

- [ ] **Step 1: Doku** ergänzen.
- [ ] **Step 2: Gesamtlauf**: `pnpm lint && pnpm test && AUTH_SECRET=$(openssl rand -base64 32) pnpm build` → grün.
- [ ] **Step 3: Commit** `Doku: Datenexport und Kontolöschung`, Push, PR `Öffentliche Nutzung PR 4: Konto` (Rulings, Deploy-Hinweis: keine Migration, kein `.env`-Eintrag, `deploy.sh` genügt; Check: `/profil` zeigt die Karte „Konto", Export lädt eine Datei).
