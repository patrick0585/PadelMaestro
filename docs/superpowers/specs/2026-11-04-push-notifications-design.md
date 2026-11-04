# Push-Benachrichtigungen für Spieltage (Design)

Stand 2026-11-04, abgestimmt mit Patrick im Gespräch („ja passt“ auf jeden
Teil). Phase 3 der App-Store-Roadmap
(`2026-11-02-app-store-roadmap.md`), baut auf der iOS-Hülle
(`docs/IOS.md`, Capacitor 8.6 im Remote-URL-Modus) auf.

## Absicht

Spieler sollen nicht mehr im Gruppenchat erinnert werden müssen. Wird ein
Spieltag angelegt, bekommt jeder sofort eine Nachricht aufs iPhone und kann
mit einem Tipp zu- oder absagen. Wer bis kurz vorher nicht reagiert hat,
wird erinnert.

## Ziele

1. **Neuer Spieltag:** Beim Anlegen eines Spieltags bekommen alle aktiven
   Mitglieder der Gruppe eine Nachricht, außer dem Admin, der ihn anlegt.
   Text: Titel „Neuer Spieltag“, Inhalt „{Gruppenname}: {Wochentag kurz},
   {TT.MM.} – bist du dabei?“ (z. B. „Donnerstagsrunde: Do, 12.11. – bist du
   dabei?“).
2. **Erinnerung 1:** am Vortag um 18:00 deutscher Zeit an alle aktiven
   Mitglieder, deren Teilnahme noch offen ist. Titel „Noch nicht abgestimmt“,
   Inhalt „{Gruppenname}: morgen ist Spieltag – bist du dabei?“.
3. **Erinnerung 2:** am Spieltag um 14:00 deutscher Zeit (4 Stunden vor dem
   Start um 18 Uhr), wieder nur an Offene. Inhalt „{Gruppenname}: heute um 18
   Uhr ist Spieltag – bist du dabei?“.
4. **Tipp auf die Nachricht** öffnet die App im Tab „Spieltag“ (`/game-day`)
   mit den Zu-/Absage-Knöpfen. Ist der Spieler in mehreren Gruppen und ist
   gerade eine andere aktiv, wechselt die App vorher in die Gruppe des
   Spieltags.
5. **Erlaubnis:** Die App fragt einmal nach der iOS-Erlaubnis, direkt nach
   dem ersten Login in der App. Wer ablehnt, bekommt nichts.
6. **Schalter im Profil** „Erinnerungen“ (Standard an): schaltet die beiden
   Erinnerungen ab; die Nachricht zum neuen Spieltag kommt weiterhin. Der
   Schalter ist nur in der App sichtbar.

## Regeln

- „Offen“ heißt: keine Teilnahme-Zeile oder Status `pending`. Wer nach dem
  Anlegen beitritt, hat keine Zeile, gilt also als offen und kann über den
  bestehenden Beitritt zusagen. `confirmed`,
  `declined` und `joker` gelten als abgestimmt.
- Nur Spieltage im Status `planned` lösen Erinnerungen aus. Gestartete,
  beendete oder gelöschte Spieltage nicht.
- Zeiten in `Europe/Berlin`, Sommer-/Winterzeit korrekt.
- Liegt ein Erinnerungszeitpunkt beim Anlegen schon in der Vergangenheit,
  entfällt diese Erinnerung (wird nicht nachgeholt). Wird ein Spieltag z. B.
  am Spieltag um 15 Uhr angelegt, kommt nur die Nachricht „Neuer Spieltag“.
- Jede Erinnerung geht pro Spieltag höchstens einmal raus, auch wenn der
  Zeitgeber ausfällt und später nachläuft oder doppelt läuft.
  Nachholen nur innerhalb von 2 Stunden nach dem Zeitpunkt; danach
  verfällt sie.
- Nur aktive Mitglieder (`Membership.removedAt = null`) der Gruppe des
  Spieltags.

## Nicht-Ziele

