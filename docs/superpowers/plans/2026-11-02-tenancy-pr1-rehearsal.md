# Migrationsprobe PR 1 (Mandantenfähigkeit)

Datum: 2026-11-02
Dump: Produktions-Backup (pg_dump, custom format, 79 KB; Dump vom 2026-11-02 11:12, Produktion), eingespielt in eine Wegwerf-Postgres-16-DB (Docker, Port 5436).

## Ablauf

`prisma migrate deploy` wendete zwei ausstehende Migrationen an:

1. `20261102094416_joker_games_credited_default_15` (bereits auf `main`, im Dump noch nicht enthalten; nur ein neuer Spalten-Default)
2. `20261102120000_add_groups_and_memberships` (diese Branch)

Der erste Lauf wich damit vom Briefing ab: zwei Migrationen statt einer, weil der Dump älter ist als die Joker-Default-Migration aus PR #28.

Laufzeit beider Migrationen zusammen: 0,92 s (davon Prisma-Start inklusive).

## Zahlen vorher / nachher

| Größe | Vorher | Nachher |
|---|---|---|
| Player gesamt | 6 | 6 |
| Player isAdmin | 2 | 2 |
| Player gelöscht (deletedAt) | 0 | 0 |
| Season | 2 | 2 |
| Season aktiv / inaktiv | 1 / 1 | 1 / 1 |
| GameDay | 33 | 33 |
| Match | 469 | 469 |
| GameDayParticipant | 187 | 187 |
| JokerUse | 10 | 10 |
| AuditLog | 209 | 209 |
| Group | - | 1 (Padelmaestro) |
| Membership | - | 6 (2 admin, 4 member) |

## Prüf-SQL (nach der Migration)

| Prüfung | Soll | Ist |
|---|---|---|
| Player ohne Membership | 0 | 0 |
| role=admin ungleich isAdmin | 0 | 0 |
| removedAt ungleich deletedAt | 0 | 0 |
| Season ohne groupId | 0 | 0 |
| GameDay ohne groupId | 0 | 0 |
| AuditLog ohne groupId | 0 | 0 |
| Anzahl Group | 1 | 1 |
| Memberships mit role=owner | 0 | 0 |
| Zeilenzahlen unverändert | ja | ja |

## set-owner

`pnpm tenancy:set-owner patrick@padel.local`

```
Patrick (dd61b20c-0b34-4389-89a6-a95b5b474eac) ist jetzt Besitzer von Padelmaestro
```

Danach: `owner` genau 1 (patrick@padel.local), `thomas@padel.local` bleibt `admin`, übrige 4 `member`.

## Fazit

Alle Prüfungen bestanden, Ranking-relevante Zeilen (Match, GameDayParticipant, Season-Status) unverändert. Die Migration ist auf den Produktionsdaten unkritisch (unter 1 s). Beim Deploy wird zusätzlich die Joker-Default-Migration von `main` angewendet.

## Zweite Probe: soft-gelöschte Spieler

Gleicher Dump (2026-11-02 11:12, Produktion), frische Wegwerf-DB (Docker, Port 5437). Vor der Migration zwei synthetische, soft-gelöschte Spieler eingefügt (`deletedAt = now() - 10 Tage`, `invitedAt = now() - 100 Tage`):

- `probe-geloescht@padel.local` (kein Admin)
- `probe-admin-geloescht@padel.local` (Admin)

`prisma migrate deploy` wendete wieder beide ausstehenden Migrationen an. Ergebnis:

| Spieler | Memberships | role | removedAt = deletedAt | joinedAt = invitedAt |
|---|---|---|---|---|
| probe-geloescht | 1 | member | ja (Differenz 0) | ja |
| probe-admin-geloescht | 1 | admin | ja (Differenz 0) | ja |

Die Standardprüfungen gelten weiter: Player ohne Membership 0, role/isAdmin-Abweichungen 0, removedAt/deletedAt-Abweichungen 0, groupId-NULLs in Season/GameDay/AuditLog 0, Group 1, Memberships gesamt 8 (6 + 2 Probe), owner 0. Match 469, GameDayParticipant 187, Season 2, GameDay 33, AuditLog 209 unverändert. Container und Dump danach gelöscht.

## Deploy-Ablauf

1. Manueller Dump nach `/root/backups/<datum>-pre-tenancy-1/` (`pg_dump -Fc`).
2. `deploy.sh` ausführen. Der Health-Check auf :3000 schlägt fälschlich fehl; die Migration ist dann bereits angewendet.
3. Im App-Verzeichnis als User `padel`: `pnpm tenancy:set-owner patrick@padel.local`.
4. Prüf-SQL erneut ausführen (owner = 1).
5. Login, Dashboard, Spieltag, Rangliste prüfen.
