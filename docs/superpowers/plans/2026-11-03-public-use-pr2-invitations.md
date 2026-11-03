# Phase 2, PR 2 „Einladungen und Registrierung" – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einladungslinks (Gründer per Skript, Mitglieder per Admin-Seite), Registrierung und Beitritt über `/einladung/<token>`, Gruppe gründen über `/gruppe/neu`, Flag `PUBLIC_SIGNUP`.

**Architecture:** Neue Lib-Module `src/lib/invitations/*` (erzeugen, prüfen, einlösen, verwalten) und `src/lib/group/{join,create,slug}.ts`, dahinter Route-Handler im bestehenden Muster (zod, `rateLimitRequest`, Fehlercodes `snake_case`, Guards aus `@/lib/auth/route-guard`). Tokens wie in PR 1 (`@/lib/auth/token`), nur als SHA-256 in `Invitation.tokenHash`. UI: öffentliche Seite `/einladung/[token]`, Seite `/gruppe/neu`, Admin-Abschnitt „Einladen", Login mit Rücksprung.

**Tech Stack:** Next.js 15 (App Router), next-auth 5 beta (JWT, Claims werden bei jedem Request aus der DB aufgefrischt), Prisma 6/Postgres, zod 4, vitest 4 (Integrationstests gegen echte DB, `fileParallelism: false`), `memory`-Mail-Transport in Tests.

**Spec:** `docs/superpowers/specs/2026-11-02-public-use-design.md` (Abschnitte „Datenmodell", „Registrierung über einen Link", „Gruppe gründen", „Mitglieder-Links in der Admin-Seite", „Gründer-Links", „Middleware, CSRF, Rate-Limits", „Flags", „PR-Folge" Punkt 2).

**Abweichungen von der PR-Folge der Spec (Rulings des Planers):**

- „Gruppe gründen" (`/gruppe/neu`, `POST /api/groups`) kommt schon in diesem PR, nicht in PR 3. Ohne die Seite wäre ein Gründer-Link eine Sackgasse und der Gründer-Weg nicht Ende-zu-Ende testbar. Ohne `Player.activeGroupId` (PR 3) gilt weiter „neueste Mitgliedschaft gewinnt", was für neue Gründer-Konten und für Bestandskonten mit zweiter Gruppe das gewünschte Ergebnis liefert. Gruppenwechsel, Rollen, Besitz, Umbenennen, Löschen, Verlassen bleiben PR 3.
- Kein `GET /api/invitations/<token>`: die Seite `/einladung/[token]` ist serverseitig gerendert und liest die Vorschau direkt aus der Lib. Das Limit „Token-Prüfung 30/min pro IP" gilt für `POST /api/invitations/join`; `POST /api/signup` hat sein eigenes Limit 5/h pro IP.
- „Kopieren" gibt es nur direkt nach dem Erstellen eines Links: nur der Hash liegt in der DB, der Klartext wird nicht gespeichert. Ein neuer Link kostet einen Klick (25 Verwendungen, 14 Tage).
- Die Seiten `/nutzungsbedingungen` und `/datenschutz` entstehen hier als Platzhalter (die Checkbox verlinkt sie); PR 5 ersetzt den Inhalt.
- Der E2E-Lauf „fremde Gruppe" aus der Spec kommt nach PR 3 (braucht Gruppenwechsel), nicht hier.

## Global Constraints

- Branch `feat/public-2-invitations`, Worktree unter `.claude/worktrees/`. Kein Merge und kein Deploy ohne Patricks Go.
- Tokens: 32 zufällige Bytes, base64url in der URL (`generateToken()` aus `@/lib/auth/token`), in der DB nur `hashToken()` (SHA-256 hex) in `Invitation.tokenHash`.
- Laufzeiten und Nutzungen: Gründer-Link 30 Tage, `maxUses` 1; Mitglieder-Link 14 Tage, `maxUses` 25.
- Rate-Limits: `POST /api/signup` 5/h pro IP; `POST /api/invitations/join` 30/min pro IP. Login bleibt 10/min pro IP (bestehend).
- Passwort min. 8, max. 72 Zeichen (`newPasswordField` aus `@/lib/account/schemas`); E-Mail über `emailField` (trim, lowercase, max 254); Name 1–60 Zeichen getrimmt; Gruppenname 2–40 Zeichen getrimmt; Notiz max. 80 Zeichen.
- Jede Registrierung setzt `Player.termsAcceptedAt`. Verifizierung ist nie Login-Voraussetzung; nach der Registrierung geht die Bestätigungsmail über `sendVerification` aus PR 1, ein Mail-Fehler bricht die Registrierung nicht ab (nur `console.error`).
- Beitritt (neu oder reaktiviert) trägt die Person in alle geplanten Spieltage der Gruppe ein (wie `createPlayer`).
- Ein Gründer-Link berechtigt zu genau einer Gruppe (`InvitationUse.foundedGroupId`). `/gruppe/neu` und `POST /api/groups` sind erreichbar mit offener Gründer-Verwendung oder mit `PUBLIC_SIGNUP=true`.
- Env: `PUBLIC_SIGNUP` (Standard `false`), gelesen in `src/lib/flags.ts`. Kein neuer Pflicht-Eintrag in `.env`.
- Audit-Aktionen: `invitation.create`, `invitation.revoke`, `player.signup`, `membership.join`, `group.create`. Gründer-Links aus dem Skript schreiben kein Audit (kein Actor).
- Fehlercodes: `invalid` (400), `unauthorized` (401), `forbidden` (403), `no_founder_invitation` (403), `not_found` (404), `email_taken` (409), `invitation_invalid` (410, Body zusätzlich `reason: "unknown" | "expired" | "revoked" | "exhausted"`), `rate_limited` (429).
- Texte Deutsch; Design-Sprache wie bisher (dunkle Karten, `rounded-2xl`, `border-border`, `bg-surface`, `InlineMessage`, `Button`, `Input`, `Dialog`, `Badge`); Tap-Ziele min. 44 px, sichtbare Fokusringe.
- Alle Tests mit `memory`-Transport; kein Test spricht mit Resend.
- Nirgendwo Claude/Anthropic-Hinweise; Commit-Messages kurz, Deutsch, ohne Conventional-Commit-Präfix.

