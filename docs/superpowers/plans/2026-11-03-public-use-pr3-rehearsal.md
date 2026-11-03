# Migrationsprobe PR 3 (Öffentliche Nutzung: Gruppen)

Datum: 2026-11-03
Dump: Produktions-Backup (pg_dump, custom format, 119 KB; `/root/backups/2026-11-03-pre-public-2/db.dump`, Stand **vor** dem PR-2-Deploy), eingespielt in eine Wegwerf-Postgres-16-DB (Docker, Port 5439).

Der Dump enthält die PR-2-Migration `20261104100000_invitations` noch nicht, Produktion hat sie inzwischen. `migrate deploy` wendet deshalb zuerst diese und dann die neue Migration `20261105100000_active_group` an. Für PR 3 zählt nur die letzte; die erste ist in der PR-2-Probe geprüft.

## Ablauf

1. Dump eingespielt (`pg_restore --no-owner --no-acl`), Exit 0, keine Warnungen.
2. Zählungen und Migrationsliste vorher: 15 angewendete Migrationen, letzte `20261103120000_session_version`.
3. `prisma migrate deploy` mit diesem Branch (17 Migrationen im Verzeichnis): wendete `20261104100000_invitations` und `20261105100000_active_group` an.
4. Zählungen, Objektprüfung und `prisma migrate diff` nachher; `prisma migrate status`: „Database schema is up to date!“.
5. Container und Volume gelöscht (`docker rm -f -v`).

Die Vorher-Zahlen stammen aus einer zweiten, unmigrierten Restore-Kopie des Dumps im selben Container.

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
| Spalte `Player.activeGroupId` (`information_schema.columns`) | fehlt | `text`, nullable | vorhanden, `text`, nullable |
| Werte `activeGroupId` | – | alle NULL | 6 Spieler, 0 Werte gesetzt |
| Index `Player_activeGroupId_idx` (`pg_indexes`) | – | vorhanden | vorhanden |
| FK `Player_activeGroupId_fkey` (`confdeltype`) | – | `n` (set null) | `n` |
| Letzte angewendete Migration | `20261103120000_session_version` | `20261105100000_active_group` | `20261105100000_active_group` (davor `20261104100000_invitations`, `20261103120000_session_version`) |

`prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code` meldet „No difference detected.“ (Exit 0), also kein Drift.

## Laufzeit

`prisma migrate deploy` (beide Migrationen): 0,9 s Wanduhr inklusive Prisma-Start.

## Fazit

Alle Prüfungen bestanden, Zeilenzahlen unverändert, die neue Spalte ist überall NULL, Index und Fremdschlüssel wie vorgesehen, kein Schema-Drift. Die Migration fügt nur eine nullable Spalte hinzu (kein Datenzugriff), der alte Code läuft mit dem neuen Schema weiter.

## Gesamtlauf

Aus dem Worktree, 2026-11-03:

- `pnpm lint`: „No ESLint warnings or errors“.
- `pnpm test`: 166 Testdateien, 1133 Tests, alle bestanden (118 s).
- `AUTH_SECRET=… pnpm build`: erfolgreich. Routen: `ƒ /profil` (5.13 kB, 115 kB First Load), `ƒ /admin` (25.8 kB, 133 kB), `ƒ /api/groups/active`, `ƒ /api/profile/active-group` und `ƒ /api/profile/leave-group` (je 225 B, 102 kB).

## Deploy-Ablauf

Voraussetzung: PR 2 ist deployt (letzte Migration `20261104100000_invitations`).

Keine Downtime nötig.

