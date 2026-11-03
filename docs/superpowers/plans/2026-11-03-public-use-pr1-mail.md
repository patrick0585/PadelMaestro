# Phase 2, PR 1 „Mail und Adressen" – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mail-Versand (Resend, lokal Konsole, Tests Speicher), E-Mail-Adresse im Profil ändern und bestätigen, Hinweisbanner für unbestätigte Adressen, „Passwort vergessen" per Mail, Kleinschreibung von E-Mail-Adressen.

**Architecture:** Neue Lib-Module `src/lib/mail/*` (Transport, Templates, Versand) und `src/lib/account/*` (Verifizierung, Reset) mit Route-Handlern unter `src/app/api/*`, die nach dem bestehenden Muster (zod, `rateLimitRequest`, Fehlercodes in `snake_case`, 204/4xx) gebaut sind. Tokens liegen nur gehasht in der neuen Tabelle `EmailToken`. UI: Profil-Abschnitt, drei öffentliche Seiten, ein Banner.

**Tech Stack:** Next.js 15 (App Router), next-auth 5 beta (JWT), Prisma 6/Postgres, zod 4, vitest 4 (Integrationstests gegen echte DB, `fileParallelism: false`), `resend` SDK.

**Spec:** `docs/superpowers/specs/2026-11-02-public-use-design.md` (Abschnitte „Datenmodell", „Mail", „E-Mail-Adresse und Verifizierung", „Passwort vergessen", „Middleware, CSRF, Rate-Limits", „PR-Folge" Punkt 1).

## Global Constraints

- Branch `feat/public-1-mail`, kein Merge und kein Deploy, solange der Deploy-Freeze vom 2026-11-03 gilt.
- Tokens: 32 zufällige Bytes, base64url in der URL, in der DB nur SHA-256 (hex). Laufzeiten: Verifizierung 24 h, Reset 1 h. Einmalig; eine neue Anforderung entwertet ältere offene Tokens desselben Zwecks.
- Rate-Limits: Adresse ändern 5/h pro Konto, Verifizierung erneut senden 3/h pro Konto, Reset anfordern 3/h pro Adresse und 10/h pro IP, Token-Bestätigung 30/min pro IP.
- Passwörter: min. 8, max. 72 Zeichen (bestehendes Muster).
- E-Mail-Adressen werden beim Schreiben und beim Login-Lookup kleingeschrieben.
- Mail-Transport: `MAIL_TRANSPORT` = `resend` | `console` | `memory`. Ohne Variable: `memory` bei `NODE_ENV=test`, sonst `console`. In Produktion: Variable Pflicht, `memory` abgelehnt (Fehler beim Start), `console` erlaubt mit `console.warn`.
- Env: `RESEND_API_KEY`, `MAIL_FROM` (Standard `Padelmaestro <noreply@padelmaestro.de>`), `APP_URL` (Fallback `AUTH_URL`).
- Texte Deutsch, Fehlercodes `snake_case`, Antworten `NextResponse.json({ error })`.
- Verifizierung ist nie Login-Voraussetzung. Reset-Mails nur an bestätigte Adressen.
- Kein Platzhalter-Konto (`@padel.local`) wird automatisch als bestätigt markiert.
- Nirgendwo Claude/Anthropic-Hinweise; Commit-Messages kurz, Deutsch, ohne Conventional-Commit-Präfix.

## Review Focus

1. Reset-Anforderung für eine Adresse, die existiert, aber unbestätigt ist: Antwort identisch zur Erfolgsantwort, keine Mail, kein Token. (Test in Task 6.)
2. Adresswechsel auf eine Adresse, die ein anderes Konto zwischen Anforderung und Bestätigung registriert hat: Bestätigung antwortet 409 `email_taken`, `email` bleibt alt. (Test in Task 5.)
3. Zweite Verifizierungs-Anforderung entwertet die erste: alter Link antwortet 400 `invalid_token`. (Test in Task 5.)
4. Admin ändert die Adresse eines Mitglieds (bestehender Dialog): `emailVerifiedAt` wird null, `pendingEmail` null, Login mit der neuen Adresse in beliebiger Groß-/Kleinschreibung klappt. (Test in Task 8.)
5. Produktionsstart ohne `MAIL_TRANSPORT`: Prozess bricht mit klarer Meldung ab statt still Mails zu verschlucken. (Test in Task 3.)

---

### Task 1: Schema und Migration

