# Home A+ (Matchday + Saison-Karte)

Mockup: `2026-11-04-home-redesign-mockup.html`, Abschnitt `#variant-AP`.

## Aufbau (von oben)

1. **Kopf**: Avatar + „Hi, Vorname“, Gruppenname klein. Kein Untertitel mit Rang/Joker mehr (steht in der Saison-Karte).
2. **Ticket** (genau ein Zustand):
   - **Geplant**: Wochentag + großes Datum `12.11.`; rechts „Anpfiff 18:00“ und Countdown-Chip („in 8 Tagen“, „morgen“, „heute“). Ohne Uhrzeit steht rechts der Countdown groß. Perforation, Pips (Zusagen als Avatare, offene als gestrichelte Kreise, max. 8 + „+n“), „4 von 6 zugesagt · 2 offen“, eigener Status, Aktionen Zusagen / Absagen / Joker. Nicht-Mitglied: „Teilnehmen“.
   - **Live** (`in_progress`): Chip „Live“, „Match 4 von 9“, 9 Segmente (gewertet / aktuell / offen). Scoreboard = letztes gewertetes Match (Teams + Ergebnis); darunter „Jetzt: A & B gegen C & D“. Vor dem ersten Ergebnis: das erste Match mit „gegen“. Button „Zum Spieltag“.
   - **Nichts geplant**: Rückblick auf den letzten beendeten Spieltag mit Top 3 (geteilte Plätze möglich) und „Nächster Spieltag noch nicht geplant“. Gibt es noch keinen, kurzer Hinweis-Ticket.
3. **Saison-Karte**: großes PPG, Lime-Ring Gewinnquote (Siege/Matches), Rang `#x von n`, Dabei `a/t · j Joker`, Form-Kurve der letzten bis zu 5 Spieltage (alt → neu). Im Zustand „nichts geplant“ ohne Lime-Glow (tritt hinter den Rückblick zurück).
   Leerzustand (keine Matches): „Dein erster Spieltag zählt“, Ring zeigt verbleibende Joker, fünf leere Form-Balken.
4. **Tabelle**: Top 3 der Saisonrangliste, eigene Zeile hervorgehoben; ist man nicht in den Top 3, folgt die eigene Zeile darunter. Rechts Punkte groß, PPG klein (Rangliste sortiert nach Punkten). Mini-Formbalken (PPG der letzten 5 Spieltage). Link „Rangliste“.
5. **Pokalregal**: Gold / Silber / Bronze der Saison.
6. **Duo-Karten**: Bestes Duo / Weniger Glück (Punkte zusammen, Matches). Nur wenn Partnerdaten da sind.

Entfällt: Joker-Karte, Stat-Tiles, Form-Balkenkarte, Partnerliste.

## Gestaltung

- Display-Schrift Barlow Condensed (next/font, selbst gehostet) für Zahlen, Labels, Datum; Fließtext bleibt Systemschrift.
- Farben aus den bestehenden Tokens (cyan, lime, surface). Ticket-Verlauf wie `--hero-gradient`.
- Animation nur CSS (Ring füllt sich, Kurve zeichnet sich, Live-Puls), aus bei `prefers-reduced-motion`.
- Touch-Ziele ≥ 44 px, Kontraste AA.

## Daten

- Countdown in Berliner Kalendertagen.
- Live: Matches des laufenden Spieltags (Nummer, Teams, Ergebnis).
- Rückblick: `computeGameDaySummary` des letzten beendeten Spieltags.
- Formbalken: PPG je Spieler und Spieltag der letzten 5 beendeten Spieltage der Saison (eine Abfrage).
