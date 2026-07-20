# Saison-Abschluss & Saison-Archiv — Design

Datum: 2026-07-20
Status: freigegeben (Patrick, 2026-07-20)

## Ziel

Der Admin kann die laufende Saison abschließen (z. B. als „Hinrunde 2026")
und direkt eine neue Saison starten (z. B. „Rückrunde 2026"). Danach:

- Die Rangliste startet für die neue Saison bei 0 (Punkte, Spiele, Ø, Medaillen).
- Jeder Spieler hat wieder das volle Joker-Budget (2 pro Saison).
- Im Archiv ist die abgeschlossene Saison vollständig einsehbar:
  Abschlusstabelle plus alle Spieltage mit Ergebnissen.

## Getroffene Entscheidungen

1. **Admin-Aktion mit freier Benennung** — kein fester Hin-/Rückrunden-
   Automatismus. Der Admin vergibt beim Abschluss den Archiv-Namen der
   alten und den Namen der neuen Saison.
2. **Archiv zeigt Abschlusstabelle + Spieltagsliste** pro abgeschlossener
   Saison (kein Saison-Verlaufs-Chart im Archiv).
3. **Abschluss blockiert**, solange die Saison noch nicht-fertige
   Spieltage hat (Status `planned` oder `in_progress`).
4. **Joker-Budget gilt pro Saison** — mit der neuen Saison hat jeder
   wieder 2 Joker. Verbrauchte Joker bleiben der alten Saison zugeordnet.
5. **Live-Berechnung statt Snapshot** — das Archiv berechnet die
   Abschlusstabelle jederzeit frisch aus den Matches der Saison
   (gleiche Logik wie die aktuelle Rangliste, `computeRanking(seasonId)`).
   Bewusst akzeptierte Einschränkung: Wird ein Spieler später gelöscht
   (Soft-Delete), verschwindet er auch aus archivierten Tabellen.

## Datenmodell

`Season` (prisma/schema.prisma):

- Neu: `name String @unique` — Anzeigename, z. B. „Hinrunde 2026".
- Entfällt: `@@unique`-Constraint auf `year` (künftig mehrere Saisons
  pro Kalenderjahr). `year` bleibt als Sortier-/Gruppierungshilfe.
- Migration setzt für die bestehende Saison `name = 'Saison 2026'`.
  Den endgültigen Archiv-Namen vergibt der Admin beim Abschluss.

Keine weiteren Schema-Änderungen. Matches, `JokerUse` und `GameDay`
hängen bereits per `seasonId` an der Saison; es wird nichts kopiert
oder genullt.

## Abschluss-Logik

Neue Funktion `closeSeasonAndStartNext({ closedName, nextName })` in
`src/lib/season.ts` (ersetzt das bisher unbenutzte `closeSeason`),
alles in einer Prisma-Transaktion:

1. Aktive Saison laden — Fehler, wenn keine existiert.
2. Blockieren, wenn die Saison Spieltage mit Status ≠ `finished` hat.
   Die Fehlermeldung nennt die betroffenen Termine (Datum + Status).
3. Namen validieren: beide nicht leer (getrimmt), `closedName ≠ nextName`,
   keiner kollidiert mit einem bestehenden Saison-Namen.
4. Alte Saison aktualisieren: `name = closedName`, `isActive = false`,
   `endDate = heute`.
5. Neue Saison anlegen: `name = nextName`, `year = aktuelles Jahr`,
   `startDate = heute`, `endDate = 31.12. des Jahres`, `isActive = true`.
6. AuditLog-Eintrag (`action: 'season.close'`, Payload mit beiden Namen
   und Saison-IDs).

`getOrCreateActiveSeason()` erzeugt neue Saisons künftig mit
Fallback-Namen `Saison <Jahr>` (greift nur, wenn gar keine aktive
Saison existiert, z. B. leere Datenbank).

## API

`POST /api/seasons/close`

- Nur Admins (wie bestehende Admin-Mutationsrouten), CSRF-Schutz wie
  alle Mutations-Endpunkte.
- Body: `{ closedName: string, nextName: string }`.
- 200 mit `{ closedSeason, newSeason }`; Validierungs-/Blockierfehler
  als 4xx mit Meldung für die Dialog-Anzeige.

## UI

**Admin-Seite — neue Karte „Saison":**

- Zeigt aktive Saison: Name, Startdatum, Anzahl fertiger Spieltage.
- Button „Saison abschließen" öffnet Dialog mit zwei Feldern:
  - Archiv-Name der aktuellen Saison (vorausgefüllt mit aktuellem Namen).
  - Name der neuen Saison (leer, Platzhalter „z. B. Rückrunde 2026").
- Dialog-Hinweis: Tabelle startet bei 0, Joker-Budget wird wieder frei.
- Fehler (z. B. offene Spieltage) erscheinen im Dialog.

**Rangliste & Dashboard:** Header zeigt `season.name` statt
„Saison {year}".

**Archiv-Seite:**

- Gruppierung nach Saison (statt Kalenderjahr), neueste zuerst.
- Laufende Saison oben mit Badge „laufend", nur Spieltagsliste.
- Abgeschlossene Saisons: zuerst Abschlusstabelle (Wiederverwendung der
  `RankingTable`-Komponente), darunter die bekannte Spieltagsliste.
- Spieltag-Detailseiten (`/archive/[id]`) unverändert.
- `listArchivedGameDays` liefert künftig `seasonId`/`seasonName`
  statt `seasonYear`.

## Tests

- Integration `closeSeasonAndStartNext`: Happy Path; Blockierung bei
  offenen Spieltagen; Namenskollision; identische Namen; keine aktive
  Saison; nach Abschluss: Ranking der neuen Saison leer, Joker-Budget
  wieder verfügbar (Zählung per `seasonId`).
- API: Nicht-Admin → 403; fehlender CSRF-Header → abgelehnt;
  Validierungsfehler → 4xx mit Meldung.
- UI/Integration: Archiv gruppiert nach Saison und rendert die
  Abschlusstabelle der abgeschlossenen Saison.

## Deployment

Standard-Deploy (`deploy.sh` zieht main, führt `prisma migrate deploy`
aus, baut, startet neu). Die Migration ist additiv (neue Spalte mit
Backfill, Constraint-Wechsel) — kein Datenverlust, kein manueller
Eingriff auf dem VPS nötig.