## Review Focus

1. Zwei Registrierungen gleichzeitig auf die letzte freie Verwendung eines Links: genau eine legt ein Konto an, die andere antwortet 410 `exhausted`, `usedCount` endet bei `maxUses`. (Test in Task 4.)
2. Angemeldetes, bereits aktives Mitglied öffnet den Mitglieder-Link seiner eigenen Gruppe: keine zweite Mitgliedschaft, `usedCount` unverändert, Seite zeigt „Du bist schon Mitglied". (Tests in Task 4 und Task 7.)
3. Mail-Transport fällt während der Registrierung aus: Konto und Mitgliedschaft existieren trotzdem, Antwort 201, kein 503; der Nutzer kann die Mail später über das Banner erneut anfordern. (Test in Task 4.)
4. `next`-Parameter am Login mit fremder Adresse (`https://evil.example`, `//evil.example`, `javascript:…`): wird ignoriert, Ziel bleibt `/`. (Test in Task 7.)
5. Gruppenname, aus dem kein Slug entsteht (`🎾🎾`) oder der mit einem bestehenden Slug kollidiert (`Wien` zweimal): Slug `gruppe` bzw. `wien-2`, kein 500. (Test in Task 5.)

---

### Task 1: Schema und Migration

**Files:**
- Modify: `prisma/schema.prisma` (Enum `InvitationKind`, Models `Invitation`, `InvitationUse`, Relationen an `Player` und `Group`)
- Create: `prisma/migrations/20261104100000_invitations/migration.sql`
- Modify: `tests/helpers/reset-db.ts`

**Interfaces:**
- Produces: `enum InvitationKind { founder member }`.
- Produces: `model Invitation { id, kind: InvitationKind, groupId String?, tokenHash String @unique, createdById String?, note String?, expiresAt DateTime, revokedAt DateTime?, maxUses Int @default(1), usedCount Int @default(0), createdAt }`, Relationen `group Group?`, `createdBy Player?`, `uses InvitationUse[]`, `@@index([groupId, revokedAt])`.
- Produces: `model InvitationUse { id, invitationId, playerId, usedAt @default(now()), foundedGroupId String? }`, `@@unique([invitationId, playerId])`, `@@index([playerId])`; Relationen `invitation Invitation` (`onDelete: Cascade`), `player Player`, `foundedGroup Group? @relation("FoundedGroup", …, onDelete: SetNull)`.
- Produces: `Player.invitationsCreated Invitation[]`, `Player.invitationUses InvitationUse[]`, `Group.invitations Invitation[]`, `Group.foundedBy InvitationUse[] @relation("FoundedGroup")`.

- [ ] **Step 1: Schema ergänzen** wie in der Spec (Abschnitt Datenmodell) plus die Relationen oben.

- [ ] **Step 2: Migration anlegen**

Run: `pnpm prisma migrate dev --name invitations --create-only`, Ordner auf `20261104100000_invitations` umbenennen, `pnpm prisma migrate dev` ausführen. Die SQL enthält nur `CREATE TYPE`, zwei `CREATE TABLE`, Indizes und Fremdschlüssel; kein `UPDATE`.

- [ ] **Step 3: `resetDb`** um `invitationUse.deleteMany()` und `invitation.deleteMany()` ergänzen, direkt vor `membership.deleteMany()`.

- [ ] **Step 4: Run** `pnpm prisma generate && pnpm vitest run tests/integration/sole-group.test.ts tests/integration/members.test.ts` → PASS

- [ ] **Step 5: Commit** `Tabellen Invitation und InvitationUse`

---

### Task 2: Gruppe beitreten (Lib)

**Files:**
- Create: `src/lib/group/join.ts`
- Modify: `src/lib/players/create.ts:58-68` (geplante Spieltage über `addToPlannedGameDays`)
- Test: `tests/integration/group-join.test.ts`

