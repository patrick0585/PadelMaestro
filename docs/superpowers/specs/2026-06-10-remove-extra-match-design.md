# Zusatz-Matches entfernen — Design

**Datum:** 2026-06-10
**Status:** Entwurf (genehmigt im Brainstorming)

## Problem

Am Spieltag 09.06.2026 wurde ein Zusatz-Match zu viel hinzugefügt (Match #22,
ohne Ergebnis). Der Spieltag lässt sich nicht abschließen, weil der
Finish-Banner nur erscheint, wenn **alle** Matches ein Ergebnis haben
(`page.tsx`: `day.matches.every(... team1Score !== null ...)`). Es gibt aktuell
keine Möglichkeit, ein hinzugefügtes Match wieder zu entfernen.

## Ziel

Ein Admin kann ein per „+ Zusatz-Match"-Button hinzugefügtes Match wieder
entfernen — mit Inline-Bestätigung. Template-Matches (der feste Round-Robin-Plan)
bleiben unantastbar.

## Entscheidungen (aus dem Brainstorming)

| Frage | Entscheidung |
|---|---|
| Umfang | Nur Zusatz-Matches (mit **oder** ohne Ergebnis); Template-Matches tabu |
| Berechtigung | Nur Admin |
| Soforthilfe 09.06. | Keine direkte DB-Änderung — Admin entfernt #22 selbst über das neue Feature |
| Bestätigung | Inline in der Match-Karte (gleicher Stil wie der Score-Edit-Flow) |
| matchNumber nach Löschen | Neu durchnummerieren (keine Lücke) |

## „Zusatz-Match" — Definition

Das Template erzeugt eine feste Anzahl Matches: `loadTemplate(playerCount).totalMatches`
(4 Spieler → 3, 5/6 Spieler → 15). Ein Match ist genau dann ein **Zusatz-Match**,
wenn `matchNumber > totalMatches`. Kein Schema-Flag nötig.

## Backend

### Lib: `src/lib/game-day/remove-extra-match.ts`

`removeExtraMatch(matchId, actorId)` — transaktional:

1. Match laden inkl. `gameDay { status, playerCount }` und `matchNumber`,
   `gameDayId`, `team1Score`, `team2Score`. Nicht gefunden →
   `MatchNotFoundError`.
2. `gameDay.status !== "in_progress"` → `GameDayNotActiveError` (wiederverwendet
   aus `add-extra-match.ts`). Finished/planned Days sind gesperrt.
3. `playerCount` fehlt oder `matchNumber <= loadTemplate(playerCount).totalMatches`
   → `NotAnExtraMatchError`. Template-Matches sind nicht löschbar.
4. `tx.match.delete({ where: { id } })`.
5. **Renumbering ohne Unique-Kollision** (`@@unique([gameDayId, matchNumber])`):
   nachfolgende Matches (`matchNumber > N`) **aufsteigend sortiert** laden und
   **einzeln** per Update auf `matchNumber - 1` setzen. Aufsteigende Reihenfolge
   + vorher gelöschtes N garantiert, dass jedes Ziel-Slot frei ist; jede Update-
   Anweisung hinterlässt einen validen Zustand. Kein Bulk-`{ decrement: 1 }`
   (Postgres prüft Unique row-by-row → transiente Verletzung möglich).
6. `auditLog` `game_day.remove_extra_match` (Payload: `gameDayId`,
   `matchNumber`, `hadScore`, ggf. `team1Score`/`team2Score`).
7. Nach Commit: `publishGameDayUpdate(gameDayId)`.

### Route: `DELETE /api/game-days/[id]/matches/[matchId]/route.ts`

- `auth()` → 401 wenn nicht eingeloggt.
- **Admin-only**: `!session.user.isAdmin` → 403 (strenger als POST, das auch
  bestätigte/Joker-Spieler erlaubt).
- `removeExtraMatch(matchId, session.user.id)`, Fehler-Mapping:
  - `MatchNotFoundError` → 404
  - `GameDayNotActiveError` → 409
  - `NotAnExtraMatchError` → 422
- Erfolg → 200 `{ ok: true }`.
- Die `[id]` (gameDayId) dient der RESTful-Pfadstruktur; die Lib validiert
  Match→GameDay-Zugehörigkeit über das geladene Match selbst.

## Frontend

### `src/app/game-day/page.tsx`

- `templateTotal = loadTemplate(day.playerCount).totalMatches` (nur wenn
  `playerCount` gesetzt, also in_progress/finished).
- Pro Match an `MatchInlineCard` weiterreichen:
  `removable = session.user.isAdmin && day.status === "in_progress" && m.matchNumber > templateTotal`
  sowie `gameDayId`.

### `src/app/game-day/match-inline-card.tsx`

- Neuer dezenter „🗑 entfernen"-Link, nur sichtbar wenn `removable` **und** nicht
  im Edit-Modus.
- Klick → Inline-Bestätigungszustand (kein Modal): „Match X entfernen?
  [Abbrechen] [Ja, entfernen]". Hat das Match ein Ergebnis, zusätzlicher
  Warnhinweis „Verändert die Tageswertung."
- Bestätigung → `DELETE /api/game-days/{gameDayId}/matches/{id}` → bei Erfolg
  `router.refresh()`; bei Fehler lokalisierte Meldung (analog Score-Flow).

## Tests

- **Unit** `tests/unit/game-day/remove-extra-match.test.ts`:
  - entfernt unbewertetes Zusatz-Match; Anzahl Matches sinkt um 1
  - entfernt bewertetes Zusatz-Match (mit Warn-Pfad-Daten im Audit-Log)
  - lehnt Template-Match ab (`NotAnExtraMatchError`)
  - lehnt finished/planned Day ab (`GameDayNotActiveError`)
  - Renumbering: nach Entfernen eines mittleren Zusatz-Matches sind die
    folgenden lückenlos und ohne Unique-Verletzung
  - schreibt `game_day.remove_extra_match` Audit-Log
- **Integration** `tests/integration/game-day-remove-extra-match.test.ts`:
  - Admin DELETE entfernt Match → 200
  - Nicht-Admin → 403
  - Template-Match → 422
  - nach Entfernen des letzten unbewerteten Zusatz-Matches: alle restlichen
    Matches bewertet → Finish-Pfad wieder offen

## Bewusst weggelassen (YAGNI)

- Kein Undo / Soft-Delete.
- Kein Modal-Framework.
- Kein Entfernen von Template-Matches.
- Keine direkte Prod-DB-Korrektur für den 09.06. — der Admin nutzt das Feature.
