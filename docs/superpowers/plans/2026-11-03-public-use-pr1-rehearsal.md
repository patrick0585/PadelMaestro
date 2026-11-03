# Migrationsprobe PR 1 (Öffentliche Nutzung: Mail und Adressen)

Datum: 2026-11-03
Dump: Produktions-Backup (pg_dump, custom format, 113 KB; Backup vom 2026-11-02, laut Migrationstabelle Stand **vor** dem PR-6-Deploy), eingespielt in eine Wegwerf-Postgres-16-DB (Docker, Port 5438).

Der Dump enthält `20261102180000_drop_player_is_admin` noch nicht (`Player.isAdmin` vorhanden). Deshalb zwei Varianten:

- **A (Soll-Weg):** erst PR 6 allein migriert (Migrationsordner ohne `email_tokens`), dann `migrate deploy` mit diesem Branch.
- **B (PR 6 noch nicht deployt):** frischer Restore, `migrate deploy` mit diesem Branch direkt.

## Ablauf

1. Dump eingespielt (`pg_restore --no-owner --no-acl`), keine Warnungen.
2. Zählungen, Prüf-SQL und Migrationsliste vorher (12 angewendete Migrationen, letzte `20261102160000_group_required`; dazu ein alter, zurückgerollter Eintrag `20260422081917_add_gameday_date_unique` vom April, der später erfolgreich lief).
3. A: `migrate deploy` mit Ordner bis PR 6 wendete nur `20261102180000_drop_player_is_admin` an; danach wendete `migrate deploy` mit diesem Branch nur `20261103100000_email_tokens` an.
4. B: Datenbank neu angelegt, Dump erneut eingespielt; `migrate deploy` wendete `20261102180000_drop_player_is_admin` und `20261103100000_email_tokens` an.
5. Jeweils Zählungen, Spaltenprüfung und `prisma migrate diff` nachher.

## Zahlen vorher/nachher

| Tabelle | Vorher | Nachher A | Nachher B |
|---|---|---|---|
| Player | 6 | 6 | 6 |
| Membership | 6 | 6 | 6 |
| Season | 2 | 2 | 2 |
| GameDay | 33 | 33 | 33 |
| Match | 469 | 469 | 469 |
| GameDayParticipant | 187 | 187 | 187 |
| JokerUse | 10 | 10 | 10 |
| AuditLog | 211 | 211 | 211 |
| Group | 1 | 1 | 1 |

## Prüf-SQL

| Prüfung | Vorher | Soll | Nachher (A und B) |
|---|---|---|---|
| `SELECT lower(email), count(*) FROM "Player" GROUP BY 1 HAVING count(*) > 1` | leer | leer | leer |
| `SELECT count(*) FROM "Player" WHERE email <> lower(email)` | 0 | 0 | 0 |
| Spalten `emailVerifiedAt`, `pendingEmail`, `termsAcceptedAt` an `Player` (nullable) | fehlen | 3 | 3 |
| Tabelle `EmailToken` (`to_regclass`) | fehlt | vorhanden | vorhanden, 0 Zeilen |
| Player mit `emailVerifiedAt IS NOT NULL` | – | 0 | 0 |
| Player mit `@padel.local`-Adresse | 6 | – | 6 (alle sehen den Platzhalter-Hinweis) |

Das `UPDATE … lower(email)` der Migration ist auf diesem Stand also wirkungslos. `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` meldet in beiden Varianten „No difference detected.“ (Exit 0), also kein Drift.

## Laufzeit

`prisma migrate deploy` je Lauf 0,5 s (Wanduhr, inklusive Prisma-Start), in A und B gleich.

## Fazit

Alle Prüfungen bestanden, Zeilenzahlen unverändert, neue Spalten und Tabelle vorhanden, alle Adressen unbestätigt, kein Schema-Drift. Die Migration fügt nur hinzu, der alte Code läuft mit dem neuen Schema weiter. Container und Volume wurden danach gelöscht.

Wichtig: Ist PR 6 auf Produktion noch nicht deployt, zieht dieser Deploy `drop_player_is_admin` mit (Variante B). Das braucht die Downtime-Prozedur aus `2026-11-02-tenancy-pr6-rehearsal.md`. Deshalb PR 6 zuerst nach seinem eigenen Ablauf deployen.

## Deploy-Ablauf

Keine Downtime nötig, sofern PR 6 schon läuft.

1. Vorab-Prüfung (`sudo -u postgres psql padel_tracker`): `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1;` muss `20261102180000_drop_player_is_admin` sein. Sonst abbrechen und zuerst PR 6 deployen.
2. `.env` ergänzen (als root), BEVOR `deploy.sh` läuft. Ohne `MAIL_TRANSPORT` bricht der Start ab (Prüfung in `src/instrumentation.ts`):
   ```
   MAIL_TRANSPORT=console
   MAIL_FROM="Padelmaestro <noreply@padelmaestro.de>"
   RESEND_API_KEY=""
   APP_URL="https://padelmaestro.de"
   ```
   Danach `chown padel:padel /srv/padel/app/.env && chmod 600 /srv/padel/app/.env`.
3. Dump nach `/root/backups/<datum>-pre-public-1/db.dump` (`sudo -u postgres pg_dump -Fc padel_tracker`).
4. `sudo -u padel -H bash /srv/padel/app/scripts/deploy.sh` (zieht, migriert, baut, startet neu; sein Health-Check auf :3000 schlägt fälschlich fehl).
5. Prüfen: `systemctl is-active padel`, `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/login` = 200, `.../passwort-vergessen` = 200, `journalctl -u padel --since -10min` ohne Fehler (insbesondere kein `MAIL_TRANSPORT must be …`).
6. Mail-Weg prüfen: Die Warnung `[mail] MAIL_TRANSPORT=console: mails are only logged` erscheint erst beim ersten Mailversand, nicht beim Start. Passwort-Reset-Mails gehen nur an bestätigte Adressen, also direkt nach dem Deploy an niemanden. Zum Prüfen im eigenen Profil eine echte Adresse eintragen: danach stehen Warnung und `[mail]`-Zeile mit Bestätigungslink im Journal. Link öffnen, Profil zeigt „Bestätigt“.
7. Prüf-SQL: Zeilenzahlen wie vor dem Deploy, `email <> lower(email)` = 0, Spalten und `EmailToken` vorhanden.

Rollback:

- Die Migration fügt nur Spalten, eine Tabelle und einen Enum hinzu. Der alte Code läuft damit weiter, Rollback heißt also nur: vorherigen Commit deployen. Spalten und Tabelle können bleiben.
- `.env` muss nicht zurückgesetzt werden, der alte Code ignoriert die Mail-Variablen.
- Schlägt die Migration fehl: `prisma migrate resolve --rolled-back 20261103100000_email_tokens` (als padel im App-Verzeichnis mit geladener .env), Ursache beheben, erneut deployen.