**Interfaces:**
- Produces: `addToPlannedGameDays(tx: Prisma.TransactionClient, groupId: string, playerId: string): Promise<void>` – `createMany` mit `skipDuplicates` für alle `status = planned` Spieltage der Gruppe.
- Produces: `joinGroup(tx: Prisma.TransactionClient, i: { groupId: string; playerId: string; now?: Date }): Promise<{ outcome: "joined" | "reactivated" | "already_member" }>` – keine Mitgliedschaft: anlegen (Rolle `member`); entfernte Mitgliedschaft: `removedAt = null`, `role = member`, `joinedAt = now`; aktive: nichts ändern. In den ersten beiden Fällen `addToPlannedGameDays`.

- [ ] **Step 1: Failing Tests** (`resetDb`, Helfer aus `tests/helpers/group.ts`):

```ts
it("joinGroup creates a member membership and adds the player to planned game days only")
it("joinGroup reactivates a removed membership with role member and a new joinedAt")
it("joinGroup leaves an active membership untouched and returns already_member")
it("createPlayer still adds new players to planned game days")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/group-join.test.ts` → FAIL
- [ ] **Step 3: Implementieren**; `createPlayer` ruft `addToPlannedGameDays(tx, input.groupId, player.id)` statt der eigenen Abfrage.
- [ ] **Step 4: Run** `pnpm vitest run tests/integration/group-join.test.ts tests/integration/players-create.test.ts` → PASS
- [ ] **Step 5: Commit** `Beitritt zu einer Gruppe als Lib-Funktion`

---

### Task 3: Einladungen erzeugen, prüfen, verwalten (Lib)

**Files:**
- Create: `src/lib/invitations/errors.ts`, `src/lib/invitations/constants.ts`, `src/lib/invitations/create.ts`, `src/lib/invitations/lookup.ts`, `src/lib/invitations/manage.ts`
- Test: `tests/integration/invitations.test.ts`

**Interfaces:**
- Produces (`errors.ts`): `type InvitationInvalidReason = "unknown" | "expired" | "revoked" | "exhausted"`, `class InvitationInvalidError extends Error { reason: InvitationInvalidReason }`, `class InvitationNotFoundError extends Error`.
- Produces (`constants.ts`): `FOUNDER_TTL_MS = 30 * 24 * 60 * 60 * 1000`, `MEMBER_TTL_MS = 14 * 24 * 60 * 60 * 1000`, `FOUNDER_MAX_USES = 1`, `MEMBER_MAX_USES = 25`.
- Produces (`create.ts`): `createInvitation(i: { kind: "member"; groupId: string; createdById: string; note?: string } | { kind: "founder"; note?: string }, now?: Date): Promise<{ id: string; token: string; expiresAt: Date }>` – `generateToken()`, Laufzeit und `maxUses` nach `kind`; bei `member` Audit `invitation.create` (groupId, actor = createdById, entityType `Invitation`, payload `{ note, expiresAt, maxUses }`).
- Produces (`lookup.ts`): `type RedeemableInvitation = { id: string; kind: InvitationKind; groupId: string | null; maxUses: number; usedCount: number }`; `findRedeemableInvitation(db: Prisma.TransactionClient | PrismaClient, token: string, now?: Date): Promise<RedeemableInvitation>` – wirft `InvitationInvalidError` mit Vorrang `unknown` → `revoked` → `expired` → `exhausted`; `previewInvitation(token: string, now?: Date): Promise<{ ok: true; kind: InvitationKind; groupId: string | null; groupName: string | null } | { ok: false; reason: InvitationInvalidReason }>`.
- Produces (`manage.ts`): `type OpenInvitation = { id: string; note: string | null; expiresAt: Date; usedCount: number; maxUses: number; createdAt: Date; uses: { playerId: string; playerName: string; usedAt: Date }[] }`; `listOpenInvitations(groupId: string, now?: Date): Promise<OpenInvitation[]>` – nur `kind = member`, nicht widerrufen, nicht abgelaufen, `usedCount < maxUses`, neueste zuerst; `revokeInvitation(i: { id: string; groupId: string; actorId: string; now?: Date }): Promise<void>` – `InvitationNotFoundError` wenn die ID nicht zu dieser Gruppe gehört oder schon widerrufen; Audit `invitation.revoke`; `listFounderInvitations(now?: Date): Promise<{ id: string; note: string | null; expiresAt: Date; usedCount: number; createdAt: Date }[]>` (offene Gründer-Links); `revokeFounderInvitation(id: string, now?: Date): Promise<void>` (ohne Audit).

- [ ] **Step 1: Failing Tests**:

