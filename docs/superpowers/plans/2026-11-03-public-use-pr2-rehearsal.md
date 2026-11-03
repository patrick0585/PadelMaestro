# Migrationsprobe PR 2 (Öffentliche Nutzung: Einladungen und Registrierung)

Datum: 2026-11-03
Dump: Produktions-Backup (pg_dump, custom format, 113 KB; `/root/backups/2026-11-03-pre-public-1/db.dump`, Stand **vor** dem PR-1-Deploy), eingespielt in eine Wegwerf-Postgres-16-DB (Docker, Port 5438).

Der Dump enthält die beiden PR-1-Migrationen (`20261103100000_email_tokens`, `20261103120000_session_version`) noch nicht, Produktion hat sie inzwischen. `migrate deploy` wendet deshalb zuerst diese beiden und dann die neue Migration `20261104100000_invitations` an. Für PR 2 zählt nur die letzte; die ersten beiden sind in der PR-1-Probe geprüft.

## Ablauf

1. Dump eingespielt (`pg_restore --no-owner --no-acl`), Exit 0, keine Warnungen.
2. Zählungen und Migrationsliste vorher: 13 angewendete Migrationen, letzte `20261102180000_drop_player_is_admin`.
3. `prisma migrate deploy` mit diesem Branch: wendete `20261103100000_email_tokens`, `20261103120000_session_version` und `20261104100000_invitations` an.
4. Zählungen, Objektprüfung und `prisma migrate diff` nachher; `prisma migrate status`: „Database schema is up to date!“.
5. Container und Volume gelöscht (`docker rm -f -v`).

## Zahlen vorher/nachher

| Tabelle | Vorher | Nachher |
|---|---|---|
| Player | 6 | 6 |
| Membership | 6 | 6 |
| Season | 2 | 2 |
| GameDay | 33 | 33 |
| Match | 469 | 469 |
| GameDayParticipant | 187 | 187 |
| JokerUse | 10 | 10 |
| AuditLog | 211 | 211 |
| Group | 1 | 1 |
| Invitation | fehlt | 0 |
| InvitationUse | fehlt | 0 |

## Prüf-SQL

| Prüfung | Vorher | Soll | Nachher |
|---|---|---|---|
| `to_regclass('"Invitation"')` / `to_regclass('"InvitationUse"')` | NULL | vorhanden | beide vorhanden, 0 Zeilen |
| Enum `InvitationKind` (`pg_enum`) | fehlt | `founder`, `member` | `founder`, `member` |
| FK `InvitationUse_invitationId_fkey` (`confdeltype`) | – | `c` (cascade) | `c` |
| FK `InvitationUse_foundedGroupId_fkey` | – | `n` (set null) | `n` |
| FK `InvitationUse_playerId_fkey` | – | `r` (restrict) | `r` |
| Letzte angewendete Migration | `20261102180000_drop_player_is_admin` | `20261104100000_invitations` | `20261104100000_invitations` (davor `20261103120000_session_version`, `20261103100000_email_tokens`) |

`prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` meldet „No difference detected.“ (Exit 0), also kein Drift.

## Laufzeit

`prisma migrate deploy` (alle drei Migrationen): 1,0 s Wanduhr inklusive Prisma-Start.

## Fazit

Alle Prüfungen bestanden, Zeilenzahlen unverändert, die neuen Tabellen sind leer, Enum und Fremdschlüssel wie vorgesehen, kein Schema-Drift. Die Migration fügt nur hinzu (kein Datenzugriff), der alte Code läuft mit dem neuen Schema weiter.

## Gesamtlauf

Aus dem Worktree, 2026-11-03:

- `pnpm lint`: „No ESLint warnings or errors“.
- `pnpm test`: 149 Testdateien, 1054 Tests, alle bestanden (104 s).
- `AUTH_SECRET=… pnpm build`: erfolgreich. Neue Routen in der Routenliste: `ƒ /einladung/[token]` (2.44 kB, 110 kB First Load) und `ƒ /gruppe/neu` (1.56 kB, 107 kB).

## Deploy-Ablauf

Keine Downtime nötig.

1. Vorab-Prüfung (`sudo -u postgres psql padel_tracker`): `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1;` muss `20261103120000_session_version` sein. Sonst abbrechen und zuerst PR 1 deployen.
2. Kein `.env`-Eintrag nötig. `PUBLIC_SIGNUP` bleibt ungesetzt (= aus).
3. Dump nach `/root/backups/<datum>-pre-public-2/db.dump` (`sudo -u postgres pg_dump -Fc padel_tracker`).
4. `sudo -u padel -H bash /srv/padel/app/scripts/deploy.sh` (zieht, migriert, baut, startet neu; sein Health-Check auf :3000 schlägt fälschlich fehl).
5. Prüfen:
   - `systemctl is-active padel`, zweimal im Abstand einiger Sekunden.
   - `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/login` = 200.
   - `.../einladung/irgendwas` = 200 mit der Seite „Einladung ungültig“.
   - `.../gruppe/neu` ohne Login = 307 auf die Login-Seite.
   - `tail -n 50 /srv/padel/logs/app.err.log` seit dem Neustart ohne `[startup]`-Zeile.
6. Prüf-SQL: Zeilenzahlen wie vor dem Deploy, `Invitation` und `InvitationUse` vorhanden und leer.
7. Im App-Verzeichnis als padel mit geladener `.env`: `pnpm invite:founder --list` gibt `Keine offenen Gründer-Links.` aus.

## Rollback

- Die Migration fügt nur einen Enum und zwei Tabellen hinzu. Der alte Code läuft damit weiter, Rollback heißt also nur: vorherigen Commit deployen. Tabellen und Enum können bleiben.
- `.env` wurde nicht geändert, nichts zurückzusetzen.
- Schlägt die Migration fehl: `prisma migrate resolve --rolled-back 20261104100000_invitations` (als padel im App-Verzeichnis mit geladener `.env`), Ursache beheben, erneut deployen.
