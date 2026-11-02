# Migrationsprobe PR 2 (Mandantenfähigkeit, Abgleich)

Datum: 2026-11-02
Dump: Produktions-Backup (pg_dump, custom format, 79 KB; Dump vom 2026-11-02 11:12, Produktion), eingespielt in eine Wegwerf-Postgres-16-DB (Docker, Port 5438).

## Ablauf

1. Dump eingespielt (`pg_restore --no-owner --no-acl`).
2. `prisma migrate deploy`: zwei Migrationen (Joker-Default, `add_groups_and_memberships`), die DB ist damit auf dem Stand nach PR 1.
3. `pnpm tenancy:set-owner patrick@padel.local`: Patrick ist `owner`.
4. Lücken per SQL erzeugt, wie sie zwischen PR-1-Deploy und PR 2 entstehen können:
   - neuer Spieler `probe-neu@padel.local` ohne Membership
   - `paul@padel.local` auf `isAdmin = true` (Rolle bleibt `member`)
   - `werner@padel.local` soft-gelöscht (`deletedAt`), Membership aktiv
   - Saison `Probe NULL` (2030, inaktiv) und ein Spieltag darin, beide mit `groupId` NULL; ein AuditLog-Eintrag mit `groupId` NULL
   - Patrick bleibt `owner` mit `isAdmin = true`
5. `prisma migrate deploy` wendete nur `20261102130000_reconcile_memberships` an.

## Prüf-SQL

| Prüfung | Vorher | Soll | Nachher |
|---|---|---|---|
| Player ohne Membership | 1 | 0 | 0 |
| role=admin ungleich isAdmin (ohne owner) | 1 | 0 | 0 |
| removedAt ungleich deletedAt | 1 | 0 | 0 |
| Season ohne groupId | 1 | 0 | 0 |
| GameDay ohne groupId | 1 | 0 | 0 |
| AuditLog ohne groupId | 1 | 0 | 0 |
| Anzahl Group | 1 | 1 | 1 |
| Memberships mit role=owner | 1 | 1 | 1 |

Rollen danach: patrick `owner`, paul `admin`, thomas `admin`, michi/rene/probe-neu/werner `member`; werner mit `removedAt` gesetzt. Memberships 7 = Player 7.

Zeilenzahlen nach der Probe (inklusive je einer Probezeile): Match 469 und GameDayParticipant 187 unverändert, Season 3, GameDay 34, AuditLog 210.

## Idempotenz

Migration ein zweites Mal als SQL ausgeführt: `INSERT 0 0`, danach fünfmal `UPDATE 0`, also 0 betroffene Zeilen.

## Lokale DB

`prisma migrate deploy` auf der Entwicklungs-DB (Port 5433) erfolgreich; `prisma migrate diff` meldet „empty migration“, kein Drift.

## Fazit

Alle Prüfungen bestanden, der Besitzer bleibt `owner`, die Migration ist wiederholbar. Container und Dump wurden danach gelöscht.

## Deploy-Ablauf

1. Manueller Dump nach `/root/backups/<datum>-pre-tenancy-2/` (`pg_dump -Fc`).
2. `deploy.sh` ausführen. Der Health-Check auf :3000 schlägt fälschlich fehl; die Migration ist dann bereits angewendet.
   Während des Deploys keine Admin-Aktionen (Spieler anlegen/ändern) ausführen.
   Nach dem Neustart den Abgleich erneut ausführen, weil der alte Code während `pnpm build` weiter nur `Player` geschrieben hat: `sudo -u postgres psql padel_tracker -f /srv/padel/app/prisma/migrations/20261102130000_reconcile_memberships/migration.sql` (idempotent), danach Prüf-SQL.
3. Prüf-SQL ausführen (owner = 1, Patrick `owner`, Thomas `admin`, alle Zähler 0). Kein `set-owner`-Schritt, der Besitzer besteht seit PR 1.
4. Login, Dashboard, Spieltag, Rangliste prüfen.