```ts
it("createInvitation member: 14 days, maxUses 25, stores only the hash, writes audit invitation.create")
it("createInvitation founder: 30 days, maxUses 1, no groupId, no audit row")
it("findRedeemableInvitation returns the row for a fresh token")
it("findRedeemableInvitation reports unknown for a random token")
it("findRedeemableInvitation reports revoked before expired for a link that is both")
it("findRedeemableInvitation reports expired at expiresAt (now === expiresAt)")
it("findRedeemableInvitation reports exhausted when usedCount >= maxUses")
it("previewInvitation returns kind and group name for member links and null group for founder links")
it("listOpenInvitations hides founder, revoked, expired and exhausted links and lists uses with player names")
it("revokeInvitation sets revokedAt, writes audit, and rejects an id of another group")
it("listFounderInvitations and revokeFounderInvitation only touch founder links")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/invitations.test.ts` → FAIL
- [ ] **Step 3: Implementieren** gemäß Interfaces. `previewInvitation` baut auf `findRedeemableInvitation` auf und fängt `InvitationInvalidError`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Einladungen erzeugen, prüfen und verwalten`

---

### Task 4: Einlösen: Registrierung und Beitritt (Lib)

**Files:**
- Create: `src/lib/invitations/redeem.ts`
- Test: `tests/integration/invitation-redeem.test.ts`

**Interfaces:**
- Consumes: `findRedeemableInvitation`, `joinGroup`, `hashPassword` (`@/lib/auth/hash`), `normaliseEmail`, `sendVerification` (`@/lib/account/email-verification`), `EmailTakenError` (`@/lib/account/errors`).
- Produces: `signupWithInvitation(i: { token: string; name: string; email: string; password: string; now?: Date }): Promise<{ playerId: string; kind: InvitationKind; groupId: string | null }>` – eine Transaktion: Einladung prüfen; Player anlegen (`email` normalisiert, `termsAcceptedAt = now`, `emailVerifiedAt = null`); bei `member` `joinGroup`; `InvitationUse` anlegen; `usedCount` atomar erhöhen über `updateMany({ where: { id, revokedAt: null, usedCount: { lt: maxUses } }, data: { usedCount: { increment: 1 } } })`, `count !== 1` → `InvitationInvalidError("exhausted")` (rollt alles zurück); Audit `player.signup` (actor = neuer Player, groupId bei `member`, payload `{ invitationId, kind }`). `P2002` auf `email` → `EmailTakenError`. Nach der Transaktion `sendVerification({ playerId })` in `try/catch` mit `console.error("[signup] verification mail failed", …)`.
- Produces: `joinWithInvitation(i: { token: string; playerId: string; now?: Date }): Promise<{ kind: "member"; groupId: string; outcome: "joined" | "reactivated" | "already_member" } | { kind: "founder"; outcome: "redeemed" | "already_redeemed" }>` – `member`: `already_member` → keine `InvitationUse`, kein Zähler; sonst wie oben plus Audit `membership.join` (payload `{ invitationId, outcome }`). `founder`: `InvitationUse` ohne `foundedGroupId` anlegen und Zähler erhöhen; existiert für dieses Konto schon eine Verwendung dieses Links → `already_redeemed` ohne Änderung.
- Fehler beider Funktionen: `InvitationInvalidError`, `EmailTakenError`.

- [ ] **Step 1: Failing Tests** (`resetDb`, `clearMemoryOutbox`, `setTransportForTests`):

```ts
it("signup via member link creates player with termsAcceptedAt, membership member, planned-day participation, InvitationUse, usedCount 1, audit player.signup, and one verification mail")
it("signup via founder link creates the player without membership and returns groupId null")
it("signup lowercases the email and rejects an existing address with EmailTakenError without touching usedCount")
it("signup on an exhausted link throws exhausted and creates nothing")
it("two concurrent signups on a link with one free use: exactly one succeeds, usedCount equals maxUses")
it("signup succeeds with 201 semantics when the mail transport throws (player exists, no mail)")
it("joinWithInvitation joins an existing account, reactivates a removed membership, and reports already_member without a second InvitationUse")
it("joinWithInvitation on a founder link records a use once and is idempotent for the same account")
```

Für den Nebenläufigkeitstest zwei `signupWithInvitation`-Aufrufe mit `Promise.allSettled` auf einem Link mit `maxUses: 1`.

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/invitation-redeem.test.ts` → FAIL
- [ ] **Step 3: Implementieren** gemäß Interfaces.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Registrierung und Beitritt über Einladungslink`

---

### Task 5: Gruppe gründen (Lib), Slug, Flag

**Files:**
- Create: `src/lib/flags.ts`, `src/lib/group/slug.ts`, `src/lib/group/create.ts`
- Modify: `tests/helpers/group.ts:6-13` (eigenes `slugify` durch Import aus `@/lib/group/slug` ersetzen)
- Test: `tests/unit/group/slug.test.ts`, `tests/unit/flags.test.ts`, `tests/integration/group-create.test.ts`

**Interfaces:**
- Produces (`flags.ts`): `publicSignupEnabled(env: NodeJS.ProcessEnv = process.env): boolean` – `true` nur bei `PUBLIC_SIGNUP === "true"`.
- Produces (`slug.ts`): `slugify(name: string): string` – NFKD, Diakritika entfernen, `ä/ö/ü/ß` → `ae/oe/ue/ss` vor der Normalisierung, Kleinbuchstaben, alles außer `[a-z0-9]` zu `-`, Ränder trimmen, max. 40 Zeichen; leer → `gruppe`. `uniqueSlug(db: Prisma.TransactionClient | PrismaClient, name: string): Promise<string>` – bei Kollision Suffix `-2`, `-3`, … (erste freie Zahl).
- Produces (`create.ts`): `class NotFounderError extends Error`; `findOpenFounderUse(db, playerId: string): Promise<{ id: string } | null>` – `InvitationUse` mit `foundedGroupId null` auf einer Einladung `kind = founder`, älteste zuerst; `canFoundGroup(playerId: string): Promise<boolean>` – offene Gründer-Verwendung oder `publicSignupEnabled()`; `createGroup(i: { name: string; founderId: string; now?: Date }): Promise<{ id: string; name: string; slug: string }>` – Transaktion: `findOpenFounderUse`, fehlt sie und Flag aus → `NotFounderError`; `uniqueSlug`; `Group` anlegen; Mitgliedschaft `owner`; Verwendung auf `foundedGroupId` setzen (falls vorhanden); Audit `group.create` (groupId, actor founder, payload `{ name, slug }`). Nach der Transaktion `getOrCreateActiveSeason(group.id)`.

- [ ] **Step 1: Failing Tests**:

```ts
// slug.test.ts
it("slugify: 'Padel Wien Süd' → 'padel-wien-sued', 'Straße 1' → 'strasse-1', '🎾🎾' → 'gruppe', trims to 40 chars")
// flags.test.ts
it("publicSignupEnabled is false for undefined, '', 'false', '1' and true only for 'true'")
// group-create.test.ts
it("createGroup with an open founder use creates group, owner membership, active season, sets foundedGroupId, writes audit group.create")
it("createGroup without founder use throws NotFounderError when PUBLIC_SIGNUP is off and succeeds when on")
it("createGroup twice with the same name yields slugs 'wien' and 'wien-2'")
it("a founder use that already founded a group does not allow a second group")
it("canFoundGroup reflects open use or flag")
```

`process.env.PUBLIC_SIGNUP` in Tests per `vi.stubEnv` setzen und in `afterEach` mit `vi.unstubAllEnvs()` zurücksetzen.

- [ ] **Step 2: Run** `pnpm vitest run tests/unit/group/slug.test.ts tests/unit/flags.test.ts tests/integration/group-create.test.ts` → FAIL
- [ ] **Step 3: Implementieren** gemäß Interfaces; `tests/helpers/group.ts` nutzt `slugify` aus der Lib.
- [ ] **Step 4: Run** → PASS, dazu `pnpm vitest run tests/integration/sole-group.test.ts` (Helfer-Änderung) → PASS
- [ ] **Step 5: Commit** `Gruppe gründen mit Slug und Flag PUBLIC_SIGNUP`

---

### Task 6: Öffentliche Routen: Registrierung und Beitritt

**Files:**
- Create: `src/lib/invitations/schemas.ts`, `src/app/api/signup/route.ts`, `src/app/api/invitations/join/route.ts`
- Test: `tests/integration/api-signup.test.ts`

**Interfaces:**
- Consumes: `signupWithInvitation`, `joinWithInvitation`, `tokenField`, `emailField`, `newPasswordField`, `rateLimitRequest`, `rateLimitedResponse`, `auth` (für `join`).
- Produces (`schemas.ts`): `signupSchema = z.object({ token: tokenField, name: z.string().trim().min(1).max(60), email: emailField, password: newPasswordField, acceptTerms: z.literal(true) })`, `joinSchema = z.object({ token: tokenField })`, `createInvitationSchema = z.object({ note: z.string().trim().max(80).optional() })`, `groupNameField = z.string().trim().min(2).max(40)`.
- Produces: `POST /api/signup` – ohne Session; Limit `signup` 5/h pro IP; 400 `invalid`; 409 `email_taken`; 410 `invitation_invalid` + `reason`; 201 `{ playerId, kind, groupId }`.
- Produces: `POST /api/invitations/join` – Session Pflicht (401); Limit `invitation-join` 30/min pro IP; 400; 410 + `reason`; 200 mit dem Rückgabeobjekt von `joinWithInvitation`.

- [ ] **Step 1: Failing Tests** (Muster `tests/integration/api-email.test.ts`: `vi.mock("@/auth")`, `req()` mit `x-forwarded-for`):

```ts
it("POST /api/signup 201 creates the account and reports kind member with groupId")
it("POST /api/signup 400 when acceptTerms is missing or false, or password shorter than 8")
it("POST /api/signup 409 email_taken for an existing address")
it("POST /api/signup 410 invitation_invalid with reason expired")
it("POST /api/signup 429 on the sixth attempt from one IP within an hour")
it("POST /api/invitations/join 401 without session, 200 outcome joined with session, 200 already_member on repeat")
it("POST /api/invitations/join 410 reason revoked")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/api-signup.test.ts` → FAIL
- [ ] **Step 3: Implementieren** gemäß Interfaces.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Routen für Registrierung und Beitritt`

