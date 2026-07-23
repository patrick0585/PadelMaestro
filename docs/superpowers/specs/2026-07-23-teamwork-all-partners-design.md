# Teamwork mit allen Partnern — Design

Datum: 2026-07-23
Status: freigegeben (Patrick, 2026-07-23)

## Ziel

Die Teamwork-Sektion auf der Startseite zeigt bisher nur den besten und
den schlechtesten Partner. Künftig sind dort alle Partner der laufenden
Saison sichtbar.

## Entscheidungen

1. **Sortierung nach Gesamtpunkten zusammen** (wie die bisherige
   „Beste Chemie"-Logik; Tiebreaker: Matches, dann Name de-locale) —
   nicht nach Ø oder Win-Rate.
2. **Design-Variante B — „Highlights + Restliste"** (per Mockup-Vergleich
   gewählt): Die zwei bekannten Farbkarten bleiben unverändert, darunter
   erscheinen die übrigen Partner als Kompaktliste.

## Datenschicht

`src/lib/player/season-stats.ts`:

- `PlayerSeasonStats` bekommt zusätzlich `partners: PartnerStat[]` —
  alle Partner der Saison, sortiert wie `bestSorted` (Gesamtpunkte
  absteigend, Tiebreaker Matches absteigend, Name `localeCompare` de).
  Die bestehende `bestSorted`-Sortierung wird dafür wiederverwendet
  (kein doppelter Comparator).
- `bestPartner` / `worstPartner` bleiben unverändert (inkl. des
  Tie-Guards, dass beide nie derselbe Spieler sind).
- Gelöschte Spieler sind wie bisher ausgefiltert (`deletedAt: null`
  beim Namens-Lookup; Partner ohne Namenstreffer erscheinen wie bisher
  als „Unbekannt" — Verhalten unverändert).

## UI

`src/app/page.tsx`, Teamwork-Sektion:

- Die zwei Highlight-Karten („Beste Chemie" grün, „Weniger Glück" rot)
  bleiben exakt wie heute, inkl. des gestrichelten Platzhalters, wenn
  es keinen `worstPartner` gibt.
- Neu darunter, mit `border-t border-border` abgesetzt: Kompaktliste
  der übrigen Partner (alle außer `bestPartner`/`worstPartner`),
  punktabsteigend. Zeile: Avatar (32px), Name (fett), rechtsbündig
  `X Pt · Y Matches` (Singular: `Match`; tabular-nums, muted). Kein Link, keine Interaktion.
- Die Filterung „alle außer best/worst" passiert in `page.tsx`
  (per `playerId`-Vergleich), nicht in der Datenschicht.

## Edge Cases

- 0 Partner: Sektion erscheint wie bisher gar nicht (`bestPartner`
  ist null).
- 1 Partner: wie heute — eine Karte + Platzhalter, keine Liste.
- 2 Partner: zwei Karten, keine Liste.
- 3+ Partner: zwei Karten + Liste mit den übrigen.

## Tests

- Integrationstest (`tests/integration/player-season-stats.test.ts`
  erweitern): `partners` enthält alle Partner, korrekt sortiert
  (Punkte → Matches → Name), konsistent mit `bestPartner` (erstes
  Element) — und bleibt leer ohne Matches.
- Bestehende best/worst-Tests bleiben unverändert grün.

## Nicht im Scope

- Keine Änderung der best/worst-Definition, keine neuen Metriken
  (Ø/Win-Rate werden nicht angezeigt), keine eigene Partner-Seite,
  kein Umbau anderer Dashboard-Sektionen.
