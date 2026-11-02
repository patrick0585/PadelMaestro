# Probe PR 5 (Mandantenfähigkeit, Rangliste, Profil und Live aus Mitgliedschaften)

Datum: 2026-11-02
Dump: frischer Produktions-Dump nach dem PR-4-Deploy (pg_dump, custom format, 88 KB; Dump vom 2026-11-02 19:57), eingespielt in eine Wegwerf-Postgres-16-DB (Docker `padel-probe-pr5`, Port 5438). `prisma migrate status`: up to date, 12 Migrationen, keine ausstehend.

## Ablauf

1. Dump eingespielt, `prisma migrate status` geprüft (PR 5 bringt keine Migration).
2. Snapshot-Skript `scripts/dev/tenancy-snapshot.ts` (Rangliste, Saisonverlauf und Profilstatistik aller Spieler je Saison) mit dem Code-Stand von `main` (vor Task 2) ausgeführt, Ausgabe `before.json`.
3. Dasselbe Skript nach der Umstellung auf Mitgliedschaften ausgeführt, Ausgabe `after.json`.
4. Vergleich: `diff <(jq -S . before.json) <(jq -S . after.json)`.

## Ergebnis

Identisch: 0 Differenzzeilen, beide Dateien 54.903 Bytes.

| Saison | Status | Rangliste (Zeilen) | Spieler-Statistiken | Verlauf (Spieltage) |
|---|---|---|---|---|
| Rückrunde 2026 | aktiv | 5 | 5 | 9 |
| Saison 2026 | inaktiv | 6 | 6 | 23 |

Hinweis: Die Reihenfolge bei vollständigem Punktegleichstand ist in der SQL nicht festgelegt (unverändert gegenüber `main`). Im Dump trat kein solcher Gleichstand auf.

## Fazit

Rangliste, Saisonverlauf und Profilstatistik liefern auf Produktionsdaten mit Mitgliedschaften als Spielerquelle exakt dieselben Werte wie vorher. Container wurde danach gelöscht.

## Deploy-Ablauf

1. Keine Migration.
2. Manueller Dump nach `/root/backups/<datum>-pre-tenancy-5/db.dump` (`sudo -u postgres pg_dump -Fc padel_tracker`).
3. `deploy.sh` ausführen. Der Health-Check auf :3000 schlägt fälschlich fehl; stattdessen `systemctl is-active padel` und `curl http://127.0.0.1:8080/login` prüfen.
4. Login, Rangliste (Zeilen und Reihenfolge wie vor dem Deploy), Dashboard-Statistik, Spieltag mit Live-Updates (SSE) und Archiv prüfen.

Rollback: vorherigen Stand erneut deployen; ohne Migration ist kein Datenbank-Rollback nötig, der Dump liegt unter `/root/backups/<datum>-pre-tenancy-5/`.