---

### Task 7: Seite /einladung/[token], Login mit Rücksprung, Platzhalter-Rechtsseiten

**Files:**
- Create: `src/app/einladung/[token]/page.tsx`, `src/app/einladung/[token]/signup-form.tsx`, `src/app/einladung/[token]/join-button.tsx`, `src/app/nutzungsbedingungen/page.tsx`, `src/app/datenschutz/page.tsx`, `src/lib/auth/next-path.ts`
- Modify: `src/app/login/login-form.tsx`, `src/app/login/page.tsx`
- Test: `tests/unit/auth/next-path.test.ts`, `tests/components/signup-form.test.tsx`, `tests/components/join-button.test.tsx`, `tests/components/login-form.test.tsx` (erweitern)

**Interfaces:**
- Consumes: `previewInvitation`, `auth`, `findGroupMembership` (`@/lib/group/active-membership`), `signIn` aus `next-auth/react`.
- Produces (`next-path.ts`): `safeNextPath(raw: string | null | undefined): string` – gibt `raw` zurück, wenn es mit genau einem `/` beginnt (nicht `//`), keine `\` enthält und kein Schema hat; sonst `/`.
- Produces (`page.tsx`, Server): lädt Vorschau; `ok: false` → Karte mit Überschrift „Einladung ungültig" und Satz je `reason`: unknown „Diesen Link kennen wir nicht.", expired „Dieser Link ist abgelaufen.", revoked „Dieser Link wurde zurückgezogen.", exhausted „Dieser Link wurde schon zu oft verwendet."; dazu Link „Zur Anmeldung" (`/login`). `ok: true` und Session: bei `member` und aktiver Mitgliedschaft in dieser Gruppe → „Du bist schon Mitglied von <Gruppe>" + Link „Zum Dashboard" (`/`); sonst `<JoinButton token kind groupName />`. `ok: true` ohne Session: Überschrift „Einladung zu <Gruppe>" bzw. „Einladung: eigene Gruppe gründen" und `<SignupForm token kind />`.
- Produces (`join-button.tsx`, Client): Button „Gruppe <Name> beitreten" bzw. „Gruppe gründen"; `POST /api/invitations/join`; Erfolg `member` → `window.location.assign("/")`; Erfolg `founder` → `window.location.assign("/gruppe/neu")`; 410 → `InlineMessage` „Dieser Link ist nicht mehr gültig."; 429/sonst → Fehlertext.
- Produces (`signup-form.tsx`, Client): Felder Name, E-Mail, Passwort (`minLength 8`, `maxLength 72`, Label „Passwort (min. 8 Zeichen)"), Checkbox (Pflicht) mit Text „Ich akzeptiere die Nutzungsbedingungen und habe die Datenschutzerklärung gelesen", beide Begriffe als Links auf `/nutzungsbedingungen` und `/datenschutz` (`target="_blank"`); Button „Konto anlegen"; darunter Link „Schon ein Konto? Anmelden" auf `/login?next=/einladung/<token>`. Ablauf: `POST /api/signup` → 201 → `signIn("credentials", { identifier: email, password, redirect: false })` → `window.location.assign(kind === "founder" ? "/gruppe/neu" : "/")`. 409 → „Zu dieser Adresse gibt es schon ein Konto, bitte anmelden." (mit demselben Login-Link); 410 → „Dieser Link ist nicht mehr gültig."; 429 → „Zu viele Versuche, bitte später."; sonst „Unerwarteter Fehler. Bitte erneut versuchen.". Ein fehlgeschlagenes `signIn` nach 201 → `window.location.assign("/login?next=…")`.
- Produces (`login-form.tsx`): Prop `next?: string`; nach erfolgreichem Login `window.location.assign(safeNextPath(next))`. `login/page.tsx` liest `searchParams.next` (Server, `Promise<{ next?: string }>` in Next 15) und reicht es durch.
- Produces: `/nutzungsbedingungen` und `/datenschutz` als statische Seiten mit Überschrift („Nutzungsbedingungen" / „Datenschutzerklärung") und dem Satz „Der Text wird vor dem Beta-Start ergänzt." in einer Karte, Link „Zurück" auf `/login`.

- [ ] **Step 1: Failing Tests**:

```ts
// next-path.test.ts
it("safeNextPath keeps '/einladung/abc', '/gruppe/neu?x=1' and rejects '//evil', 'https://evil', 'javascript:alert(1)', '', null → '/'")
// login-form.test.tsx
it("navigates to next after login when next is a safe path, otherwise to /")
// signup-form.test.tsx
it("submits name, email, password, acceptTerms true and the token, then signs in and navigates to / for member links")
it("navigates to /gruppe/neu after signup on a founder link")
it("shows the login hint with next link on 409")
it("shows the invalid-link copy on 410")
it("submit is blocked while the checkbox is unchecked (fetch not called)")
// join-button.test.tsx
it("posts the token and navigates to / for member, /gruppe/neu for founder")
it("shows invalid-link copy on 410")
```

`window.location.assign` per `vi.stubGlobal("location", { assign: vi.fn() })` oder `Object.defineProperty` ersetzen; `next-auth/react` per `vi.mock`.

- [ ] **Step 2: Run** `pnpm vitest run tests/unit/auth/next-path.test.ts tests/components/signup-form.test.tsx tests/components/join-button.test.tsx tests/components/login-form.test.tsx` → FAIL
- [ ] **Step 3: Implementieren** gemäß Interfaces. Seitenrahmen wie `src/app/passwort-vergessen/page.tsx` (zentrierte Karte, `PadelLogo`).
- [ ] **Step 4: Run** → PASS; `pnpm build` (mit `AUTH_SECRET=$(openssl rand -base64 32)`) → Seiten `/einladung/[token]`, `/nutzungsbedingungen`, `/datenschutz` in der Build-Liste.
- [ ] **Step 5: Commit** `Einladungsseite mit Registrierung und Beitritt`

---

### Task 8: Admin-Routen für Mitglieder-Links und Gruppe gründen

**Files:**
- Create: `src/app/api/invitations/route.ts` (GET, POST), `src/app/api/invitations/[id]/route.ts` (DELETE), `src/app/api/groups/route.ts` (POST)
- Test: `tests/integration/api-invitations.test.ts`, `tests/integration/api-groups.test.ts`

**Interfaces:**
- Consumes: `guardGroupAdmin` für `/api/invitations*`, `auth` für `/api/groups`; `createInvitation`, `listOpenInvitations`, `revokeInvitation`, `createGroup`, `NotFounderError`, `createInvitationSchema`, `groupNameField`, `appUrl`.
- Produces: `GET /api/invitations` – Admin der Gruppe (401/403); 200 `OpenInvitation[]` (Daten als ISO-Strings).
- Produces: `POST /api/invitations` – Admin; Body `{ note? }`; 201 `{ id, url, expiresAt }` mit `url = appUrl("/einladung/<token>")`.
- Produces: `DELETE /api/invitations/[id]` – Admin; 204; 404 `not_found` für fremde oder schon widerrufene Links.
- Produces: `POST /api/groups` – Session Pflicht (401); Body `{ name }` über `groupNameField`; 400; 403 `no_founder_invitation`; 201 `{ id, name, slug }`.

- [ ] **Step 1: Failing Tests** (Session über `sessionFor` aus den Helfern, `auth` gemockt):

```ts
it("GET /api/invitations 403 for member, 200 list for admin with only this group's open links")
it("POST /api/invitations 201 returns a url containing a 43-char token and stores note")
it("DELETE /api/invitations/[id] 204 then the link disappears from GET; 404 for another group's id")
it("POST /api/groups 401 without session, 403 without founder use, 201 with founder use and the new group is the newest membership")
it("POST /api/groups 400 for a one-character name")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/api-invitations.test.ts tests/integration/api-groups.test.ts` → FAIL
- [ ] **Step 3: Implementieren** gemäß Interfaces.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Routen für Mitglieder-Links und Gruppe gründen`