**Files:**
- Modify: `prisma/schema.prisma` (Model `Player`, neues Model `EmailToken`, Enum `EmailTokenPurpose`)
- Create: `prisma/migrations/20261103100000_email_tokens/migration.sql`
- Modify: `tests/helpers/reset-db.ts`
- Modify: `tests/helpers/group.ts:20-41` (`createMember`)

**Interfaces:**
- Produces: `Player.emailVerifiedAt DateTime?`, `Player.pendingEmail String?`, `Player.termsAcceptedAt DateTime?`, Relation `Player.emailTokens EmailToken[]`.
- Produces: Model `EmailToken { id, playerId, purpose: EmailTokenPurpose, tokenHash @unique, email, expiresAt, usedAt?, createdAt }`, `@@index([playerId, purpose])`, `player` Relation mit `onDelete: Cascade`.
- Produces: `createMember(groupId, { ..., emailVerifiedAt?: Date | null })`.

- [ ] **Step 1: Schema ergänzen** wie in der Spec (Abschnitt Datenmodell). `email` bleibt `@unique`.

- [ ] **Step 2: Migration anlegen**

Run: `pnpm prisma migrate dev --name email_tokens --create-only`, dann am Ende der erzeugten SQL ergänzen:

```sql
UPDATE "Player" SET "email" = lower("email") WHERE "email" <> lower("email");
```

Ordner auf `20261103100000_email_tokens` umbenennen (Namenskonvention der Phase-1-Migrationen).

- [ ] **Step 3: Migration anwenden und Client erzeugen**

Run: `pnpm prisma migrate dev && pnpm prisma generate`
Expected: Migration angewendet, `prisma migrate diff --from-schema-datasource --to-schema-datamodel` meldet leere Migration.

- [ ] **Step 4: `resetDb()` um `prisma.emailToken.deleteMany()` vor `player.deleteMany()` ergänzen; `createMember` nimmt `emailVerifiedAt` entgegen (Standard `null`).**

- [ ] **Step 5: Gesamte Suite laufen lassen**

Run: `pnpm test`
Expected: grün (854 Tests).

- [ ] **Step 6: Commit** `Schema: EmailToken, Verifizierungsfelder, E-Mail kleingeschrieben`

---

### Task 2: Token-Helfer

**Files:**
- Create: `src/lib/auth/token.ts`
- Test: `tests/unit/auth/token.test.ts`

**Interfaces:**
- Produces: `generateToken(): { token: string; hash: string }` (token = 32 Bytes base64url, hash = sha256 hex des Tokens), `hashToken(token: string): string`, `tokenExpiry(ms: number, now?: Date): Date`.

- [ ] **Step 1: Failing Test**

```ts
it("generates a 43-char base64url token whose hash matches hashToken", () => {
  const { token, hash } = generateToken();
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(hash).toBe(hashToken(token));
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
});
it("two tokens differ", () => { expect(generateToken().token).not.toBe(generateToken().token); });
it("tokenExpiry adds ms to now", () => {
  expect(tokenExpiry(3600_000, new Date("2026-11-03T10:00:00Z")).toISOString()).toBe("2026-11-03T11:00:00.000Z");
});
```

- [ ] **Step 2: Run** `pnpm vitest run tests/unit/auth/token.test.ts` → FAIL (Modul fehlt)
- [ ] **Step 3: Implementieren** mit `node:crypto` (`randomBytes`, `createHash("sha256")`).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Token-Helfer für Mail-Links`

---

### Task 3: Mail-Transport und Versand

**Files:**
- Create: `src/lib/mail/transport.ts` (Typen, `consoleTransport`, `memoryTransport`)
- Create: `src/lib/mail/resend-transport.ts`
- Create: `src/lib/mail/send.ts`
- Create: `src/lib/mail/app-url.ts`
- Modify: `package.json` (`pnpm add resend`)
- Modify: `.env.example`
- Test: `tests/unit/mail/transport.test.ts`, `tests/unit/mail/send.test.ts`, `tests/unit/mail/app-url.test.ts`

**Interfaces:**
- Produces: `interface MailMessage { to: string; subject: string; text: string; html: string }`, `interface MailTransport { send(msg: MailMessage): Promise<void> }`.
- Produces: `memoryOutbox: MailMessage[]` und `memoryTransport`, `clearMemoryOutbox()`; `consoleTransport` loggt `[mail] to=<to> subject=<subject>` plus Textkörper.
- Produces: `resolveTransportName(env: { MAIL_TRANSPORT?: string; NODE_ENV?: string }): "resend" | "console" | "memory"` (wirft `Error` bei unbekanntem Wert; bei Produktion ohne Wert oder `memory` wirft es mit Meldung `MAIL_TRANSPORT must be "resend" or "console" in production`).
- Produces: `sendMail(msg: MailMessage): Promise<void>` (wählt den Transport einmal pro Prozess; wirft `MailSendError` mit `cause` bei Transportfehler).
- Produces: `appUrl(path: string): string` aus `APP_URL`, Fallback `AUTH_URL`, Fallback `http://localhost:3000`; ohne doppelte Schrägstriche.
- Produces: `MailSendError extends Error`.

