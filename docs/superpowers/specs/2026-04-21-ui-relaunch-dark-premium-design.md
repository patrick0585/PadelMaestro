# Padel Tracker · UI Relaunch (Dark Premium) — Design Spec

**Datum:** 2026-04-21
**Status:** Draft → User Review
**Scope:** Phase B + A kombiniert (Visual-Refresh + Shell/IA-Redesign + gezielte Flow-Politur). Keine API-, Schema- oder Business-Logik-Änderungen.

---

## 1 Zielbild

Der Padel Tracker bekommt das Feeling einer modernen, sportlichen Premium-App (Inspirationsrahmen Padelcity / Padello), ohne neue Fachfunktionen einzuführen. Drei Säulen:

1. **Look** — geschlossenes Dark-Premium-Farbsystem mit Cyan-Akzent.
2. **Shell & IA** — neues Dashboard als Home, 4-Tab-Navigation, Avatar-Menü im Header.
3. **Flows** — Spieltag als phasenbasierte Timeline, Match-Score per Inline-Stepper.

Alles, was darüber hinausgeht (Profil, History, Stats-Deep-Dive, Push, Multi-Spieltag, Invite-Refresh), ist bewusst **nicht** in dieser Phase und läuft separat in Phase C.

---

## 2 Architektur

### 2.1 Abgrenzung

**Betroffen (UI/Shell):**
- `src/app/globals.css` — Token-Block komplett neu
- `src/components/ui/*` — Primitives (Button, Card, Badge, Input, Dialog) um Dark-Premium-Varianten erweitert
- `src/components/AppShell.tsx` und darunterliegende `TopNav` / `BottomTabs` — neue Navigationsstruktur (4 Tabs, Admin bedingt)
- `src/app/page.tsx` — neu: Dashboard (ersetzt Redirect auf `/ranking` als Startziel)
- `src/app/login/*` — Restyle
- `src/app/ranking/*` — Restyle (Visual-Refresh ohne Flow-Änderung)
- `src/app/game-day/*` — Timeline-Layout, phasenabhängige Sektionen, Inline-Score-Stepper
- `src/app/admin/*` — Restyle aller Subkomponenten (`create-game-day-form`, `players-section`, `participants-roster`, `create-player-dialog`, `reset-password-dialog`, `start-game-day-button`)

**Nicht betroffen:**
- Prisma-Schema
- API-Routen und Business-Logik in `src/lib/**`
- Auth-Flow (`src/auth.ts`, `src/auth.config.ts`)
- Migrationsstand

### 2.2 Routing / IA

| Route | Vorher | Nachher |
|---|---|---|
| `/` | Redirect → `/ranking` (via Login-Success) | **Dashboard (neu)** |
| `/ranking` | Home | Bleibt als eigene Seite, Visual-Refresh |
| `/game-day` | Attendance + Participants + Matches | Timeline-Layout, phasenabhängige Sektionen |
| `/admin` | Playerverwaltung + GameDay + Roster | Unverändert in Funktion, neues Styling |
| `/login` | Email/Passwort-Form | Restyle |
| `/invite` | bereits entfernt (siehe `project_invitation_cleanup_followups`) | unverändert |

Login-Success-Redirect wird von `/ranking` auf `/` umgestellt.

### 2.3 Navigation (Shell)

- **BottomTabs (mobil, `md:hidden`)** — 4 Tabs in dieser Reihenfolge:
  1. 🏠 Home (`/`)
  2. 🏆 Rangliste (`/ranking`)
  3. 🎾 Spieltag (`/game-day`)
  4. ⚙️ Admin (`/admin`) — **nur sichtbar für `session.user.isAdmin`**
- **TopNav (Desktop, `md:block`)** — Logo links, Inline-Links für die gleichen 4 Ziele mittig, Avatar-Kreis rechts.
- **Avatar-Menü** (beide Breakpoints) — Kreis mit Initialen. Tap öffnet einfaches Dropdown: eine Zeile „Abmelden".
- AppShell zeigt Nav und Avatar nur, wenn ein Session-Nutzer vorhanden ist.

---

## 3 Design-System (Tokens)

