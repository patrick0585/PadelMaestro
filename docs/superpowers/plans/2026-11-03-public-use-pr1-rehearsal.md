# Migrationsprobe PR 1 (Öffentliche Nutzung: Mail und Adressen)

Datum: 2026-11-03
Dump: Produktions-Backup (pg_dump, custom format, 113 KB; Backup vom 2026-11-02, laut Migrationstabelle Stand **vor** dem PR-6-Deploy), eingespielt in eine Wegwerf-Postgres-16-DB (Docker, Port 5438).

Der Dump enthält `20261102180000_drop_player_is_admin` noch nicht (`Player.isAdmin` vorhanden). Deshalb zwei Varianten:

- **A (Soll-Weg):** erst PR 6 allein migriert (Migrationsordner ohne die Migrationen dieses Branches), dann `migrate deploy` mit diesem Branch (`20261103100000_email_tokens` und `20261103120000_session_version`).
- **B (PR 6 noch nicht deployt):** frischer Restore, `migrate deploy` mit diesem Branch direkt.

## Ablauf

1. Dump eingespielt (`pg_restore --no-owner --no-acl`), keine Warnungen.
2. Zählungen, Prüf-SQL und Migrationsliste vorher (12 angewendete Migrationen, letzte `20261102160000_group_required`; dazu ein alter, zurückgerollter Eintrag `20260422081917_add_gameday_date_unique` vom April, der später erfolgreich lief).
3. A: `migrate deploy` mit Ordner bis PR 6 wendete nur `20261102180000_drop_player_is_admin` an; danach wendete `migrate deploy` mit diesem Branch nur `20261103100000_email_tokens` an.
4. B: Datenbank neu angelegt, Dump erneut eingespielt; `migrate deploy` wendete `20261102180000_drop_player_is_admin` und `20261103100000_email_tokens` an.
5. Jeweils Zählungen, Spaltenprüfung und `prisma migrate diff` nachher.
6. Zweiter Lauf A (2026-11-03, nach Hinzufügen von `20261103120000_session_version`): frischer Container, Dump eingespielt (`pg_restore` ohne Warnungen), Vorab-Prüfung inklusive Kleinschreib-Kollisionen, `migrate deploy` bis PR 6 wendete nur `20261102180000_drop_player_is_admin` an, danach `migrate deploy` mit diesem Branch `20261103100000_email_tokens` und `20261103120000_session_version`. Variante B wurde nicht wiederholt.

## Zahlen vorher/nachher

| Tabelle | Vorher | Nachher A | Nachher B | Nachher A (2. Lauf) |
|---|---|---|---|---|
| Player | 6 | 6 | 6 | 6 |
| Membership | 6 | 6 | 6 | 6 |
| Season | 2 | 2 | 2 | 2 |
| GameDay | 33 | 33 | 33 | 33 |
| Match | 469 | 469 | 469 | 469 |
| GameDayParticipant | 187 | 187 | 187 | 187 |
| JokerUse | 10 | 10 | 10 | 10 |
| AuditLog | 211 | 211 | 211 | 211 |
| Group | 1 | 1 | 1 | 1 |

## Prüf-SQL

| Prüfung | Vorher | Soll | Nachher (A und B) |
|---|---|---|---|
| `SELECT lower(email), count(*) FROM "Player" GROUP BY 1 HAVING count(*) > 1` | leer | leer | leer |
| `SELECT count(*) FROM "Player" WHERE email <> lower(email)` | 0 | 0 | 0 |
| Spalten `emailVerifiedAt`, `pendingEmail`, `termsAcceptedAt` an `Player` (nullable) | fehlen | 3 | 3 |
| Tabelle `EmailToken` (`to_regclass`) | fehlt | vorhanden | vorhanden, 0 Zeilen |
| Player mit `emailVerifiedAt IS NOT NULL` | – | 0 | 0 |
| Player mit `@padel.local`-Adresse | 6 | – | 6 (alle sehen den Platzhalter-Hinweis) |
| Spalte `sessionVersion` an `Player` (2. Lauf) | fehlt | `integer NOT NULL DEFAULT 0` | vorhanden, alle 6 Player auf 0 |

Das `UPDATE … lower(email)` der Migration ist auf diesem Stand also wirkungslos. `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` meldet in beiden Varianten und im zweiten Lauf A „No difference detected.“ (Exit 0), also kein Drift.

## Laufzeit

`prisma migrate deploy` je Lauf 0,5 s (Wanduhr, inklusive Prisma-Start), in A und B gleich; im zweiten Lauf A 0,56 s (PR 6) und 0,52 s (beide Migrationen dieses Branches).

## Fazit

Alle Prüfungen bestanden, Zeilenzahlen unverändert, neue Spalten und Tabelle vorhanden, alle Adressen unbestätigt, kein Schema-Drift. Die Migrationen fügen nur hinzu, der alte Code läuft mit dem neuen Schema weiter. Container und Volume wurden danach jeweils gelöscht.

`sessionVersion` startet bei 0. Bestehende Sitzungen tragen das Feld noch nicht und zählen als Version 0, der Deploy meldet also niemanden ab.