- [ ] **Step 1: Failing Tests**

```ts
// transport.test.ts
it("memory transport collects messages", async () => { await memoryTransport.send(msg); expect(memoryOutbox).toEqual([msg]); });
it("resolveTransportName defaults to memory under test, console otherwise", () => {
  expect(resolveTransportName({ NODE_ENV: "test" })).toBe("memory");
  expect(resolveTransportName({ NODE_ENV: "development" })).toBe("console");
});
it("resolveTransportName rejects memory and missing value in production", () => {
  expect(() => resolveTransportName({ NODE_ENV: "production" })).toThrow(/MAIL_TRANSPORT/);
  expect(() => resolveTransportName({ NODE_ENV: "production", MAIL_TRANSPORT: "memory" })).toThrow(/MAIL_TRANSPORT/);
  expect(resolveTransportName({ NODE_ENV: "production", MAIL_TRANSPORT: "console" })).toBe("console");
});
it("rejects unknown names", () => { expect(() => resolveTransportName({ MAIL_TRANSPORT: "smtp" })).toThrow(); });
// send.test.ts
it("sendMail wraps transport failures in MailSendError", ...)  // Transport per vi.mock("@/lib/mail/transport") oder injizierbarer Setter `setTransportForTests`
// app-url.test.ts
it("appUrl joins APP_URL and path", ...)  // APP_URL="https://padelmaestro.de/", "/x" → "https://padelmaestro.de/x"
```

- [ ] **Step 2: Run** `pnpm vitest run tests/unit/mail` → FAIL
- [ ] **Step 3: Implementieren.** `resend-transport.ts`: `createResendTransport(apiKey: string, from: string): MailTransport` über `new Resend(apiKey).emails.send({ from, to, subject, text, html })`; `error` im Ergebnis wird geworfen. `send.ts` liest `resolveTransportName(process.env)` beim ersten Aufruf, bei `console` in Produktion `console.warn("[mail] MAIL_TRANSPORT=console: mails are only logged")`. Export `setTransportForTests(t: MailTransport | null)`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: `.env.example`** um `MAIL_TRANSPORT="console"`, `MAIL_FROM`, `RESEND_API_KEY=""`, `APP_URL="http://localhost:3000"` ergänzen.
- [ ] **Step 6: Commit** `Mail-Versand mit Resend-, Konsolen- und Speicher-Transport`

---

### Task 4: Mail-Vorlagen

**Files:**
- Create: `src/lib/mail/templates.ts`
- Test: `tests/unit/mail/templates.test.ts`

**Interfaces:**
- Produces: `verifyEmailMail(p: { name: string; link: string }): Omit<MailMessage, "to">`, `passwordResetMail(p: { name: string; link: string }): ...`, `emailChangedMail(p: { name: string; newEmail: string }): ...`.
- Betreffzeilen fest: „Bitte bestätige deine E-Mail-Adresse", „Passwort zurücksetzen", „Deine E-Mail-Adresse wurde geändert".