### 3.1 Farben (CSS-Variablen in `globals.css`, gespiegelt im Tailwind-Theme)

| Token | Hex | Zweck |
|---|---|---|
| `--background` | `#0b1220` | App-Hintergrund |
| `--surface` | `#111a2e` | Primäre Kartenflächen |
| `--surface-muted` | `#0f1a2f` | Eingebettete Tiles (z. B. Match-Cards innerhalb einer Phase-Sektion) |
| `--surface-elevated` | `#1a2440` | Dialoge / Bottom-Sheets |
| `--border` | `#1e293b` | Standard-Rahmen |
| `--border-strong` | `#334155` | Hover/Fokus-Rahmen, Ghost-Buttons |
| `--foreground` | `#f1f5f9` | Primärer Text |
| `--foreground-muted` | `#94a3b8` | Sekundärer Text, Labels |
| `--foreground-dim` | `#64748b` | Hilfstext, Placeholder |
| `--primary` | `#22d3ee` | Cyan-Akzent, Stats, Links |
| `--primary-strong` | `#06b6d4` | Gradient-Start / Hover |
| `--primary-soft` | `rgba(34,211,238,0.15)` | Chip-Hintergründe |
| `--success` | `#bef264` | Bestätigt / Sieger |
| `--success-soft` | `rgba(163,230,53,0.15)` | Success-Chips |
| `--destructive` | `#f43f5e` | Fehler, Absage |
| `--destructive-soft` | `rgba(244,63,94,0.15)` | Destructive-Chips |
| `--hero-gradient` | `linear-gradient(135deg, #0e7490 0%, #134e4a 100%)` | Hero-Tiles |
| `--cta-gradient` | `linear-gradient(90deg, #06b6d4, #22d3ee)` | Primärer CTA-Button |

Kein Light-Mode in dieser Phase (gezielt eine Variante pflegen, bevor Theme-Switching dazukommt).

### 3.2 Typografie

- Font-Stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (unverändert).
- Skala: 12 / 13 / 14 / 16 / 18 / 22 / 28 px.
- Gewichte: 500 (Body Muted), 600 (Body), 700 (Headlines), 800 (Stat-Werte), 900 (Hero-Stat).
- `font-variant-numeric: tabular-nums` auf allen Score- und PPG-Zahlen.

### 3.3 Form / Spacing

- Radien: `sm: 0.55rem`, `md: 0.65rem`, `lg: 0.85rem`, `xl: 1rem`, `chip: 9999px`.
- Spacing-Rhythmus bleibt 4 / 8 / 12 / 16 / 24 (Tailwind `1 / 2 / 3 / 4 / 6`).
- Schattensystem: zusätzlich zum bestehenden `shadow-sm` ein `shadow-hero` (`0 14px 30px -12px rgba(0,0,0,0.35)`) für Hero-Tiles, `shadow-cta` (`0 6px 14px -4px rgba(34,211,238,0.35)`) für Primary-CTAs.

---

## 4 Komponenten

### 4.1 Bestehende Primitives — Varianten-Erweiterung

| Primitive | Neue Varianten |
|---|---|
| `Button` | `primary` (CTA-Gradient), `ghost` (transparent, `border-strong`), `destructive` (rot-transparent), `soft` (subtle Cyan) |
| `Card` | Standard (`surface`), `hero` (mit `hero-gradient` + Cyan-Border), `inset` (`surface-muted` für eingebettete Tiles) |
| `Badge` | `cyan`, `lime`, `soft`, `destructive` als Chip-Stile |
| `Dialog` | Neben bestehendem Center-Dialog ein Bottom-Sheet-Layout (Handle oben, untere Safe-Area-Respektierung) |
| `Input` | Dark-Surface, Cyan-Fokus-Ring |

### 4.2 Neue Komponenten

- `Timeline` (4-Step-Phasenanzeige) — Props: `steps: { id, label, status: "done" | "current" | "upcoming" }[]`.
- `Stepper` — ±-Input mit `value`, `min`, `max`, `onChange`. Accessible via Tastatur.
- `StatTile` — große Zahl mit Label und optionalem Trend-Badge.
- `AvatarStack` — überlappende Initialenkreise mit konfigurierbarem Max-Overlap.
- `ChipCluster` — Wrap-Container, der Chips/Badges im Flex-Wrap darstellt.