---

### Task 9: Seite /gruppe/neu und Leerzustand

**Files:**
- Create: `src/app/gruppe/neu/page.tsx`, `src/app/gruppe/neu/group-form.tsx`
- Modify: `src/components/no-group-notice.tsx`, `src/app/page.tsx:29` (Prop `canFound`), `src/app/admin/page.tsx` (Willkommens-Hinweis)
- Test: `tests/components/group-form.test.tsx`, `tests/components/no-group-notice.test.tsx`

**Interfaces:**
- Consumes: `canFoundGroup`, `auth`, `groupNameField` (Client-seitige Längenprüfung über `minLength`/`maxLength`).
- Produces (`page.tsx`): ohne Session → `redirect("/login?next=/gruppe/neu")`; `canFoundGroup` false → Karte „Dafür brauchst du einen Gründer-Link" mit Link „Zum Dashboard"; sonst Überschrift „Neue Gruppe" und `<GroupForm />`.
- Produces (`group-form.tsx`, Client): Feld „Gruppenname" (2–40 Zeichen); `POST /api/groups`; 201 → `window.location.assign("/admin?willkommen=1")`; 403 → „Dafür brauchst du einen Gründer-Link."; sonst Fehlertext.
- Produces (`no-group-notice.tsx`): Prop `canFound: boolean`; bei `true` Text „Du hast einen Gründer-Link eingelöst." und Button-Link „Gruppe gründen" (`/gruppe/neu`) statt des bisherigen Hinweises; bei `false` unverändert.
- Produces (`admin/page.tsx`): liest `searchParams.willkommen`; bei `"1"` oben eine `InlineMessage kind="success"` „Deine Gruppe steht. Lade jetzt deine Mitspieler ein." über dem Abschnitt „Einladen" (Task 10 fügt den Abschnitt ein; hier reicht die Meldung über `PlayersSection`).