- [ ] **Step 1: Failing Tests** – pro Vorlage: Betreff exakt, `text` enthält `link` bzw. `newEmail` und den Namen, `html` enthält `href="<link>"`, kein `<script`, keine Tracking-URL. Reset-Text nennt „1 Stunde", Verifizierungs-Text „24 Stunden".
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren.** Schlichtes HTML (ein `<p>`-Block pro Absatz, ein Link), Textfassung zuerst, HTML daraus. Anrede „Hallo <name>,". Abschluss „Dein Padelmaestro". HTML-Escaping für `name` und `newEmail` (kleine Hilfsfunktion `escapeHtml`).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Mail-Vorlagen: bestätigen, zurücksetzen, geändert`

---

### Task 5: Adresse ändern und bestätigen (Lib)

**Files:**
- Create: `src/lib/auth/email.ts` (`normaliseEmail`)
- Create: `src/lib/account/email-verification.ts`
- Create: `src/lib/account/errors.ts`
- Test: `tests/unit/auth/email.test.ts`, `tests/integration/email-verification.test.ts`

**Interfaces:**
- Produces: `normaliseEmail(raw: string): string` (trim + lowercase).
- Produces: `class EmailTakenError`, `class InvalidTokenError`, `class PlayerNotFoundError` (re-export aus `@/lib/players/errors`).
- Produces: `requestEmailChange(i: { playerId: string; newEmail: string }): Promise<void>` – normalisiert, 409-Fall `EmailTakenError` wenn ein anderes Konto diese `email` hat; setzt `pendingEmail`; entwertet offene `verify_email`-Tokens (`usedAt = now`); legt Token (`email = newEmail`, 24 h) an; sendet `verifyEmailMail` an `newEmail` mit Link `appUrl("/email-bestaetigen/<token>")`. Gleiche Adresse wie aktuell und bereits bestätigt → kein Token, kein Fehler (no-op).
- Produces: `sendVerification(i: { playerId: string }): Promise<void>` – Ziel `pendingEmail ?? email`; sonst wie oben. Bereits bestätigt und kein `pendingEmail` → no-op.
- Produces: `confirmEmailToken(token: string): Promise<{ playerId: string; email: string }>` – in einer Transaktion: Token per Hash laden (`purpose = verify_email`, `usedAt null`, `expiresAt > now`) sonst `InvalidTokenError`; wenn `token.email` von einem anderen Konto belegt → `EmailTakenError`; Player: `email = token.email`, `pendingEmail = null`, `emailVerifiedAt = now`; Token `usedAt = now`; Audit `player.email_change` (actor = player, payload `{ from, to }`) wenn sich `email` änderte, sonst `player.email_verified` (payload `{ email }`); war die alte Adresse bestätigt und änderte sich → `emailChangedMail` an die alte Adresse (nach der Transaktion, Fehler nur loggen).
- Alle Mails über `sendMail`; `MailSendError` wird durchgereicht (die Route antwortet 503).

- [ ] **Step 1: Failing Tests** (Integration, `resetDb`, `memoryOutbox`):

```ts
it("requestEmailChange stores pendingEmail, creates one token and sends a mail to the new address")
it("requestEmailChange lowercases and trims the address")
it("requestEmailChange rejects an address of another account with EmailTakenError")
it("second request invalidates the first token (first link → InvalidTokenError)")
it("confirmEmailToken moves pendingEmail to email, sets emailVerifiedAt, marks token used, writes audit player.email_change")
it("confirmEmailToken on a token whose address was taken meanwhile throws EmailTakenError and leaves email unchanged")
it("confirmEmailToken rejects expired and reused tokens")
it("confirm after change notifies the old address only if it was verified")
it("sendVerification targets current email when no pendingEmail and is a no-op when already verified")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/email-verification.test.ts tests/unit/auth/email.test.ts` → FAIL
- [ ] **Step 3: Implementieren** gemäß Interfaces. Ablaufprüfung mit `new Date()`; Testbarkeit über `now?: Date`-Parameter an `confirmEmailToken`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Adresse ändern und per Mail bestätigen`

---

### Task 6: Passwort vergessen (Lib)

**Files:**
- Create: `src/lib/account/password-reset.ts`
- Test: `tests/integration/password-reset.test.ts`

**Interfaces:**
- Produces: `requestPasswordReset(email: string): Promise<void>` – normalisiert; findet Konto mit `email`, `deletedAt null`, `emailVerifiedAt not null`; sonst stiller Rückweg (kein Fehler, keine Mail). Entwertet offene `password_reset`-Tokens, legt Token (1 h) an, sendet `passwordResetMail` mit Link `appUrl("/passwort-zuruecksetzen/<token>")`.
- Produces: `confirmPasswordReset(i: { token: string; newPassword: string; now?: Date }): Promise<void>` – Token laden wie in Task 5 (`purpose = password_reset`), `InvalidTokenError`; `passwordHash = hashPassword(newPassword)`; Token `usedAt`; alle anderen offenen Reset-Tokens des Kontos entwerten; Audit `player.password_reset`, actor = Konto, payload `{ playerId, via: "email" }`.

