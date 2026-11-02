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

1. Ruhige Zeit wählen und 2–3 Minuten Downtime ankündigen. Die Migration löscht eine Spalte: zwischen `migrate deploy` und dem Neustart scheitert der alte Code (während `pnpm build`) bei jedem vollständigen Player-Lesezugriff (Login, Spieltag starten, Passwort-/Avatar-Änderung) mit Prisma P2022. Außerdem schreibt der alte Code bis zum Neustart noch `isAdmin`.
2. Vorab-Prüfung auf Produktion (`sudo -u postgres psql padel_tracker`):
   - Abweichungs-SQL, Soll 0 (sonst abbrechen, es gingen Berechtigungen verloren):
     `SELECT count(*) FROM "Membership" m JOIN "Player" p ON p.id=m."playerId" WHERE m.role<>'owner' AND m.role <> CASE WHEN p."isAdmin" THEN 'admin' ELSE 'member' END::"MembershipRole";`
   - Rollenliste für den Vergleich nach dem Deploy sichern:
     `SELECT p.email, m.role FROM "Membership" m JOIN "Player" p ON p.id=m."playerId" ORDER BY p.email;`
3. Dump nach `/root/backups/<datum>-pre-tenancy-6/db.dump` (`sudo -u postgres pg_dump -Fc padel_tracker`). Das Löschen der Spalte ist nicht umkehrbar, der Dump ist der einzige Rückweg.
4. `systemctl stop padel` (als root) VOR `deploy.sh`. `deploy.sh` läuft als padel: `sudo -u padel -H bash /srv/padel/app/scripts/deploy.sh`. Das Skript zieht, migriert, baut und startet den Dienst neu; sein Health-Check auf :3000 schlägt fälschlich fehl.
5. Prüfen: `systemctl is-active padel` und `curl http://127.0.0.1:8080/login`.
6. Prüf-SQL: Spalte `Player.isAdmin` weg, Rollenliste gleich der in Schritt 2 gesicherten, Memberships mit role=owner = 1, Zeilenzahlen wie vor dem Deploy.
7. Seitencheck: Login, Admin-Seite mit Rollen-Badges, Spieler hoch- und herabstufen, Dashboard, Rangliste.

Rollback:

- Abbruch vor der Migration (z. B. git pull oder pnpm install): `systemctl start padel`, alter Build ist kompatibel.
- Schlägt die Migration fehl: `prisma migrate resolve --rolled-back 20261102180000_drop_player_is_admin` (als padel im App-Verzeichnis mit geladener .env), Ursache beheben, erneut deployen.
- Abbruch nach der Migration (z. B. pnpm build): Dienst NICHT mit altem Stand starten (P2022 bei Login); Ursache beheben und `deploy.sh` erneut ausführen (`migrate deploy` ist idempotent) oder Dump-Restore + vorherige Version.
- Nach erfolgreicher Migration ist die Spalte weg; der Rückweg führt nur über den Dump (Restore aus `/root/backups/<datum>-pre-tenancy-6/` und vorherige Version deployen).
