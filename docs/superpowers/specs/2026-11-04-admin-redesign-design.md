# Verwaltung neu: Übersicht mit Unterseiten (Design)

Stand 2026-11-04, freigegeben von Patrick („A genau so umsetzen").
Mockup als verbindliche Vorlage: `docs/superpowers/specs/2026-11-04-admin-redesign-mockup.html`
(Variante A, sechs iPhone-Bildschirme; B und C sind verworfen bis auf das „＋" aus C).

## Absicht

Die heutige Admin-Seite ist eine lange Seite mit sechs Karten (Spieler,
Einladen, Saison, Spieltage, Historische Daten, Gruppe) und fünf Knöpfen
pro Spielerzeile. Sie soll sich anfühlen wie die iOS-Einstellungen: eine
Übersicht mit gruppierten Listen, große Überschriften, eine kurze Seite pro
Aufgabe, „‹ Zurück" oben links. Das passt zur kommenden iPhone-App.

## Ziele

- `/admin` wird eine Übersicht „Verwaltung" mit Hero „Nächster Spieltag" und
  drei Listengruppen: Saison 2026 (Spieltage, Saison), Mitglieder (Spieler,
  Einladen), Gruppe (Einstellungen).
- Unterseiten mit eigenen Adressen:
  - `/admin/spieltage`: großer Knopf „＋ Spieltag anlegen", Abschnitt
    „Offen" (geplanter oder laufender Spieltag), „Zuletzt gespielt" (letzte
    drei beendete mit Gold-Gewinnern), unten rot „Saison abschließen…".
  - `/admin/spieltage/[id]`: geplanter Spieltag mit Zusagen-Liste
    (heutiger `ParticipantsRoster`), „Starten", „Löschen".
  - `/admin/saison`: Name, Startdatum, gespielte Spieltage, Joker pro Saison,
    „Saison abschließen…".
  - `/admin/spieler`: Suchfeld, Abschnitte „Admins" und „Mitglieder · N",
    Zeilen wie in „Kontakte" (Avatar, Name, Rollen-Pill, Hinweis „E-Mail
    nicht bestätigt"), „＋" oben rechts legt einen Spieler an.
  - `/admin/spieler/[id]`: Avatar groß, Name, „Mitglied seit", Zeilen
    E-Mail, Rolle, Diese Saison (Gold-Medaillen, PPG); Abschnitt „Konto" mit
    Profilbild ändern, Passwort zurücksetzen, Besitz übertragen…; abgesetzt
    rot „Aus der Gruppe entfernen"; „Bearbeiten" oben rechts.
  - `/admin/einladen`: Notiz, „Einladungslink erstellen", neuer Link mit
    „Kopieren" und „Teilen ⇪", Liste „Offene Links" mit „Widerrufen".
  - `/admin/einstellungen`: Gruppe (Name, Kennung), Spielregeln (nur
    Anzeige: Joker pro Saison, Spieler pro Spieltag) mit Fußnote, Besitz
    übertragen…, abgesetzt rot „Gruppe löschen".
- Tab und Navigationspunkt heißen „Verwaltung" statt „Admin" (Pfad bleibt
  `/admin`).
- Im Tab „Spieltag" sehen Admins oben rechts ein „＋", das auf
  `/admin/spieltage` führt.
- „Historische Daten" fällt weg.

## Nicht-Ziele

- Keine neuen Server-Funktionen: alle Aktionen nutzen die bestehenden APIs
  und Dialoge (Spieler anlegen/bearbeiten/löschen, Passwort, Avatar, Rolle
  über `PATCH /api/players/[id]`, Besitz übertragen, Gruppe umbenennen/
  löschen, Einladungen, Spieltag anlegen/starten/löschen, Saison abschließen).
- Keine konfigurierbaren Spielregeln.
- Keine Wisch-Gesten auf Listenzeilen.
- Kein Umbau der übrigen Tabs.

## Anti-Ziele

- Keine Funktion darf verloren gehen, die heute auf `/admin` erreichbar ist
  (außer „Historische Daten").
- Rechte bleiben exakt wie heute: Nicht-Admins kommen nicht auf
  `/admin/**` (Redirect wie heute auf `/ranking`), owner-only-Aktionen
  bleiben owner-only, Gruppenfremdes ist 404.
- Browser auf dem Desktop darf nicht schlechter aussehen: die Listen sind
  auf großen Bildschirmen mittig mit begrenzter Breite.

## Entscheidungen

Von Patrick: Variante A exakt wie im Mockup; Historische Daten raus; Gruppe
unter „Einstellungen"; Spieltag anlegen unter Saison/Spieltage; Einladen
eigene Seite; Spielerverwaltung übersichtlicher.

Meine Festlegungen (Patrick kann sie kippen):

1. **Icons:** statt der Emojis aus dem Mockup Lucide-Icons in farbigen,
   abgerundeten Quadraten (Farben wie im Mockup). Emojis bleiben nur bei
   Medaillen.
2. **Hero:** geplanter Spieltag → `/admin/spieltage/[id]`; laufender →
   `/game-day`; keiner → Hero „Kein Spieltag geplant" mit Knopf „Spieltag
   anlegen" → `/admin/spieltage`. Text „X von Y zugesagt · Z offen".
3. **Einstellungen für Admins ohne Besitz:** Zeile sichtbar, Seite
   read-only (Name, Kennung, Regeln); Umbenennen, Besitz übertragen und
   Löschen nur für den Owner.
4. **Rolle:** Zeile „Rolle" öffnet eine Auswahl Mitglied/Admin (bestehende
   PATCH-Route); beim Owner nur Anzeige „Besitzer" ohne Pfeil. Ändern darf
   nur, wer es heute im Bearbeiten-Dialog darf.
5. **Besitz übertragen in Einstellungen:** öffnet eine Spielerauswahl und
   danach den bestehenden Übertragen-Dialog mit Passwort.
6. **Diese Saison:** Gold-Medaillen und PPG aus der vorhandenen
   Saisonstatistik; ohne Spiele „Noch keine Spiele".
7. **Zuletzt gespielt:** führt auf `/archive/[id]`; Gewinner aus dem
   Podium mit Rang 1.
8. **Teilen:** `navigator.share` wenn vorhanden, sonst wird der Knopf nicht
   gezeigt; „Kopieren" bleibt.
9. **Willkommen-Hinweis** nach Gruppengründung bleibt auf der Übersicht
   (`/admin?willkommen=1`).
10. **Desktop:** Inhalt `max-w-2xl` zentriert; gleiche Bausteine.
11. **Gemeinsame Bausteine:** `GroupedList`, `ListRow` (Icon, Titel,
    Untertitel, Wert, Pfeil, Ton „destructive"), `SectionLabel`,
    `SectionFooter`, `LargeTitle` mit Zurück-Link, in
    `src/components/ui/list.tsx`.
12. **E2E-Helfer** (`tests/e2e/lib.mjs`) ziehen mit: Spieltag anlegen auf
    `/admin/spieltage`, Start auf der Detailseite.

## Abnahme

- Jede heutige Admin-Aktion ist über die neuen Seiten erreichbar und
  funktioniert (Unit-/Komponententests plus E2E-Lauf „fremde Gruppe").
- Screenshots der sechs Bildschirme auf iPhone-Breite entsprechen dem
  Mockup; Desktop-Screenshot der Übersicht.
- Nicht-Admin auf `/admin/spieler` → Redirect `/ranking`.
- Lokale Demo für Patrick vor dem Commit-Push.

## Klarstellungen aus der Builder-Prüfung (meine Festlegungen)

13. **Laufender Spieltag:** In „Offen" verlinkt er nur auf `/game-day`,
    ohne Löschen. `/admin/spieltage/[id]` zeigt nur geplante Spieltage;
    andere Status leiten auf `/game-day` (laufend) bzw. `/archive/[id]`
    (beendet) um. Keine neue Fähigkeit.
14. **Mehrere geplante Spieltage** sind möglich (nur das Datum ist pro
    Gruppe eindeutig). „Offen" ist eine Liste: laufender zuerst, dann
    geplante nach Datum aufsteigend. Hero: laufender, sonst frühester
    geplanter. „Spieltag anlegen" bleibt immer möglich, wie heute.
15. **Daten:** nur Server-Komponenten mit Lese-Abfragen über vorhandene
    Bibliotheksfunktionen (`listActiveMembers`, `computePlayerSeasonStats`,
    `computeGameDaySummary`, `listOpenInvitations`); `joinedAt` aus
    `Membership`. Keine neuen API-Routen. Fremde, entfernte oder unbekannte
    IDs auf `/admin/spieler/[id]` und `/admin/spieltage/[id]` → `notFound()`.
16. **Rechte pro Aktion, wie heute:** Bearbeiten (Name, E-Mail,
    Benutzername) für jedes Mitglied; Rolle ändern und „Aus der Gruppe
    entfernen" (bestehender `DeletePlayerDialog`) nicht beim Owner;
    „Besitz übertragen" nur, wenn der Betrachter Owner ist und das Ziel
    nicht Owner ist und ein Passwort hat; Passwort zurücksetzen und
    Profilbild für alle. Die Rolle verlässt den Bearbeiten-Dialog und sitzt
    nur noch in der Zeile „Rolle".
17. **Zählung Spielerliste:** „Admins" enthält Owner und Admins, „Mitglieder
    · N" zählt nur Mitglieder. Die Zahl in der Übersicht ist die
    Gesamtzahl aktiver Mitglieder. „Einladen" zeigt die Zahl offener Links.
18. **Navigation:** Der Tab „Verwaltung" ist auf allen `/admin/**` aktiv
    (vorhandener Präfix-Vergleich). „‹ Zurück" ist immer ein Link auf die
    Elternseite, kein `router.back()`.
19. **E2E:** Helfer nutzen stabile `data-testid`s statt Texten.