- [ ] **Step 1: Failing Tests**

```ts
it("sends a reset mail with a link for a verified address")
it("sends nothing for an unverified, unknown or deleted address and does not throw")
it("new request invalidates the previous token")
it("confirmPasswordReset sets a new hash (verifyPassword true), marks the token used, writes audit")
it("confirmPasswordReset rejects expired, used and unknown tokens")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Passwort-Reset per Mail`

---

### Task 7: API-Routen

**Files:**
- Create: `src/app/api/profile/email/route.ts` (POST `{ email }` → 204; 409 `email_taken`; 429; 503 `mail_failed`)
- Create: `src/app/api/profile/email/resend/route.ts` (POST → 204; 429; 503)
- Create: `src/app/api/email-verification/confirm/route.ts` (POST `{ token }` → 200 `{ email }`; 400 `invalid_token`; 409 `email_taken`; 429)
- Create: `src/app/api/password-reset/request/route.ts` (POST `{ email }` → 204 immer, außer 400 `invalid`, 429; bei `MailSendError` 503)
- Create: `src/app/api/password-reset/confirm/route.ts` (POST `{ token, newPassword }` → 204; 400 `invalid` | `invalid_token`; 429)
- Test: `tests/integration/api-email.test.ts`, `tests/integration/api-password-reset.test.ts`

**Interfaces:**
- Consumes: Task 5 und 6 Funktionen, `rateLimitRequest`, `auth` (gemockt in Tests wie `players-create.test.ts`).
- Rate-Limit-Schlüssel: `profile-email:<userId>` 5/h; `profile-email-resend:<userId>` 3/h; `email-confirm` 30/min pro IP; `password-reset-request` 10/h pro IP **und** `rateLimit("password-reset-email:<email>", { windowMs: 3_600_000, max: 3 })`; `password-reset-confirm` 30/min pro IP. 429 mit `Retry-After` wie in `profile/password/route.ts`.
- Zod: `email: z.string().trim().toLowerCase().email().max(254)`, `token: z.string().min(20).max(128)`, `newPassword: z.string().min(8).max(72)`.
- Die Request-Route antwortet bei stillem Rückweg und bei Erfolg gleich (204), damit keine Adressprüfung möglich ist.

- [ ] **Step 1: Failing Tests** – pro Route: Erfolg, Validierungsfehler, 401 ohne Session (nur Profil-Routen), 429 nach Limit (`rateLimitResetForTests()` im `beforeEach`), 409/400-Fälle, 503 bei `setTransportForTests({ send: () => Promise.reject(new Error("down")) })`.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren** nach dem Muster von `src/app/api/profile/password/route.ts`.
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `API: Adresse ändern, bestätigen, Passwort vergessen`

---

### Task 8: Kleinschreibung beim Login und im Admin, Session-E-Mail nachziehen