1. Vorab-Prüfung (`sudo -u postgres psql padel_tracker`):
   - `SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1;` muss `20261104100000_invitations` sein. Sonst abbrechen und zuerst PR 2 deployen.
   - Zeilenzahlen notieren, damit Schritt 6 vergleichen kann:
     ```sql
     SELECT 'Player' t, count(*) FROM "Player" UNION ALL
     SELECT 'Membership', count(*) FROM "Membership" UNION ALL
     SELECT 'Season', count(*) FROM "Season" UNION ALL
     SELECT 'GameDay', count(*) FROM "GameDay" UNION ALL
     SELECT 'Match', count(*) FROM "Match" UNION ALL
     SELECT 'GameDayParticipant', count(*) FROM "GameDayParticipant" UNION ALL
     SELECT 'JokerUse', count(*) FROM "JokerUse" UNION ALL
     SELECT 'AuditLog', count(*) FROM "AuditLog" UNION ALL
     SELECT 'Group', count(*) FROM "Group" UNION ALL
     SELECT 'Invitation', count(*) FROM "Invitation" UNION ALL
     SELECT 'InvitationUse', count(*) FROM "InvitationUse";
     ```
2. Kein neuer `.env`-Eintrag nötig.
3. Dump:
   ```bash
   mkdir -p /root/backups/<datum>-pre-public-3
   sudo -u postgres pg_dump -Fc padel_tracker > /root/backups/<datum>-pre-public-3/db.dump
   ls -l /root/backups/<datum>-pre-public-3/db.dump
   ```
   Die Datei muss existieren und größer als 0 Byte sein.
4. `sudo -u padel -H bash /srv/padel/app/scripts/deploy.sh` (zieht, migriert, baut, startet neu; sein Health-Check auf :3000 schlägt fälschlich fehl).
5. Prüfen:
   - `systemctl is-active padel`, zweimal im Abstand einiger Sekunden.
   - `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/login` = 200.
   - `.../profil` ohne Login = 307 auf die Login-Seite.
   - Nach Login zeigt die Navigation „Padelmaestro“ als Gruppenname (eine Mitgliedschaft: nur der Name, kein Wechsler).
   - `/admin` zeigt für den Besitzer unten den Abschnitt „Gruppe“; der Bearbeiten-Dialog hat die Rollen-Auswahl.
   - Nach Login zeigt `/profil` den Abschnitt „Gruppe“.
   - `tail -n 50 /srv/padel/logs/app.err.log` seit dem Neustart ohne `[startup]`-Zeile.
6. Prüf-SQL: Zeilenzahlen wie in Schritt 1 (inkl. Invitation und InvitationUse) unverändert; `SELECT count(*), count("activeGroupId") FROM "Player";` zeigt 0 gesetzte Werte, solange niemand die Gruppe gewechselt hat.

## Rollback

- Die Migration fügt nur eine nullable Spalte mit Index und Fremdschlüssel hinzu. Der alte Code läuft damit weiter, Rollback heißt also nur: vorherigen Stand deployen. Die Spalte kann bleiben.
- So geht das mit `deploy.sh`: Das Skript macht immer `git checkout main` und `git pull --ff-only`, ein manuell ausgecheckter älterer Commit würde also sofort wieder überschrieben. Der Rollback ist deshalb ein Revert-Commit auf `main` (`git revert -m 1 <merge-commit>` lokal, auf `main` pushen bzw. per PR mergen), danach wie in Schritt 4 `sudo -u padel -H bash /srv/padel/app/scripts/deploy.sh`.
- `.env` wurde nicht geändert, nichts zurückzusetzen.
- Schlägt die Migration fehl (`deploy.sh` bricht dann vor Build und Neustart ab, der alte Code läuft weiter):
  1. Halb angewendete Objekte entfernen, falls vorhanden: `ALTER TABLE "Player" DROP COLUMN IF EXISTS "activeGroupId";` (in `sudo -u postgres psql padel_tracker`; Index und Fremdschlüssel fallen mit der Spalte weg, die Spalte ist zu diesem Zeitpunkt neu und leer).
  2. `prisma migrate resolve --rolled-back 20261105100000_active_group` (als padel im App-Verzeichnis mit geladener `.env`).
  3. Ursache beheben, erneut deployen.
