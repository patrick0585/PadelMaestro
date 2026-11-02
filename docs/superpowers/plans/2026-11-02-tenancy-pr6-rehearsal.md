# Migrationsprobe PR 6 (Mandantenfähigkeit, Aufräumen: Player.isAdmin entfernt)

Datum: 2026-11-02
Dump: Produktions-Backup (pg_dump, custom format, 88 KB; Dump vom 2026-11-02 20:29, Produktion, Stand nach dem PR-5-Deploy), eingespielt in eine Wegwerf-Postgres-16-DB (Docker, Port 5438).

## Ablauf

1. Dump eingespielt (`pg_restore --no-owner --no-acl`), keine Warnungen.
2. Zählungen, Rollenliste, Spaltenprüfung und Abweichungs-SQL vorher.
3. `prisma migrate deploy` wendete nur `20261102180000_drop_player_is_admin` an.
4. Zählungen, Rollenliste und Spaltenprüfung nachher, `prisma migrate diff`.

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

## Rollen vorher/nachher

| E-Mail | Rolle vorher | `isAdmin` vorher | Rolle nachher |
|---|---|---|---|
| michi@padel.local | member | false | member |
| patrick@padel.local | owner | true | owner |
| paul@padel.local | member | false | member |
| rene@padel.local | member | false | member |
| thomas@padel.local | admin | true | admin |
| werner@padel.local | member | false | member |

## Prüf-SQL

| Prüfung | Vorher | Soll | Nachher |
|---|---|---|---|
| Spalte `Player.isAdmin` in `information_schema.columns` | vorhanden (1) | 0 nach Migration | 0 |
| Memberships (nicht owner), deren Rolle nicht zu `isAdmin` passt | 0 | 0 | nicht mehr prüfbar (Spalte weg) |
| Memberships mit role=owner | 1 | 1 | 1 |

`prisma migrate diff --from-schema-datasource --to-schema-datamodel` meldet danach „This is an empty migration.“, also kein Drift gegen `schema.prisma`.

## Laufzeit

`prisma migrate deploy` insgesamt 0,6 s (Wanduhr, inklusive Prisma-Start).

## Fazit

Alle Prüfungen bestanden, Zeilenzahlen und Rollen unverändert, `isAdmin` entfernt, kein Schema-Drift. Vor der Migration stimmten alle Rollen mit `isAdmin` überein, es geht also keine Berechtigung verloren. Container wurde danach gelöscht.

## Deploy-Ablauf

1. Manueller Dump nach `/root/backups/<datum>-pre-tenancy-6/db.dump` (`sudo -u postgres pg_dump -Fc padel_tracker`).
2. Während des Deploys keine Admin-Aktionen ausführen: der alte Code schreibt bis zum Neustart noch `isAdmin`.
3. `deploy.sh` ausführen. Der Health-Check auf :3000 schlägt fälschlich fehl; stattdessen `systemctl is-active padel` und `curl http://127.0.0.1:8080/login` prüfen.
4. Prüf-SQL ausführen: Spalte `Player.isAdmin` weg, Rollen unverändert, Memberships mit role=owner = 1, Zeilenzahlen wie vor dem Deploy.
5. Seitencheck: Login, Admin-Seite mit Rollen-Badges, Spieler hoch- und herabstufen, Dashboard, Rangliste.

Rollback: Schlägt die Migration fehl: `prisma migrate resolve --rolled-back 20261102180000_drop_player_is_admin` (als padel im App-Verzeichnis mit geladener .env), Ursache beheben, erneut deployen. Nach erfolgreicher Migration ist die Spalte weg; der Rückweg führt nur über den Dump (Restore aus `/root/backups/<datum>-pre-tenancy-6/` und vorherige Version deployen).