- Keine Benachrichtigungen im Browser oder in der Web-App auf dem
  Home-Bildschirm. Wer kein iPhone mit der App nutzt, geht leer aus.
- Android / Play Store (möglicher nächster Schritt).
- Startzeit pro Gruppe oder pro Spieltag einstellbar (18/14 Uhr sind fest).
- Weitere Anlässe (Spieltag gestartet, Ergebnisse, Saisonende).
- Badge-Zähler auf dem App-Icon.
- Benachrichtigungen per E-Mail.

## Anti-Ziele

- Ein Fehler beim Versand darf das Anlegen eines Spieltags nie verhindern
  oder spürbar verlangsamen (Versand nach dem Speichern, Fehler nur
  protokollieren).
- Keine doppelten Erinnerungen.
- Niemand bekommt Nachrichten aus einer Gruppe, aus der er entfernt wurde.
- Der Apple-Schlüssel (.p8) liegt nie im Repo und nie im Chat; nur auf dem
  Server in der `.env`-Umgebung bzw. einer Datei mit Rechten 600.

## Abhängigkeit Apple

Patricks Developer-Mitgliedschaft steht auf „Enrollment Pending“. Bis Team-ID
und APNs-Schlüssel da sind, ist der Versand per Konfiguration aus: Der
Server baut die Nachrichten vollständig und schreibt nur ins Protokoll, was er
verschickt hätte. Alles andere (Geräte, Schalter, Zeitgeber, Deep Link) wird
jetzt gebaut und getestet.

## Meine Festlegungen (Patrick kann sie kippen)

1. **Plugin:** `@capacitor/push-notifications` (offizielles Plugin, Version
   passend zu Capacitor 8). Auf iOS liefert es das APNs-Gerätetoken direkt,
   kein Firebase. Benötigt einmal einen neuen App-Build (Plugin und
   Capability „Push Notifications“; kein Background Mode). Entitlement `aps-environment` im Xcode-Projekt, ohne
   `DEVELOPMENT_TEAM` zu committen.
2. **Versand:** direkt über APNs HTTP/2 mit Token-Authentifizierung (JWT aus
   .p8, Key-ID, Team-ID), mit Node-Bordmitteln (`node:http2`, `node:crypto`)
   statt einer zusätzlichen Bibliothek. JWT wird zwischengespeichert und
   spätestens nach 50 Minuten erneuert.
   **Umgebung pro Gerät:** Xcode-Debug-Builds liefern Sandbox-Tokens,
   TestFlight/App Store Production-Tokens, und wegen des Remote-URL-Modus
   melden sich beide beim selben Prod-Server. Jedes Gerät speichert daher
   seine APNs-Umgebung (`environment`, anfangs `production`). Antwortet APNs
   mit `BadDeviceToken`, versucht der Server einmal die andere Umgebung und
   speichert sie bei Erfolg am Gerät; erst wenn beide scheitern, wird das
   Gerät gelöscht. Die App muss ihre Umgebung nicht kennen.
3. **Konfiguration** (Umgebungsvariablen): `APNS_KEY_ID`, `APNS_TEAM_ID`,
   `APNS_KEY_PATH`, `APNS_BUNDLE_ID` (`de.padelmaestro.app`); `APNS_ENV`
   entfällt (siehe Umgebung pro Gerät). Fehlt eine davon, ist der Versand aus
   (Protokoll-Modus), ohne Absturz beim Start.
4. **Datenmodell:**
   - `PushDevice`: `id`, `playerId`, `token` (eindeutig), `platform`
     (`ios`), `environment` (`sandbox`|`production`), `createdAt`,
     `lastSeenAt`. Ein Spieler kann mehrere Geräte
     haben; meldet sich ein anderer Spieler auf demselben Gerät an, wandert
     das Token zu ihm.
   - `Player.pushRemindersEnabled Boolean @default(true)`.
   - `PushReminderSent`: `gameDayId`, `kind` (`day_before`|`same_day`),
     `sentAt`; eindeutig auf (`gameDayId`, `kind`), Cascade beim Löschen des
     Spieltags (Spieltage werden hart gelöscht). Wird vor dem Versand
     eingetragen, damit doppelte Läufe nichts doppelt schicken.
