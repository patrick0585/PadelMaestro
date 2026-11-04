# Push-Benachrichtigungen – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhone-App-Nutzer bekommen eine Nachricht beim Anlegen eines Spieltags und zwei Erinnerungen, solange sie offen sind; ein Tipp führt auf `/game-day` der richtigen Gruppe.

**Architecture:** Server-Modul `src/lib/push/` (Konfiguration, APNs-Versand über `node:http2`, Empfänger, Texte, Auslöser). Geräte und Erinnerungsprotokoll in Postgres. Erinnerungen über einen systemd-Timer, der alle 5 Minuten ein `tsx`-Skript startet. In der App eine Client-Komponente, die Erlaubnis, Registrierung und Tipp behandelt.

**Tech Stack:** Prisma/Postgres, Next.js Route Handler mit zod, `node:http2` + `node:crypto` (ES256-JWT), `@capacitor/push-notifications`, systemd, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-push-notifications-design.md`

## Global Constraints

- Nur iOS-App (`isNativeApp()`); Browser/PWA bekommen nichts und sehen den Schalter nicht.
- Texte exakt: neuer Spieltag Titel „Neuer Spieltag“, Inhalt „{Gruppenname}: {Wochentag kurz}, {TT.MM.} – bist du dabei?“ (Wochentag `Mo Di Mi Do Fr Sa So`, z. B. „Donnerstagsrunde: Do, 12.11. – bist du dabei?“); Vortag Titel „Noch nicht abgestimmt“, Inhalt „{Gruppenname}: morgen ist Spieltag – bist du dabei?“; Spieltag Titel „Noch nicht abgestimmt“, Inhalt „{Gruppenname}: heute um 18 Uhr ist Spieltag – bist du dabei?“.
- Zeitpunkte `Europe/Berlin`: `day_before` = Vortag 18:00, `same_day` = Spieltag 14:00. Nachholfenster 2 Stunden; danach verfällt die Erinnerung.
- „Offen“ = Teilnahme fehlt oder `pending`. Empfänger nur aktive Mitglieder (`Membership.removedAt = null`) mit `Player.deletedAt = null`. Ersteller bekommt die Nachricht zum neuen Spieltag nicht. `pushRemindersEnabled = false` unterdrückt nur Erinnerungen.
- Nur Spieltage `planned` bekommen Erinnerungen.
- Payload `{ aps: { alert: { title, body }, sound: "default" }, gameDayId, groupId }`.
- Konfiguration `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_PATH`, `APNS_BUNDLE_ID`; fehlt eine → Protokoll-Modus (Log `[push] dry-run …`), kein Absturz. Schlüssel nie im Repo.
- Umgebung pro Gerät (`sandbox`|`production`, Default `production`); bei `BadDeviceToken` einmal die andere Umgebung, bei Erfolg am Gerät speichern; beide scheitern oder 410 `Unregistered` → Gerät löschen.
- Versandfehler verhindern nie das Anlegen eines Spieltags.
- Profil-Fußnote: „Erinnerung am Vortag um 18 Uhr und am Spieltag um 14 Uhr, wenn du noch nicht abgestimmt hast.“
- `DEVELOPMENT_TEAM` nie committen. Commits deutsch und kurz, ohne Tool-Hinweise. Tests: `set -a; . ./.env; set +a; node node_modules/vitest/vitest.mjs run <file>`; Typecheck `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`. Nach Schemaänderung `next dev` neu starten.

## Review Focus

- **Zeitumstellung:** Spieltag 2026-10-25 → `day_before` 2026-10-24T16:00Z, `same_day` 2026-10-25T13:00Z; Spieltag 2027-03-28 → `day_before` 2027-03-27T17:00Z, `same_day` 2027-03-28T12:00Z. Test in Task 3.
- **Zwei Timer-Läufe gleichzeitig / direkt nacheinander:** genau ein Versand pro (`gameDayId`, `kind`), weil die Protokollzeile vor dem Versand per Unique-Constraint entsteht. Test in Task 3.
- **Gerät wechselt den Spieler** (Logout, anderer Login am selben iPhone): Token gehört danach nur dem neuen Spieler. Test in Task 1.
- **Sandbox-Token am Prod-Server:** `BadDeviceToken` in `production`, Erfolg in `sandbox` → Gerät bleibt, `environment = sandbox`. Test in Task 2.
- **Kaltstart durch Tipp:** Listener wird registriert, bevor die Komponente sonst etwas tut, damit das Ereignis nicht verloren geht. Test in Task 4.

---

### Task 1: Datenmodell, Geräte- und Schalter-API

**Files:**
- Modify: `prisma/schema.prisma`; Create: `prisma/migrations/20261107100000_push/migration.sql`
- Create: `src/lib/push/devices.ts`, `src/app/api/push/devices/route.ts`, `src/app/api/profile/push/route.ts`
- Modify: `src/lib/account/delete.ts` (Geräte des Spielers löschen)
- Test: `tests/integration/push-devices.test.ts`

**Interfaces:**
- Produces: Prisma-Modelle `PushDevice { id, playerId, token @unique, platform String @default("ios"), environment String @default("production"), createdAt, lastSeenAt }` (FK Player, `onDelete: Cascade`, `@@index([playerId])`); `Player.pushRemindersEnabled Boolean @default(true)`; `PushReminderSent { id, gameDayId, kind String, sentAt @default(now()) }` mit `@@unique([gameDayId, kind])`, FK GameDay `onDelete: Cascade`.
- Produces: `registerDevice(i: { playerId: string; token: string }): Promise<void>` (Upsert auf `token`, setzt `playerId`, `lastSeenAt = now`); `unregisterDevice(i: { playerId: string; token: string }): Promise<void>` (löscht nur, wenn das Token diesem Spieler gehört); `setRemindersEnabled(playerId: string, enabled: boolean): Promise<void>`.
- Routen: `POST /api/push/devices` Body `{ token: string (1–200 Zeichen, nur [0-9a-fA-F]), platform: "ios" }` → 204; `DELETE /api/push/devices` Body `{ token }` → 204; `PATCH /api/profile/push` Body `{ remindersEnabled: boolean }` → 200 `{ remindersEnabled }`. Ohne Session 401, ungültig 400 `invalid`. Session-Prüfung wie `src/app/api/profile/active-group/route.ts`.

- [ ] **Step 1: Tests:** Registrieren legt Gerät an; erneutes Registrieren aktualisiert `lastSeenAt`, keine zweite Zeile; Spieler B registriert dasselbe Token → gehört B, A hat keins mehr; `unregisterDevice` durch fremden Spieler löscht nichts; Route ohne Session 401; Token mit Nicht-Hex-Zeichen 400; `PATCH /api/profile/push` false → gespeichert; Kontolöschung entfernt Geräte.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, Migration mit `migrate dev --name push` erzeugen und auf den Ordnernamen `20261107100000_push` umbenennen. **Step 4: Run** → PASS, `tsc`.
- [ ] **Step 5: Commit** `"Geräte für Push-Benachrichtigungen speichern"`

### Task 2: APNs-Versand

**Files:**
- Create: `src/lib/push/config.ts`, `src/lib/push/apns.ts`, `src/lib/push/send.ts`
- Test: `tests/unit/push-apns.test.ts`, `tests/integration/push-send.test.ts`

**Interfaces:**
- Consumes: `PushDevice` aus Task 1.
- Produces: `type ApnsConfig = { keyId; teamId; keyPem; bundleId }`; `loadApnsConfig(env = process.env): ApnsConfig | null` (liest Datei `APNS_KEY_PATH`; fehlt etwas oder Datei unlesbar → `null` und einmalige Warnung).
- Produces: `type ApnsResult = { ok: true } | { ok: false; status: number; reason: string }`; `type ApnsTransport = (i: { environment: "sandbox" | "production"; token: string; payload: object; config: ApnsConfig }) => Promise<ApnsResult>`; `http2Transport: ApnsTransport` (Host `api.sandbox.push.apple.com` bzw. `api.push.apple.com`, Pfad `/3/device/<token>`, Header `authorization: bearer <jwt>`, `apns-topic: bundleId`, `apns-push-type: alert`, `apns-priority: 10`; JWT ES256 `{alg, kid}`/`{iss: teamId, iat}`, zwischengespeichert bis 50 min Alter; Session pro Host wiederverwenden).
- Produces: `type PushMessage = { title: string; body: string; gameDayId: string; groupId: string }`; `sendToPlayers(playerIds: string[], message: PushMessage, deps?: { transport?: ApnsTransport; config?: ApnsConfig | null }): Promise<{ sent: number; removed: number; dryRun: boolean }>`. Ohne Config: loggt `[push] dry-run` mit Titel, Inhalt und Geräteanzahl, sendet nichts. Mit Config: pro Gerät senden, Umgebungs-Fallback und Löschregeln aus den Global Constraints, Fehler einzelner Geräte loggen statt werfen.

- [ ] **Step 1: Tests** mit gefälschtem Transport: Erfolg zählt `sent`; 410 `Unregistered` löscht Gerät; `BadDeviceToken` in production + Erfolg in sandbox → Gerät bleibt mit `environment = "sandbox"`; beide `BadDeviceToken` → gelöscht; Transport wirft → kein Throw aus `sendToPlayers`, Gerät bleibt; ohne Config → `dryRun: true`, Transport nie aufgerufen; Payload entspricht der Global-Constraint-Form. Unit: JWT-Header/Claims korrekt und mit dem Public Key eines Test-Schlüsselpaars (`crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })`) verifizierbar; zweiter Aufruf innerhalb 50 min liefert dasselbe JWT; `loadApnsConfig` mit fehlender Variable → `null`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, `tsc`.
- [ ] **Step 5: Commit** `"Versand über Apple Push"`

### Task 3: Auslöser – neuer Spieltag und Erinnerungen

**Files:**
- Create: `src/lib/push/messages.ts`, `src/lib/push/recipients.ts`, `src/lib/push/notify-game-day.ts`, `src/lib/push/reminders.ts`, `scripts/push-reminders.ts`, `scripts/push/padel-push-reminders.service`, `scripts/push/padel-push-reminders.timer`, `scripts/push/install.sh`
- Modify: `src/app/api/game-days/route.ts` (nach `createGameDay`), `docs/DEPLOYMENT.md` (Abschnitt Push: Variablen, Schlüsseldatei mit Rechten 600 im Besitz von `padel`, `install.sh`)
- Test: `tests/unit/push-messages.test.ts`, `tests/integration/push-notify.test.ts`, `tests/integration/push-reminders.test.ts`

**Interfaces:**
- Consumes: `sendToPlayers`, `PushMessage`.
- Produces: `newGameDayMessage(groupName: string, date: Date): Pick<PushMessage,"title"|"body">`, `reminderMessage(kind: ReminderKind, groupName: string)`; `type ReminderKind = "day_before" | "same_day"`; `reminderTime(kind: ReminderKind, gameDayDate: Date): Date` (Datum ist `@db.Date`, also UTC-Mitternacht des Kalendertags; Berlin-Offset per `Intl.DateTimeFormat` mit `timeZone: "Europe/Berlin"` bestimmen, keine neue Abhängigkeit).
- Produces: `newGameDayRecipients(gameDayId: string, excludePlayerId: string): Promise<string[]>`; `reminderRecipients(gameDayId: string): Promise<string[]>` (offen, Schalter an).
- Produces: `notifyNewGameDay(gameDayId: string, actorId: string, deps?): Promise<void>` (wirft nie); `sendDueReminders(now: Date, deps?): Promise<{ kind: ReminderKind; gameDayId: string; sent: number }[]>` – für jeden `planned`-Spieltag und jede Art mit `reminderTime ≤ now < reminderTime + 2h`: erst `PushReminderSent` anlegen (Unique-Verletzung → überspringen), dann senden.
- Route: ruft `void notifyNewGameDay(day.id, g.ctx.userId)` nach erfolgreichem Anlegen, ohne `await`.
- Skript: `scripts/push-reminders.ts` ruft `sendDueReminders(new Date())`, loggt das Ergebnis, beendet mit `prisma.$disconnect()`. Service `Type=oneshot`, `User=padel`, `WorkingDirectory=/srv/padel/app`, `EnvironmentFile=/srv/padel/app/.env`, `ExecStart=/srv/padel/app/node_modules/.bin/tsx scripts/push-reminders.ts`; Timer `OnCalendar=*:0/5`, `Persistent=true`. `install.sh` nach Muster `scripts/backup/install.sh` (ohne Smoke-Versand, nur `systemctl start` des Dienstes im Dry-Run zulässig).

- [ ] **Step 1: Tests:** Texte inkl. Wochentag und `TT.MM.` (Do, 12.11.2026); `reminderTime` für die vier Review-Focus-Werte und einen Wintertag; neuer Spieltag: Ersteller, entfernte und gelöschte Spieler ausgenommen, Schalter aus bekommt trotzdem; Erinnerung nur an `pending`/fehlend, nicht an `confirmed`/`declined`/`joker`, nicht bei Schalter aus; `sendDueReminders` vor dem Zeitpunkt → nichts, im Fenster → Versand, zweiter Lauf → nichts, zwei parallele Läufe (`Promise.all`) → genau ein Versand, 2 h + 1 min danach → nichts, Spieltag `in_progress` → nichts, Spieltag gelöscht → seine `PushReminderSent`-Zeilen sind per Cascade weg; Route: Transport wirft → trotzdem 201.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, volle Suite, `tsc`.
- [ ] **Step 5: Commit** `"Nachricht bei neuem Spieltag und Erinnerungen"`

### Task 4: App – Erlaubnis, Registrierung, Tipp, Logout

**Files:**
- Modify: `package.json` (`@capacitor/push-notifications` passend zu Capacitor 8, exakte Version), `ios/App/App/AppDelegate.swift` (Weiterleitung `didRegisterForRemoteNotificationsWithDeviceToken` / `didFailToRegister…` an `NotificationCenter` gemäß Plugin-Doku), `ios/App/App/App.entitlements` neu mit `aps-environment = development` und im Projekt eingetragen (ohne `DEVELOPMENT_TEAM`), `docs/IOS.md` (Capability, Simulator-Test mit `.apns`-Datei)
- Create: `src/components/native-push.tsx`; Modify: `src/app/layout.tsx` (neben `NativeSplashHide`, nur für angemeldete Nutzer gerendert), `src/components/user-menu.tsx` und `src/app/profil/delete-account-dialog.tsx` (vor `signOut` Gerät abmelden)
- Create: `src/lib/push/client.ts`
- Test: `tests/components/native-push.test.tsx`, `tests/unit/push-client.test.ts`

**Interfaces:**
- Consumes: Routen aus Task 1, `PATCH /api/profile/active-group`, `isNativeApp()`.
- Produces: `src/lib/push/client.ts`: `getPushPlugin()` liest `window.Capacitor?.Plugins?.PushNotifications` (kein statischer Import im Server-Bundle); `unregisterThisDevice(): Promise<void>` (liest das zuletzt gemeldete Token aus `localStorage` Key `pm.pushToken`, sendet `DELETE`, Fehler schlucken, Key löschen).
- Produces: `NativePush({ activeGroupId }: { activeGroupId: string | null })`: tut nichts ohne `isNativeApp()`; registriert zuerst die Listener `registration` (Token per `POST` melden, in `localStorage` speichern), `registrationError` (loggen) und `pushNotificationActionPerformed` (bei `groupId !== activeGroupId` erst `PATCH /api/profile/active-group`, bei 403 ignorieren, dann `router.push("/game-day")` und `router.refresh()`); danach `checkPermissions` → bei `prompt` `requestPermissions`, bei `granted` `register()`. Listener beim Unmount entfernen.

- [ ] **Step 1: Tests** mit gefälschtem Plugin auf `window.Capacitor`: außerhalb der App kein Plugin-Aufruf; Listener vor `requestPermissions` registriert; `granted` → `register`; Token-Ereignis → `POST /api/push/devices` mit Token und `localStorage`; Tipp mit fremder `groupId` → erst PATCH, dann Navigation `/game-day`; gleiche Gruppe → kein PATCH; PATCH 403 → trotzdem Navigation; `unregisterThisDevice` sendet DELETE und löscht den Key, ohne Token kein Request.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**, `pnpm install`, `pnpm cap:sync`; Build im Simulator per `xcodebuild` (wie in `docs/IOS.md`) muss durchlaufen. **Step 4: Run** → PASS, volle Suite, `tsc`.
- [ ] **Step 5: Commit** `"App fragt nach Benachrichtigungen und öffnet den Spieltag"`

### Task 5: Schalter „Erinnerungen“ im Profil

**Files:**
- Create: `src/app/profil/push-settings.tsx`; Modify: `src/app/profil/page.tsx` (lädt `pushRemindersEnabled`)
- Test: `tests/components/push-settings.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/profile/push`, `isNativeApp()`, `GroupedList`/`ListRow`/`SectionFooter` aus `src/components/ui/list.tsx`.
- Produces: `PushSettings({ remindersEnabled }: { remindersEnabled: boolean })` – rendert nur in der App (nach Mount prüfen, damit kein Hydration-Fehler entsteht); Abschnitt „Benachrichtigungen“, Zeile „Erinnerungen“ mit Schalter `role="switch"` und `aria-checked`; Umschalten sendet sofort PATCH, bei Fehler zurück auf den alten Wert und Hinweis „Konnte nicht gespeichert werden.“; Fußnote aus den Global Constraints.

- [ ] **Step 1: Tests:** außerhalb der App nichts gerendert; in der App Zeile und Fußnote sichtbar; Klick sendet `{ remindersEnabled: false }`; Fehlerantwort setzt zurück und zeigt den Hinweis.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS, volle Suite, `tsc`.
- [ ] **Step 5: Commit** `"Erinnerungen im Profil abschaltbar"`