Alle neuen Komponenten: `src/components/ui/` oder feature-lokal. Wenn sie nur einmal verwendet werden, bleiben sie feature-lokal; `Stepper` und `StatTile` werden wiederverwendet, also UI-Primitives.

---

## 5 Seitendesigns

### 5.1 `/` Dashboard (neu)

**Zweck:** persönlicher Einstiegspunkt, ein Tap von allen Kernaktionen entfernt.

**Layout (Mobile, Breite entspricht max-w-4xl auf Desktop):**

1. **Greeting** — „Hi, {Vorname}" in `foreground-muted`, darunter Saison-Label.
2. **Hero-Tile** — nächster geplanter Spieltag:
   - Chip „Nächster Spieltag" links, Uhrzeit rechts.
   - Datum als H1.
   - Zähler „X / 6 bestätigt".
   - Primärer CTA: „Dabei sein" (wenn eigener Status nicht `confirmed`) oder sekundärer Status-Indikator + Ghost-Button „Absagen" (wenn `confirmed`).
   - Empty-State (kein planned GameDay): „Noch kein Spieltag geplant" + Admin-CTA „Spieltag anlegen" (→ `/admin`).
3. **2-Spalten-Stat-Tiles:**
   - Links: Dein PPG (Zahl, Cyan).
   - Rechts: Dein Rang `#X` (Lime).
   - Datenquelle: bestehende Ranking-Query, gefiltert auf eigenen Player.
4. **Top-3-Tile** — kompakte Liste (Pos / Name / PPG) mit Link „→ ansehen" zur vollen Rangliste.
5. **Admin-Hinweis-Tile** (nur wenn `isAdmin`): zeigt Offen-Zähler wie „2 Spieler offen" bzw. „Roster nicht voll", Tap → `/admin`.

**Error/Empty-Pfade:**
- Keine Daten des aktuellen Spielers in Ranking (Neueinsteiger) → Stat-Tiles zeigen `–` mit Erklärtext „Spiele erste Matches für deine Zahlen".
- Fehler beim Laden → Toast-Meldung, Tiles als Skeleton.

### 5.2 `/ranking`

**Zweck:** Saison-Rangliste lesen.

**Layout:**
- Header: Titel „Rangliste", Subtitle „Saison 2026".
- Karte mit Liste: eine Zeile pro Spieler mit Position (Cyan, tabular), Name (fett), PPG (tabular), Win-Rate-Chip (klein, subtle).
- Sortierung identisch zu heute.

**Kein Tap-Drilldown, keine Detail-Drawer** in dieser Phase. Head-to-Head / Trend ist Phase C.

### 5.3 `/game-day`

**Zweck:** alles, was ein Nutzer rund um einen Spieltag tut.

**Header:**
- Crumb „Spieltag".
- H1 mit Datum und Uhrzeit (`So · 21. April · 14:00`).
- `Timeline` mit 4 Schritten: Geplant → Roster → Matches → Fertig. Aktive Phase als `current`, zurückliegende als `done`, kommende als `upcoming`. Die Phase wird aus `GameDay.status` abgeleitet:
  - `planned` → Schritt 1 current
  - `roster_locked` → Schritt 2 current
  - `in_progress` → Schritt 3 current
  - `finished` → Schritt 4 current (alle done)

**Phasenabhängiger Inhalt:**