- [ ] **Step 1: Failing Tests**:

```ts
it("group form posts the name and navigates to /admin?willkommen=1 on 201")
it("group form shows founder-link copy on 403")
it("NoGroupNotice shows the found-group link only when canFound")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Seite Gruppe gründen`

---

### Task 10: Admin-Abschnitt „Einladen"

**Files:**
- Create: `src/app/admin/invitations-section.tsx`
- Modify: `src/app/admin/page.tsx` (Abschnitt zwischen `PlayersSection` und „Saison", Daten über `listOpenInvitations`)
- Test: `tests/components/invitations-section.test.tsx`

**Interfaces:**
- Consumes: `OpenInvitation` (serialisiert: Daten als ISO-Strings), `POST/GET/DELETE /api/invitations`.
- Produces (`invitations-section.tsx`, Client): Prop `initial: SerializedOpenInvitation[]`. Kopf „Einladen" mit Erklärung „Link teilen, 14 Tage gültig, bis zu 25 Beitritte."; Eingabe „Notiz (optional)" plus Button „Einladungslink erstellen"; nach 201 erscheint eine hervorgehobene Zeile mit der URL, Button „Kopieren" (`navigator.clipboard.writeText`, danach Text „Kopiert"; ohne Clipboard-API URL als markierbares `<input readOnly>`) und Hinweis „Der Link ist nur jetzt kopierbar."; Liste der offenen Links: Notiz oder „Einladungslink", „gültig bis <Datum>", „<usedCount> von <maxUses> verwendet", Button „Widerrufen" (DELETE, danach Zeile entfernen), aufklappbar („Beigetreten (n)") die Namen mit Datum. Leerzustand „Noch keine offenen Links.". Liste nach Erstellen/Widerrufen über `GET /api/invitations` neu laden.

