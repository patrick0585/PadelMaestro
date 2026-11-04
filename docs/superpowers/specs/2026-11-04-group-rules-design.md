# Spielregeln pro Gruppe einstellbar (Design)

Stand 2026-11-04, Entscheidungen von Patrick („ja passt" auf die drei
Vorschläge). Baut auf der neuen Verwaltung auf
(`2026-11-04-admin-redesign-design.md`).

## Absicht

Jede Gruppe soll ihre Joker-Regeln selbst festlegen können, statt der für
alle festen Werte im Code. Das ist der erste Schritt zu Phase 4
„Regeln pro Gruppe konfigurierbar" und für fremde Beta-Gruppen sofort nützlich.

## Ziele

- Zwei Regeln pro Gruppe, gespeichert auf `Group`:
  - `jokersPerSeason` (heute fest 2)
  - `jokerGamesCredited` (heute fest 15, „Spiele, die ein Joker gutschreibt")
- Bestehende Gruppen behalten ihre heutigen Werte (Migration mit Defaults 2 und 15).
- Seite `/admin/einstellungen`: Abschnitt „Spielregeln" mit zwei
  Stepper-Zeilen und „Sichern"; „Spieler pro Spieltag 4–6" bleibt reine
  Anzeige. Die Fußnote „Regeln sind in Version 1 fest…" entfällt; neue
  Fußnote erklärt, dass Änderungen sofort gelten und bereits eingesetzte
  Joker unverändert bleiben.
- Alle Stellen, die heute die Konstanten nutzen, lesen den Wert der
  jeweiligen Gruppe: Joker einsetzen (Obergrenze und Gutschrift),
  verbleibende Joker im Roster und in der Spielerstatistik, Saison-Dialog,
  Saison-Seite, Joker-Bestätigungsdialog, Druckansicht.

## Rechte (Entscheidung Patrick)

- Admins und Besitzer dürfen Gruppenname und Regeln ändern.
- Besitz übertragen und Gruppe löschen bleiben beim Besitzer.
- Das bisherige Umbenennen (`PATCH /api/groups/active`) wird von „nur Owner"
  auf „Admin oder Owner" geöffnet.

## Gültigkeit (Entscheidung Patrick)

- Änderungen gelten sofort, auch in der laufenden Saison.
- `jokersPerSeason` darf nicht unter die höchste Zahl bereits eingesetzter
  Joker eines aktiven Mitglieds in der aktiven Saison sinken. Sonst Fehler
  409 `below_used` mit dieser Zahl; die Seite zeigt „Mindestens N, weil
  schon N Joker eingesetzt wurden."
- Bereits eingesetzte Joker behalten ihre gespeicherte Gutschrift
  (`JokerUse.gamesCredited`, `pointsCredited`); `jokerGamesCredited` wirkt
  nur auf neue Joker.

## Nicht-Ziele

- Spieler pro Spieltag einstellbar (hängt an den Spielplan-Vorlagen).
- Regeln pro Saison statt pro Gruppe.
- Verlauf der Regeländerungen in der UI (das Audit-Log genügt).

## Meine Festlegungen

1. **Grenzen:** `jokersPerSeason` 0–10, `jokerGamesCredited` 1–30, ganze Zahlen.
2. **API:** `PATCH /api/groups/active/rules` mit
   `{ groupId, jokersPerSeason, jokerGamesCredited }`; Guard wie die anderen
   Gruppen-Routen, Admin-Rolle, `stale_group` bei falscher Gruppe.
3. **Audit:** `group.rules_update` mit alten und neuen Werten.
4. **Lesen:** eine Funktion `getGroupRules(groupId)` in `src/lib/group/rules.ts`;
   die Konstanten bleiben nur noch als Defaults der Migration und für Tests.
5. **Bedienung:** iOS-artige Stepper (−/+) mit Wert in der Zeile, „Sichern"
   erst aktiv bei Änderung, wie beim Umbenennen.

## Abnahme

- Bestehende Gruppe zeigt nach der Migration 2 und 15, Verhalten unverändert.
- Admin ändert auf 3 Joker: ein Spieler mit 2 eingesetzten Jokern kann einen
  dritten setzen; Roster und Spielerstatistik zeigen „1 übrig".
- Senken unter die eingesetzte Zahl wird abgelehnt.
- Neue Gutschrift 10: neuer Joker schreibt 10 × Schnitt gut, alte Joker unverändert.
- Mitglied ohne Admin-Rolle: Seite nur lesend, Route 403.