- **planned:**
  - Hero-Tile: eigener Status (Chip „Dabei" / „Offen" / „Absage"), Zähler „X / 6 bestätigt", Hilfetext. Ghost-Button „Status ändern" öffnet inline-toggle (pending/confirmed/declined).
  - `ChipCluster` der Teilnehmer, gruppiert nach Status (Dabei / Offen / Abgesagt).
  - Wenn Nutzer Nicht-Teilnehmer: JoinButton-Tile („Du bist noch nicht dabei", CTA „Teilnehmen").

- **roster_locked:**
  - Hero-Tile: „Warten auf Start".
  - `AvatarStack` der bestätigten Spieler.
  - Nicht-bestätigte Spieler ausgeblendet.

- **in_progress:**
  - Liste der Matches als Inline-Stepper-Karten.
  - Jede Karte: Label „Match N · offen / beendet / Eingabe läuft", zwei Team-Blöcke mit Namen, zwischen ihnen Scores.
  - **Tap auf einen Score** → Karte schaltet in Editiermodus: ±-Stepper pro Team-Score, `Abbrechen` / `Speichern` als Button-Paar. Beim Speichern: `PATCH /api/matches/:id` (unverändert), optimistisches Update, Rollback bei Fehler.
  - Bereits gespielte Matches zeigen Score groß in Cyan + „✎ bearbeiten"-Link.
  - Accessibility: Stepper muss per Tab erreichbar sein und mit Pfeiltasten bedienbar (nativ über Button-Elemente, keine custom Key-Handler nötig).

- **finished:**
  - Finalergebnisse je Match mit Siegermarkierung.
  - Zusammenfassung (Gesamtzähler Siege pro Spieler, Punkte für diese Spieltag-Rechnung).

### 5.4 `/admin`

Funktional identisch zu heute (Spieler anlegen/zurücksetzen, Spieltag erstellen, `ParticipantsRoster` DnD, Spieltag starten, Historie-Hinweis). Nur Styling-Anpassung:

- Alle `Card`-Instanzen auf neue Dark-Surface-Variante.
- Buttons auf neue Varianten.
- Section-Headlines hierarchisch einheitlich (H2 + uppercase Label).
- `ParticipantsRoster` (DnD) behält seine Interaktion; Pool/Roster-Columns nutzen neue Border/Background-Tokens.

### 5.5 `/login`

- Vertikal zentrierte Karte auf `background`.
- Oben: Logo/Brand, darunter „Willkommen zurück".
- Email- und Passwort-Inputs (Dark-Variant).
- Primary-CTA (Gradient): „Anmelden".
- Fehlermeldung unterhalb der Inputs, nicht in einem Dialog.

---

## 6 Fehler- und Leerzustände

| Kontext | Zustand | Behandlung |
|---|---|---|
| Dashboard Hero | kein planned GameDay | „Noch kein Spieltag geplant"; Admin sieht CTA „Spieltag anlegen" |
| Dashboard Hero | Nutzer ist in keinem planned GameDay | CTA „Teilnehmen" sichtbar |
| Dashboard Stat-Tile | Spieler hat noch keine Matches | `–` mit Hilfetext |
| Dashboard Top-3 | Rangliste leer | Platzhaltertext „Noch keine Spieler mit Matches" |
| Game Day | nicht eingeloggt | Redirect `/login` (unverändert) |
| Game Day | Spieltag existiert nicht | 404-Seite |
| Game Day Matches | Stepper-Speichern schlägt fehl | Inline-Toast „Konnte Score nicht speichern"; Rollback des optimistischen Wertes |
| Admin | Nicht-Admin ruft `/admin` auf | Redirect `/ranking` (unverändert) |
| Login | Falsche Credentials | Inline-Fehlermeldung unter Formular |
| Netzwerk | offline während Aktion | Generischer Error-Toast, Rollback |

---

## 7 Zugänglichkeit

- Alle interaktiven Elemente sind nativ fokussierbar (`<button>`, `<a>`, `<input>`); keine `div`-Buttons.
- Farbkontrast: `foreground` auf `background` liegt über 12:1. `foreground-muted` auf `background` wird für reinen Info-Text genutzt, nicht für kritische Aktionen.
- Fokus-Ring: sichtbarer 2px Cyan-Ring (`ring-2 ring-primary ring-offset-2 ring-offset-background`).
- `Timeline`-Komponente: aktueller Schritt bekommt `aria-current="step"`, alle Schritte zusätzlich Screenreader-Text `„Schritt X von 4, Label, Status"`.
- `Stepper`: Buttons mit `aria-label="Score erhöhen"` / `"Score verringern"`, Wert in `<output>` oder `<span aria-live="polite">`.
- `AvatarStack`: Vollständige Namensliste in `aria-label` oder visuell-verstecktem Text.
- Tap-Ziele in Bottom-Nav und Match-Karten mindestens 44×44 px.

---

## 8 Tests

- **Vitest + Testing-Library** für neue UI-Primitives:
  - `Timeline` rendert alle Schritte und markiert current/done.
  - `Stepper` erhöht/verringert Werte, respektiert min/max, ignoriert invalide Eingaben.
  - `StatTile` rendert Zahl und Label.
  - `AvatarStack` rendert korrekte Anzahl Initialen und Overflow-Chip bei > max.
- **Keine neuen Integration-Tests** für API-Routen (unverändert).
- **Smoke-Checkliste (manuell)** vor Deploy:
  1. Login → Dashboard zeigt nächsten Spieltag.
  2. Status auf „Dabei" ändern → Zähler aktualisiert sich.
  3. `/ranking` zeigt alle Spieler im Dark-Premium-Look.
  4. `/game-day` zeigt Timeline mit richtiger aktueller Phase.
  5. In `in_progress`-Phase: Match-Score eintragen, Tap+Stepper+Speichern, Refresh der Seite — Wert bleibt.
  6. `/admin` öffnen, Player anlegen, Roster-DnD funktioniert unverändert.
  7. Logout via Avatar-Menü.

Keine visuelle Regressionsuite in dieser Phase; manueller Screenshot-Abgleich gegen die Mockups reicht.

---

## 9 Rollout & Migration

- Einzelner Release-Merge, einzelner Deploy (kein Feature-Flag).
- Keine Datenmigration nötig.
- Login-Redirect-Ziel wechselt von `/ranking` auf `/` — geprüfter Pfad ist `src/app/login/login-form.tsx` (`window.location.assign`).
- Nach Deploy: Smoke-Checkliste (Abschnitt 8) auf dem VPS unter `http://217.154.83.37:8080`.

---

## 10 Explizit aus Scope (Phase C-Vorschau)

- **Profil-Seite** mit persönlichen Stats, Head-to-Head, Match-Historie.
- **Light Mode** und Theme-Switcher im Avatar-Menü.
- **Telegram-/Web-Push-Benachrichtigungen** (TelegramID-Feld existiert bereits im Schema, wird hier nicht angefasst).
- **Mehrere Spieltage parallel planen** (UI und Daten erlauben heute nur einen aktiven `planned`-Day).
- **Einladungs-Flow-Relaunch** (Link-basiert) — aktuell nur Admin-Anlage.
- **Automatische Paarungen** für Matches (aktuell manuell).
- **Offline-Unterstützung / PWA-Installation**.

Jeder dieser Punkte verdient eine eigene Spec; sie sind nicht Bestandteil dieses Designs.

---

## 11 Komponenten- und Datei-Übersicht (zur Orientierung für den Plan)

| Datei / Komponente | Aktion |
|---|---|
| `src/app/globals.css` | Tokens ersetzen |
| `src/components/ui/button.tsx` | Varianten erweitern |
| `src/components/ui/card.tsx` | Varianten erweitern |
| `src/components/ui/badge.tsx` | Chip-Stile ergänzen |
| `src/components/ui/dialog.tsx` | Bottom-Sheet-Variante ergänzen |
| `src/components/ui/input.tsx` | Dark-Variante |
| `src/components/ui/stepper.tsx` | **neu** |
| `src/components/ui/stat-tile.tsx` | **neu** |
| `src/components/ui/timeline.tsx` | **neu** |
| `src/components/ui/avatar-stack.tsx` | **neu** |
| `src/components/AppShell.tsx` + Sub-Nav | Restrukturieren (4 Tabs, Avatar-Menü) |
| `src/app/page.tsx` | **neu: Dashboard** |
| `src/app/login/*` | Restyle |
| `src/app/ranking/*` | Restyle |
| `src/app/game-day/*` | Timeline-Layout + Inline-Stepper-Match-Card |
| `src/app/admin/*` | Restyle |
| `src/app/login/login-form.tsx` | Redirect-Ziel `/ranking` → `/` |
| `tests/unit/components/*` | Tests für neue Primitives |