- [ ] **Step 1: Failing Tests**:

```ts
it("renders the empty state and creates a link, then shows the url with a copy button")
it("revoke removes the row after a 204")
it("expands the joined names of a link")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**; Admin-Seite lädt `listOpenInvitations(ctx.groupId)` und serialisiert die Daten.
- [ ] **Step 4: Run** → PASS; lokal prüfen: `pnpm dev`, als Admin Link erstellen, in privatem Fenster öffnen, registrieren, Beitritt im Admin sichtbar.
- [ ] **Step 5: Commit** `Admin-Abschnitt Einladen`

---

### Task 11: Gründer-Skript und Doku

**Files:**
- Create: `scripts/invite-founder.ts`
- Modify: `package.json` (Script `invite:founder`), `docs/DEPLOYMENT.md` (§4.6 Absatz, §10 Zeile), `README.md:95` (Absatz Gruppen), `.env.example` (`PUBLIC_SIGNUP="false"`)
- Test: `tests/integration/invite-founder-cli.test.ts`

**Interfaces:**
- Consumes: `createInvitation({ kind: "founder", note })`, `listFounderInvitations`, `revokeFounderInvitation`, `appUrl`.
- Produces: `scripts/invite-founder.ts` mit `parseArgs` aus `node:util`: `--note <text>` (Standard: Link erstellen, Ausgabe `Gründer-Link (gültig bis <Datum>):` und die URL in eigener Zeile), `--list` (Tabelle `id  note  gültig bis  verwendet`), `--revoke <id>`. Exportierte Funktion `runInviteFounder(argv: string[], out: (line: string) => void): Promise<void>`, damit der Test sie direkt aufrufen kann; `main()` nur bei direktem Aufruf (`import.meta.url` gegen `process.argv[1]`).
- Produces: `pnpm invite:founder` → `tsx scripts/invite-founder.ts`.
- Docs: DEPLOYMENT.md §4.6 neuer Absatz „Gründer-Link für eine neue Gruppe" mit dem VPS-Aufruf (`sudo -u padel -H bash -c 'cd /srv/padel/app && set -a && . ./.env && set +a && pnpm invite:founder --note "Gruppe Wien"'`), §10 Zeile `Gründer-Link erzeugen`; README Absatz: Beitritt über Links, `PUBLIC_SIGNUP`.

- [ ] **Step 1: Failing Test**:

```ts
it("runInviteFounder --note creates a founder link and prints a url with a 43-char token")
it("runInviteFounder --list shows it and --revoke hides it")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/invite-founder-cli.test.ts` → FAIL
- [ ] **Step 3: Implementieren**; Doku ergänzen.
- [ ] **Step 4: Run** → PASS; `pnpm invite:founder --list` gegen die Dev-DB läuft ohne Fehler.
- [ ] **Step 5: Commit** `Gründer-Link per Skript`

---

### Task 12: Migrationsprobe, Gesamtlauf, PR

**Files:**
- Create: `docs/superpowers/plans/2026-11-03-public-use-pr2-rehearsal.md`

- [ ] **Step 1: Dump holen**: `scp root@217.154.83.37:/root/backups/2026-11-03-pre-public-1/db.dump <scratchpad>/dump/db-2026-11-03.dump` (Stand vor PR 1; PR 1 ist seitdem deployt, deshalb zuerst die beiden PR-1-Migrationen, dann die neue).
- [ ] **Step 2: Probe** in einer Wegwerf-DB (`padel_rehearsal_pr2`): `pg_restore`, `DATABASE_URL=… pnpm prisma migrate deploy`, danach `prisma migrate status` ohne Drift, Zeilenzahlen unverändert (Player 6, Membership 6, Season 2, GameDay 33, Match 469, GameDayParticipant 187, JokerUse 10, AuditLog 211, Group 1), `Invitation` und `InvitationUse` leer. Zahlen, Dauer, Deploy-Ablauf (kein `.env`-Eintrag nötig, `PUBLIC_SIGNUP` bleibt aus) und Rollback (Tabellen dürfen bleiben) ins Rehearsal-Dokument.
- [ ] **Step 3: Gesamtlauf**: `pnpm lint && pnpm test && AUTH_SECRET=$(openssl rand -base64 32) pnpm build` → grün.
- [ ] **Step 4: Commit** `Migrationsprobe PR 2`, Push, PR gegen `main` mit Titel `Öffentliche Nutzung PR 2: Einladungen und Registrierung`. PR-Text: Was, Rulings (siehe Kopf dieses Plans), Deploy-Hinweise (kein `.env`-Eintrag; nach dem Deploy `pnpm invite:founder --list` einmal auf dem VPS prüfen), Prüfung.
