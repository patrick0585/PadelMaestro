# Migrationsprobe PR 4 (Mandantenfähigkeit, Saison und Spieltag mit Pflicht-Gruppe)

Datum: 2026-11-02
Dump: Produktions-Backup (pg_dump, custom format, 113 KB; Dump vom 2026-11-02 14:11, Produktion, Stand nach den PR-2-Migrationen, vor dem PR-3-Deploy; PR 3 hatte keine Migration), eingespielt in eine Wegwerf-Postgres-16-DB (Docker, Port 5438).

## Ablauf

1. Dump eingespielt (`pg_restore --no-owner --no-acl`), keine Warnungen.
2. Zählungen und Prüf-SQL vorher, `\d "Season"` und `\d "GameDay"`.
3. `prisma migrate deploy` wendete nur `20261102160000_group_required` an.
4. Zählungen und Prüf-SQL nachher, `\d`, `prisma migrate diff`.
5. Abgleichsteil der Migration (INSERT und drei UPDATEs) ein zweites Mal per psql ausgeführt.

## Zahlen vorher/nachher

| Tabelle | Vorher | Nachher |
|---|---|---|
| Season | 2 | 2 |
| GameDay | 33 | 33 |
| Match | 469 | 469 |
| GameDayParticipant | 187 | 187 |
| JokerUse | 10 | 10 |
| AuditLog | 209 | 209 |
| Membership | 6 | 6 |
| Player | 6 | 6 |
| Group | 1 | 1 |

## Prüf-SQL

| Prüfung | Vorher | Soll | Nachher |
|---|---|---|---|
| Season ohne groupId | 0 | 0 | 0 |
| GameDay ohne groupId | 0 | 0 | 0 |
| AuditLog ohne groupId | 0 | 0 | 0 |
| Player ohne Membership | 0 | 0 | 0 |
| Memberships mit role=owner | 1 | 1 | 1 |

## Constraints vorher/nachher

| Objekt | Vorher | Nachher |
|---|---|---|
| `Season.groupId` | nullable | `NOT NULL` |
| `GameDay.groupId` | nullable | `NOT NULL` |
| `Season_name_key` (UNIQUE name) | vorhanden | entfernt |
| `Season_groupId_name_key` (UNIQUE groupId, name) | vorhanden | vorhanden |
| `Season_groupId_fkey` | ON DELETE SET NULL | ON DELETE RESTRICT |
| `GameDay_groupId_fkey` | ON DELETE SET NULL | ON DELETE RESTRICT |

`prisma migrate diff --from-schema-datasource --to-schema-datamodel` meldet danach „This is an empty migration.“, also kein Drift gegen `schema.prisma`.

## Laufzeit

`prisma migrate deploy` insgesamt 0,6 s (Wanduhr, inklusive Prisma-Start).

## Idempotenz

Abgleichsteil der Migration ein zweites Mal ausgeführt (ohne ALTER und DROP): `INSERT 0 0`, danach dreimal `UPDATE 0`, also 0 betroffene Zeilen.

## Fazit

Alle Prüfungen bestanden, Zeilenzahlen unverändert, Pflichtfelder und Fremdschlüssel wie vorgesehen, kein Schema-Drift, Abgleich wiederholbar. Container wurde danach gelöscht.

## Deploy-Ablauf

1. Pre-Check (Soll 0, vor dem Deploy): `SELECT count(*) FROM "GameDay" d JOIN "Season" s ON s.id=d."seasonId" WHERE d."groupId" <> s."groupId" OR d."groupId" IS NULL OR s."groupId" IS NULL;`
2. Manueller Dump nach `/root/backups/<datum>-pre-tenancy-4/db.dump` (`sudo -u postgres pg_dump -Fc padel_tracker`).
3. `deploy.sh` ausführen. Der Health-Check auf :3000 schlägt fälschlich fehl; stattdessen `systemctl is-active padel` und `curl http://127.0.0.1:8080/login` prüfen.
   Während des Deploys keine Admin-Aktionen (Spieler anlegen/ändern, Saison oder Spieltag anlegen) ausführen.
4. Prüf-SQL ausführen: `groupId` auf Season und GameDay `NOT NULL`, `Season_name_key` fehlt, Memberships mit role=owner = 1, Zeilenzahlen wie vor dem Deploy. Zusätzlich die Invariante (Soll 0): `SELECT count(*) FROM "Membership" m JOIN "Player" p ON p.id=m."playerId" WHERE p."deletedAt" IS NOT NULL AND m."removedAt" IS NULL;`
5. Login, Dashboard, Spieltag, Rangliste und Archiv prüfen.

Rollback: Bei Fehler der Migration: `prisma migrate resolve --rolled-back 20261102160000_group_required` (als padel im App-Verzeichnis mit geladener .env), Ursache beheben, erneut deployen; der Dump liegt unter /root/backups/<datum>-pre-tenancy-4/.