Wichtig: Ist PR 6 auf Produktion noch nicht deployt, zieht dieser Deploy `drop_player_is_admin` mit (Variante B). Das braucht die Downtime-Prozedur aus `2026-11-02-tenancy-pr6-rehearsal.md`. Deshalb PR 6 zuerst nach seinem eigenen Ablauf deployen.

## Deploy-Ablauf

Keine Downtime nötig, sofern PR 6 schon läuft.

1. Vorab-Prüfung (`sudo -u postgres psql padel_tracker`):
   - `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1;` muss `20261102180000_drop_player_is_admin` sein. Sonst abbrechen und zuerst PR 6 deployen.
   - `SELECT lower(email), count(*) FROM "Player" GROUP BY 1 HAVING count(*) > 1;` muss leer sein. Sonst abbrechen: das `UPDATE … lower(email)` der Migration würde am Unique-Index scheitern.
2. `.env` ergänzen (als root), BEVOR `deploy.sh` läuft. Ohne `MAIL_TRANSPORT` bricht der Start ab (Prüfung in `src/instrumentation.ts`, siehe Startverhalten unten):
   ```
   MAIL_TRANSPORT=console
   MAIL_FROM="Padelmaestro <noreply@padelmaestro.de>"
   RESEND_API_KEY=""
   APP_URL="https://padelmaestro.de"
   ```
   Danach `chown padel:padel /srv/padel/app/.env && chmod 600 /srv/padel/app/.env`.
3. Dump nach `/root/backups/<datum>-pre-public-1/db.dump` (`sudo -u postgres pg_dump -Fc padel_tracker`).
4. `sudo -u padel -H bash /srv/padel/app/scripts/deploy.sh` (zieht, migriert, baut, startet neu; sein Health-Check auf :3000 schlägt fälschlich fehl).
5. Prüfen: `systemctl is-active padel` (einige Sekunden nach dem Neustart, siehe unten), `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/login` = 200, `.../passwort-vergessen` = 200, `tail -n 50 /srv/padel/logs/app.err.log` seit dem Neustart ohne Fehler (insbesondere keine `[startup] …`-Zeile). Die App schreibt nach `/srv/padel/logs/app.log` und `app.err.log`; `journalctl -u padel` zeigt nur systemd-Statuszeilen. Mit `Restart=on-failure` startet systemd den Dienst bei fehlerhafter Mail-Konfiguration alle 5 s neu, deshalb nach dem Neustart `systemctl is-active padel` zweimal im Abstand einiger Sekunden prüfen und in `app.err.log` nach `[startup]` suchen.
6. Mail-Weg prüfen: Die Warnung `[mail] MAIL_TRANSPORT=console: mails are only logged` erscheint einmal beim Start. Passwort-Reset-Mails gehen nur an bestätigte Adressen, also direkt nach dem Deploy an niemanden. Zum Prüfen im eigenen Profil eine echte Adresse eintragen: danach steht die `[mail]`-Zeile mit Bestätigungslink in `/srv/padel/logs/app.log` (`grep '\[mail\]' /srv/padel/logs/app.log | tail -n 5`). Link öffnen, Profil zeigt „Bestätigt“.
7. Prüf-SQL: Zeilenzahlen wie vor dem Deploy, `email <> lower(email)` = 0, Spalten (inklusive `sessionVersion`, alle 0) und `EmailToken` vorhanden.

Startverhalten (lokal geprüft am 2026-11-03 mit `node .next/standalone/server.js`, `NODE_ENV=production`, Port 3999):

- Ohne `MAIL_TRANSPORT`: Prozess endet nach rund 1 s mit Exit 1, Ausgabe `[startup] MAIL_TRANSPORT must be "resend" or "console" in production`. Mit `MAIL_TRANSPORT=resend` ohne `RESEND_API_KEY` ebenso, Ausgabe `[startup] RESEND_API_KEY is required for MAIL_TRANSPORT=resend`. Unter systemd (`Restart=on-failure`) startet die Unit dann alle 5 s neu; `systemctl is-active` direkt nach dem Restart kann noch `active` melden, deshalb ein paar Sekunden warten und `/srv/padel/logs/app.err.log` prüfen.
- Hinweis: Ein bloßes `throw` in `register()` beendet Next 15.5 nicht. Der Prozess lief dann weiter und beantwortete jede Anfrage mit 500 (`/login`, `/api/auth/session`, `/passwort-vergessen`). Deshalb beendet `register()` den Prozess ausdrücklich mit `process.exit(1)`.
- Mit `MAIL_TRANSPORT=console`: Start normal, `/login` = 200, beim Start einmal `[mail] MAIL_TRANSPORT=console: mails are only logged`.

Rollback:

- Die Migrationen fügen nur Spalten, eine Tabelle und einen Enum hinzu. Der alte Code läuft damit weiter, Rollback heißt also nur: vorherigen Commit deployen. Spalten und Tabelle können bleiben.
- `.env` muss nicht zurückgesetzt werden, der alte Code ignoriert die Mail-Variablen.
- Schlägt eine Migration fehl: `prisma migrate resolve --rolled-back <name>` mit `20261103100000_email_tokens` bzw. `20261103120000_session_version` (als padel im App-Verzeichnis mit geladener .env), Ursache beheben, erneut deployen.