5. **API:**
   - `POST /api/push/devices` `{ token, platform: "ios" }` – meldet/aktualisiert
     das Gerät des angemeldeten Spielers.
   - `DELETE /api/push/devices` `{ token }` – beim Logout in der App.
   - `PATCH /api/profile/push` `{ remindersEnabled: boolean }`.
   Alle mit Session, CSRF wie die übrigen Routen.
6. **Ungültige Tokens:** Antwortet APNs mit 410 `Unregistered`, wird das
   Gerät gelöscht; `BadDeviceToken` siehe Umgebung pro Gerät.
   Deep Link in eine Gruppe, aus der der Spieler inzwischen entfernt wurde:
   kein Wechsel, einfach `/game-day` der aktiven Gruppe.
7. **Zeitgeber:** systemd-Timer `padel-push-reminders.timer` alle 5 Minuten
   (Muster wie `scripts/backup/`), ruft ein Skript, das fällige Erinnerungen
   ermittelt und verschickt. Kein In-Prozess-Intervall, damit Neustarts und
   Deploys nichts verlieren. Installationsskript und Doku wie beim Backup.
8. **Nachricht zum neuen Spieltag:** wird nach erfolgreichem
   `createGameDay` angestoßen (nicht innerhalb der Transaktion), ohne auf den
   Versand zu warten; Fehler nur ins Log.
9. **Deep Link:** Die Nachricht trägt `{ gameDayId, groupId }`. Ein
   Web-Komponente (nur wenn `isNativeApp()`) hört auf
   `pushNotificationActionPerformed`, wechselt bei Bedarf über die bestehende
   Route `PATCH /api/profile/active-group` die Gruppe und navigiert dann auf
   `/game-day`. Auch beim Kaltstart der App durch den Tipp.
10. **Erlaubnis-Abfrage:** dieselbe Komponente fragt nach dem Login einmal
    (`requestPermissions`), registriert bei Erlaubnis und schickt das Token an
    den Server. Bei jedem App-Start wird das Token erneut gemeldet
    (`lastSeenAt`), weil iOS es ändern kann.
11. **Logout in der App:** meldet das Gerät vorher ab (`DELETE`), damit ein
    anderer Spieler am selben iPhone keine fremden Nachrichten bekommt.
12. **Profil-Schalter:** im Profil ein Listeneintrag „Erinnerungen“ mit
    Schalter im Stil der neuen Verwaltung (`src/components/ui/list.tsx`),
    Fußnote „Erinnerung am Vortag um 18 Uhr und am Spieltag um 14 Uhr, wenn
    du noch nicht abgestimmt hast.“
13. **Audit:** kein Audit-Eintrag pro Nachricht; Versand und Fehler ins
    App-Log mit Spieltag-ID und Anzahl Empfänger.

## Abnahme

- Tests: Empfängerauswahl (Ersteller ausgenommen, entfernte Mitglieder
  ausgenommen, Erinnerung nur an Offene, Schalter aus → keine Erinnerung,
  aber Nachricht zum neuen Spieltag), Zeitpunkte inkl. Zeitumstellung,
  kein doppelter Versand bei zwei Läufen, Verfall nach 2 Stunden,
  Spieltag gestartet/gelöscht → keine Erinnerung, 410 löscht Gerät,
  fehlende Konfiguration → Protokoll-Modus.
- Lokal: Spieltag anlegen zeigt im Log die gebauten Nachrichten.
- Im Simulator: Erlaubnis-Abfrage erscheint, Token wird gemeldet (Simulator
  kann seit Xcode 14 echte Tokens auf Apple-Silicon-Macs liefern, sonst
  `.apns`-Datei per Drag & Drop für den Deep-Link-Test).
- Nach Apple-Freischaltung: echter Versand auf Patricks iPhone, Tipp öffnet
  `/game-day` der richtigen Gruppe.