**Files:**
- Modify: `src/lib/auth/authorize.ts:40-46` (`email: normaliseEmail(identifier)`)
- Modify: `src/lib/players/create.ts` (E-Mail normalisieren; `emailVerifiedAt` bleibt null)
- Modify: `src/lib/players/update.ts:46-120` (E-Mail normalisieren; bei geänderter `email`: `emailVerifiedAt = null`, `pendingEmail = null`; unveränderte Adresse in anderer Schreibweise zählt nicht als Änderung)
- Modify: `src/lib/auth/refresh-token.ts`, `src/lib/auth/refresh-lookup.ts`, `src/auth.ts:46-61` (Token `email` aus DB nachziehen)
- Modify: Spielerliste des Admin-Bereichs, wo `hasPassword` berechnet wird (`grep -rn hasPassword src`; Feld `emailVerified: boolean` daneben), `src/app/admin/players-section.tsx:55-60` (Badge `neutral` „Unbestätigt" wenn `!emailVerified` und `hasPassword`)
- Test: `tests/integration/auth.test.ts` erweitern (Login), `tests/integration/players-update.test.ts` erweitern, `tests/unit/refresh-token.test.ts` und `tests/integration/refresh-lookup.test.ts` erweitern, `tests/integration/members.test.ts` erweitern (Spielerliste)

**Interfaces:**
- Produces: `PlayerLookup.email: string`; `refreshTokenFromPlayer` setzt `token.email = player.email`.
- Produces: die Admin-Spielerliste liefert zusätzlich `emailVerified`.

- [ ] **Step 1: Failing Tests**

```ts
it("login with 'Patrick@Example.com ' finds the account stored lowercase")
it("admin email change resets emailVerifiedAt and pendingEmail and stores lowercase")
it("admin email change with only different casing is a no-op (no audit row)")
it("refresh copies email from the lookup into the token")
it("admin player list includes emailVerified")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** `pnpm test` → PASS (ganze Suite, weil `PlayerLookup` sich ändert)
- [ ] **Step 5: Commit** `E-Mail kleingeschrieben, Admin-Änderung setzt Bestätigung zurück`

---

### Task 9: Profil-Abschnitt und Banner

**Files:**
- Create: `src/app/profil/email-form.tsx` (Client: aktuelle Adresse, `pendingEmail`-Hinweis „Bestätigung ausstehend für <adresse>", Feld neue Adresse, „Ändern", Button „Mail erneut senden")
- Create: `src/components/email-notice.tsx` (Server-Wrapper liest `email`, `emailVerifiedAt`, `pendingEmail`; rendert nichts wenn bestätigt) und `src/components/email-notice-client.tsx` (Client: schließbar via `sessionStorage["email-notice-dismissed"]`, Link „Zum Profil", bei nicht-Platzhalter zusätzlich Button „Mail erneut senden" → POST `/api/profile/email/resend`)
- Modify: `src/app/profil/page.tsx` (Select um `email`, `emailVerifiedAt`, `pendingEmail` erweitern; `EmailNotice` oben, neue Card „E-Mail-Adresse" vor „Passwort ändern")
- Modify: `src/app/page.tsx` (`EmailNotice` über dem Hero, nur wenn `ctx` vorhanden)
- Test: `tests/components/email-notice.test.tsx`, `tests/components/email-form.test.tsx`

**Interfaces:**
- Produces: `EmailNotice({ playerId }: { playerId: string })` (async Server Component), `EmailNoticeClient({ variant: "placeholder" | "unverified"; pending: string | null })`.
- Texte fest (Spec): Platzhalter (`email.endsWith("@padel.local")`) → „Hinterlege deine E-Mail-Adresse, damit du dein Passwort zurücksetzen kannst."; sonst → „Bitte bestätige deine E-Mail-Adresse." Erfolgsmeldung nach „Ändern": „Wir haben dir eine Mail an <adresse> geschickt."

- [ ] **Step 1: Failing Component-Tests** (jsdom, Muster in `tests/components`): Banner zeigt Platzhalter-Text bei `variant="placeholder"` ohne „erneut senden"; `unverified` zeigt Button; Klick auf Schließen setzt `sessionStorage` und entfernt das Banner; `EmailForm` zeigt 409-Meldung „Diese Adresse ist schon vergeben." und 503-Meldung „Mail konnte nicht gesendet werden, bitte später erneut versuchen."
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren** in der bestehenden Design-Sprache (`Card`, `Input`, `Label`, `Button`, Status-Absätze wie in `change-password-form.tsx`).
- [ ] **Step 4: Run** → PASS; `pnpm lint` und `pnpm tsc --noEmit` grün.
- [ ] **Step 5: Commit** `Profil: E-Mail-Adresse ändern, Hinweisbanner`

---

### Task 10: Öffentliche Seiten

**Files:**
- Create: `src/app/email-bestaetigen/[token]/page.tsx` + `confirm-button.tsx` (Client: POST confirm beim Klick „Adresse bestätigen"; Erfolg „Adresse bestätigt" mit Link „Zur App"; Fehler „Dieser Link ist ungültig oder abgelaufen." bzw. „Diese Adresse ist inzwischen vergeben.")
- Create: `src/app/passwort-vergessen/page.tsx` + `request-form.tsx` (Feld E-Mail; nach Absenden immer: „Wenn ein Konto mit bestätigter Adresse existiert, haben wir eine Mail geschickt.")
- Create: `src/app/passwort-zuruecksetzen/[token]/page.tsx` + `reset-form.tsx` (neues Passwort zweimal; Erfolg „Passwort geändert" mit Link `/login`; Fehler wie oben)
- Modify: `src/app/login/login-form.tsx` (Link „Passwort vergessen?" unter dem Button)
- Modify: `src/middleware.ts` – keine Änderung nötig: die Middleware leitet nicht um (kein `authorized`-Callback), die Seiten prüfen selbst. Im PR-Text vermerken.
- Test: `tests/components/public-pages.test.tsx`

**Interfaces:**
- Consumes: Task-7-Routen. Seiten sind Server Components ohne `auth()`-Redirect; das Layout `AppShell` rendert ohne Session nur `children` (bereits so). Gestaltung wie `src/app/login/page.tsx` (zentrierte Karte, Logo).

- [ ] **Step 1: Failing Component-Tests** – Request-Form zeigt nach 204 den festen Hinweistext; Reset-Form meldet Mismatch „Die Passwörter stimmen nicht überein." ohne Request; Confirm-Button ruft `/api/email-verification/confirm` mit dem Token.
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS; `pnpm build` grün.
- [ ] **Step 5: Commit** `Öffentliche Seiten: bestätigen, Passwort vergessen`

---

### Task 11: Doku, Deploy-Checkliste, Datenschutz-Stichpunkte

**Files:**
- Modify: `docs/DEPLOYMENT.md` (Abschnitt 4.3 `.env` um `MAIL_TRANSPORT`, `MAIL_FROM`, `RESEND_API_KEY`, `APP_URL`; neuer Abschnitt „Mail (Resend)" mit DNS-Checkliste: Domain in Resend anlegen, Region EU wählen falls angeboten, die angezeigten Einträge bei IONOS setzen (MX und SPF-TXT auf der Resend-Subdomain, DKIM-TXT `resend._domainkey`), bestehende IONOS-MX/SPF nicht anfassen, „Verify" in Resend, dann `MAIL_TRANSPORT=resend` und `systemctl restart padel`, Testmail über „Mail erneut senden" im Profil)
- Modify: `README.md` (Env-Tabelle, falls vorhanden; sonst kurzer Absatz)
- Create: `docs/legal/datenschutz-stichpunkte.md` (Stichpunkte aus der Spec: IONOS-VPS Deutschland, Resend als Auftragsverarbeiter, gespeicherte Daten, Session-Cookie, keine Analyse-Tools, Löschung über Profil (ab PR 4), Kontakt = Impressum)
- Modify: `.github/workflows/ci.yml` – keine Änderung nötig (`NODE_ENV=test` unter vitest → `memory`). Prüfen, dass `pnpm build` ohne `MAIL_TRANSPORT` läuft (Build ist nicht `production`-Laufzeit; `resolveTransportName` darf nur bei `sendMail` ausgewertet werden, nicht beim Import).

- [ ] **Step 1: Doku schreiben**
- [ ] **Step 2: Verifizieren** – `pnpm build` lokal ohne `MAIL_TRANSPORT` grün; `MAIL_TRANSPORT=memory NODE_ENV=production node -e 'require(...)'` ist nicht nötig: stattdessen Unit-Test aus Task 3 deckt die Regel ab.
- [ ] **Step 3: Commit** `Doku: Mail-Einrichtung, Datenschutz-Stichpunkte`

---

### Task 12: Abschluss

- [ ] **Step 1: Gesamte Prüfung** – `pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm build` grün.
- [ ] **Step 2: Lokaler Durchlauf** gegen die Dev-DB mit `MAIL_TRANSPORT=console`: Login mit Seed-Konto → Banner sichtbar → Adresse ändern → Link aus dem Dev-Log öffnen → bestätigen → Banner weg → Logout → „Passwort vergessen" → Link aus Log → neues Passwort → Login.
- [ ] **Step 3: Migrationsprobe** gegen den jüngsten Prod-Dump (`/root/backups/2026-11-02-pre-tenancy-6/db.dump`, lokal per `pg_restore` in Wegwerf-DB): `migrate deploy` wendet nur `20261103100000_email_tokens` an; `SELECT count(*) FROM "Player" WHERE email <> lower(email)` = 0; Zeilenzahlen unverändert. Ergebnis kurz in `docs/superpowers/plans/2026-11-03-public-use-pr1-rehearsal.md`.
- [ ] **Step 4: Push, PR** `feat/public-1-mail` → `main`, Titel „Öffentliche Nutzung PR 1: Mail und Adressen". PR-Text: was neu ist, Env-Variablen, Deploy-Hinweis (keine Downtime; `.env` vor dem Restart um `MAIL_TRANSPORT=console` ergänzen, sonst Startabbruch), Migrationsprobe. **Kein Merge während des Deploy-Freeze.**
