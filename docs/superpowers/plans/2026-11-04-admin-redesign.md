# Verwaltung neu – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin` wird eine Übersicht im Stil der iOS-Einstellungen mit sechs Unterseiten, exakt nach dem freigegebenen Mockup (Variante A).

**Architecture:** Server-Komponenten pro Route laden Daten über vorhandene Bibliotheksfunktionen und kleine neue Lese-Helfer in `src/lib/admin/`. Gemeinsame Listen-Bausteine in `src/components/ui/list.tsx`. Bestehende Client-Dialoge werden wiederverwendet, keine neuen API-Routen.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind 4 mit den Tokens aus `src/app/globals.css`, Lucide-Icons, Prisma, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-04-admin-redesign-design.md` · Mockup (verbindlich): `docs/superpowers/specs/2026-11-04-admin-redesign-mockup.html`

## Global Constraints

- Optik exakt nach Mockup Variante A: Large Title 30px/800, Abschnitts-Labels 12px uppercase `text-foreground-muted`, gruppierte Listen `rounded-[14px]` auf Zeilenfarbe `#141f36`, Trennlinien `border` eingerückt ab Text, Zeilenhöhe ≥ 44px, Chevron `›` in `foreground-dim`, Primärknopf voll breit `bg-primary text-background`, Destruktives als eigene Gruppe mit rotem, zentriertem Text.
- Icon-Quadrate 30×30, `rounded-lg`, Farben: Spieltage `#0e7490`, Saison `#4338ca`, Spieler `#0f766e`, Einladen `#15803d`, Einstellungen `#475569`; Lucide statt Emoji (Emoji nur bei Medaillen).
- Rollen-Pills: Besitzer `amber-400` auf 15 % Amber, Admin `primary` auf `primary-soft`, Geplant grau.
- Inhalt `max-w-2xl mx-auto`.
- Routen: `/admin`, `/admin/spieltage`, `/admin/spieltage/[id]`, `/admin/saison`, `/admin/spieler`, `/admin/spieler/[id]`, `/admin/einladen`, `/admin/einstellungen`.
- Zugriff auf `/admin/**` wie heute: ohne Session → `/login`, ohne Admin-Rolle → `/ranking`; fremde/entfernte/unbekannte IDs → `notFound()`.
- Rechte (Spec 16): Bearbeiten für alle; Rolle und Entfernen nicht beim Owner; Besitz übertragen nur Viewer=Owner, Ziel≠Owner, Ziel mit Passwort; Gruppe umbenennen/löschen nur Owner.
- „Historische Daten" entfällt. Tab-Label „Verwaltung", Pfad bleibt `/admin`.
- Texte deutsch; Kommentare knapp; Commits deutsch und kurz, ohne Tool-Hinweise.
- Tests: `set -a; . ./.env; set +a; node node_modules/vitest/vitest.mjs run <file>`; Typecheck `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`.

## Review Focus

- **Nicht-Admin per Direktlink** auf jede Unterseite → Redirect `/ranking`, auch auf `/admin/spieler/[id]`. Test in Task 2 (gemeinsamer Guard).
- **Owner-Schutz:** Beim Owner fehlen Rolle ändern und Entfernen; Besitz übertragen fehlt, wenn der Betrachter nicht Owner ist. Tests in Task 5.
- **Leere Zustände:** kein Spieltag geplant (Hero „Kein Spieltag geplant"), keine gespielten Tage, keine offenen Links, Suche ohne Treffer („Keine Spieler gefunden"). Tests in den jeweiligen Tasks.
- **Lange Namen** (z. B. „Maximilian-Alexander von Hohenstein") brechen das Zeilenlayout nicht: `truncate`, Wert und Chevron bleiben sichtbar. Test in Task 1 (Klassen) und Screenshot in Task 7.
- **Teilen ohne `navigator.share`** (Desktop-Firefox): Knopf fehlt, „Kopieren" funktioniert. Test in Task 6.

---

### Task 1: Listen-Bausteine

**Files:**
- Create: `src/components/ui/list.tsx`
- Test: `tests/components/ui-list.test.tsx`

**Interfaces:**
- Produces:
  - `LargeTitle({ title: string; back?: { href: string; label: string }; action?: ReactNode })`
  - `SectionLabel({ children })`, `SectionFooter({ children })`
  - `GroupedList({ children, className? })`
  - `ListRow({ href?: string; onClick?: () => void; icon?: { node: ReactNode; color: string }; leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; value?: ReactNode; trailing?: ReactNode; chevron?: boolean; tone?: "default" | "primary" | "destructive"; align?: "start" | "center"; testId?: string })`
  - `PrimaryAction({ href?: string; onClick?: () => void; children; testId?: string })`

- [ ] **Step 1: Tests:**
  - `"renders a back link to the parent route"`: `LargeTitle` mit `back={{href:"/admin",label:"Verwaltung"}}` → Link mit Name „‹ Verwaltung" und `href="/admin"`.
  - `"renders a row as link with chevron and value"`: `href="/admin/spieler"`, `value="6"`, `chevron` → `role=link`, Text „6", Chevron-Zeichen `›` vorhanden.
  - `"renders a destructive centered row as button"`: `onClick`, `tone="destructive"`, `align="center"` → `role=button`, Klasse enthält `text-destructive` und `justify-center`; Klick ruft `onClick`.
  - `"truncates long titles"`: Titel-Element hat `truncate`, Wert-Element hat `shrink-0`.
- [ ] **Step 2: Run** → FAIL (Modul fehlt).
- [ ] **Step 3: Implement** nach den Global Constraints (Mockup-Maße). Zeilen ohne `href`/`onClick` sind `div`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `"Listen-Bausteine im iOS-Stil"`

### Task 2: Übersicht, Zugriffsschutz, Navigation

**Files:**
- Create: `src/lib/admin/guard.ts`, `src/lib/admin/overview.ts`, `src/app/admin/overview-view.tsx`
- Modify: `src/app/admin/page.tsx` (ersetzt durch Übersicht), `src/components/bottom-tabs.tsx`, `src/components/top-nav.tsx` (Label „Verwaltung"), `src/app/game-day/page.tsx` („＋" oben rechts für Admins → `/admin/spieltage`)
- Test: `tests/integration/admin-overview.test.ts`, `tests/components/admin-overview-view.test.tsx`, bestehende Tests von `bottom-tabs`/`top-nav` anpassen

**Interfaces:**
- Produces:
  - `requireAdmin(): Promise<GroupContext>` (redirect `/login` bzw. `/ranking`, sonst Kontext aus `contextFromSession`)
  - `loadAdminOverview(groupId: string): Promise<AdminOverview>` mit `{ hero: { kind: "running"; id: string; date: Date } | { kind: "planned"; id: string; date: Date; confirmed: number; total: number; pending: number } | { kind: "none" }; seasonName: string; seasonStart: Date; finishedCount: number; plannedCount: number; memberCount: number; openInvitationCount: number; groupName: string }`
  - `AdminOverviewView(props: AdminOverview & { welcome: boolean })`

- [ ] **Step 1: Integration-Tests `loadAdminOverview`:** Hero `none` ohne Tage; `planned` wählt den frühesten geplanten Tag und zählt `confirmed`/`pending` über aktive Mitglieder; `running` hat Vorrang vor geplant; `memberCount` ignoriert entfernte Mitgliedschaften; `openInvitationCount` zählt nur offene Links der Gruppe.
- [ ] **Step 2: Komponententests `AdminOverviewView`:** Large Title „Verwaltung"; Hero „Nächster Spieltag" mit „5 von 6 zugesagt · 1 offen" und Link auf `/admin/spieltage/<id>`; Hero `running` verlinkt `/game-day`; Hero `none` zeigt „Kein Spieltag geplant" und Link „Spieltag anlegen" → `/admin/spieltage`; Zeilen Spieltage („34 gespielt · 1 geplant"), Saison („seit 01.01."), Spieler (Badge „6"), Einladen („2 Links offen"), Einstellungen (Untertitel Gruppenname) mit den richtigen `href`s; `welcome` zeigt „Deine Gruppe steht. Lade jetzt deine Mitspieler ein."; kein Text „Historische Daten".
- [ ] **Step 3: Tests anpassen:** Tab/Nav-Label „Verwaltung"; Tab aktiv auf `/admin/spieler/x`.
- [ ] **Step 4: Run** → FAIL.
- [ ] **Step 5: Implement** Guard, Loader, View, Page; Nav-Labels; „＋"-Link im Spieltag-Tab nur bei Admin-Rolle (`aria-label="Spieltag anlegen"`).
- [ ] **Step 6: Run** die drei Testdateien + Nav-Tests → PASS.
- [ ] **Step 7: Commit** `"Verwaltung als Übersicht"`

### Task 3: Spieltage und Spieltag-Detail

**Files:**
- Create: `src/lib/admin/game-days.ts`, `src/app/admin/spieltage/page.tsx`, `src/app/admin/spieltage/[id]/page.tsx`, `src/app/admin/spieltage/game-days-view.tsx`
- Modify: `src/app/admin/create-game-day-form.tsx` (nach Anlegen Navigation auf `/admin/spieltage/<id>`), `src/app/admin/start-game-day-button.tsx`, `src/app/admin/delete-game-day-button.tsx` (nach Löschen → `/admin/spieltage`), `data-testid`s ergänzen
- Test: `tests/integration/admin-game-days.test.ts`, `tests/components/admin-game-days-view.test.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, Bausteine aus Task 1, `computeGameDaySummary`
- Produces: `listAdminGameDays(groupId: string): Promise<{ open: Array<{ id: string; date: Date; status: "planned" | "in_progress"; confirmed: number; total: number }>; recent: Array<{ id: string; date: Date; winners: string[] }> }>`; `loadPlannedGameDay(groupId: string, id: string): Promise<{ kind: "planned"; id: string; date: Date; roster: RosterRow[] } | { kind: "redirect"; to: string } | null>` (`null` für fremd/unbekannt)

- [ ] **Step 1: Integration-Tests:** `open` sortiert laufend zuerst, dann geplant aufsteigend; `recent` sind die letzten drei beendeten, `winners` = Namen mit Rang 1 (bei Gleichstand beide); `loadPlannedGameDay` → `null` für fremde Gruppe; beendeter Tag → `{ kind: "redirect", to: "/archive/<id>" }`, laufender → `{ kind: "redirect", to: "/game-day" }`; Roster wie bisher `buildRosterRows` (aus `page.tsx` hierher verschieben).
- [ ] **Step 2: Komponententests View:** Knopf „＋ Spieltag anlegen" (`data-testid="create-game-day"`); Abschnitt „Offen" mit „5 / 6 zugesagt" und Pill „Geplant"; laufender Tag verlinkt `/game-day` mit Pill „Läuft"; „Zuletzt gespielt" mit „🥇 Jonas · Mara" und Link `/archive/<id>`; leer: „Noch keine Spieltage gespielt"; unten roter Eintrag „Saison abschließen…" öffnet `CloseSeasonDialog`.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** beide Seiten; Detailseite: Large Title mit Datum, Zurück „Spieltage", Roster, „Starten" als Primärknopf, „Spieltag löschen" als rote Gruppe; `notFound()` bei `null`, `redirect()` bei `kind: "redirect"`.
- [ ] **Step 5: Run** → PASS; bestehende Tests der verschobenen Komponenten grün.
- [ ] **Step 6: Commit** `"Spieltage als eigene Seiten"`

### Task 4: Saison

**Files:**
- Create: `src/app/admin/saison/page.tsx`
- Test: `tests/components/admin-season-view.test.tsx` (View als eigene Komponente `src/app/admin/saison/season-view.tsx`)

**Interfaces:**
- Produces: `SeasonView({ name: string; startDate: Date; finishedCount: number; maxJokers: number })`

- [ ] **Step 1: Tests:** Zeilen Name, „Seit" (dd.mm.yyyy, UTC), „Gespielte Spieltage", „Joker pro Saison" mit Werten; roter Eintrag „Saison abschließen…" öffnet den bestehenden Dialog.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `"Saison-Seite"`

### Task 5: Spieler-Liste und Spieler-Detail

**Files:**
- Create: `src/lib/admin/player-detail.ts`, `src/app/admin/spieler/page.tsx`, `src/app/admin/spieler/players-list.tsx` (Client, Suche), `src/app/admin/spieler/[id]/page.tsx`, `src/app/admin/spieler/[id]/player-detail-view.tsx` (Client, Dialoge), `src/app/admin/spieler/[id]/role-picker.tsx`
- Modify: `src/app/admin/edit-player-dialog.tsx` (Rollenfeld entfernen), Aufrufer nach Löschen → `/admin/spieler`
- Delete: `src/app/admin/players-section.tsx` und sein Test, sobald nichts mehr importiert
- Test: `tests/integration/admin-player-detail.test.ts`, `tests/components/admin-players-list.test.tsx`, `tests/components/admin-player-detail-view.test.tsx`, `tests/components/edit-player-dialog*.test.tsx` anpassen

**Interfaces:**
- Consumes: `listActiveMembers`, `computePlayerSeasonStats`, `PlayerRow`-Felder
- Produces: `loadPlayerDetail(groupId: string, playerId: string): Promise<PlayerDetail | null>` mit `PlayerRow`-Feldern plus `joinedAt: Date`, `seasonGold: number`, `seasonPpg: number | null`

- [ ] **Step 1: Integration-Tests:** `null` für fremde, entfernte, unbekannte IDs; `joinedAt` aus der Mitgliedschaft; `seasonPpg` `null` ohne Spiele.
- [ ] **Step 2: Komponententests Liste:** Abschnitte „Admins" (Owner + Admins, Pills „Besitzer"/„Admin") und „Mitglieder · 4"; Hinweis „E-Mail nicht bestätigt" bei Konten mit Passwort ohne Bestätigung; Suche filtert ohne Groß-/Kleinschreibung; ohne Treffer „Keine Spieler gefunden"; „＋" (`aria-label="Spieler anlegen"`) öffnet `CreatePlayerDialog`; Zeilen verlinken `/admin/spieler/<id>`.
- [ ] **Step 3: Komponententests Detail:** Kopf mit Avatar, Name, „Mitglied seit März 2026"; Zeilen E-Mail, Rolle, „Diese Saison" („6 🥇 · 1.71 PPG" bzw. „Noch keine Spiele"); Owner-Ziel: Rolle „Besitzer" ohne Chevron, kein „Aus der Gruppe entfernen"; Viewer nicht Owner: kein „Besitz übertragen…"; Ziel ohne Passwort: kein „Besitz übertragen…"; „Rolle" öffnet Auswahl Mitglied/Admin und sendet `PATCH /api/players/<id>` mit `{ role }`; „Bearbeiten" öffnet `EditPlayerDialog` ohne Rollenfeld.
- [ ] **Step 4: Run** → FAIL. **Step 5: Implement.** **Step 6: Run** → PASS, inklusive angepasster Dialog-Tests.
- [ ] **Step 7: Commit** `"Spielerverwaltung als Liste mit Detail"`

### Task 6: Einladen und Einstellungen

**Files:**
- Create: `src/app/admin/einladen/page.tsx`, `src/app/admin/einstellungen/page.tsx`, `src/app/admin/einstellungen/settings-view.tsx`, `src/app/admin/einstellungen/transfer-picker.tsx`
- Modify: `src/app/admin/invitations-section.tsx` (Darstellung im Listenstil, „Teilen ⇪" bei vorhandenem `navigator.share`)
- Delete: `src/app/admin/group-section.tsx` und Test, sobald nichts mehr importiert
- Test: `tests/components/invitations-section.test.tsx` erweitern, `tests/components/admin-settings-view.test.tsx`

**Interfaces:**
- Produces: `SettingsView({ isOwner: boolean; groupId: string; name: string; slug: string; maxJokers: number; transferCandidates: Array<{ id: string; name: string }> })`

- [ ] **Step 1: Tests Einladen:** mit `navigator.share` erscheint „Teilen" und ruft `share({ url })`; ohne erscheint es nicht, „Kopieren" bleibt; „Offene Links" listet Notiz, „2× benutzt · bis 04.12." und „Widerrufen"; ohne Links „Keine offenen Links".
- [ ] **Step 2: Tests Einstellungen:** Owner: Name editierbar (bestehende Umbenennen-Logik), „Besitz übertragen…" öffnet Auswahl, danach `TransferOwnerDialog`; „Gruppe löschen" öffnet `DeleteGroupDialog`; Admin ohne Besitz: nur Anzeige von Name, Kennung, Regeln, keine Aktionen; Regeln „Joker pro Saison 2", „Spieler pro Spieltag 4–6" und Fußnote „Regeln sind in Version 1 fest. Anpassbar kommt später."
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `"Einladen und Einstellungen als eigene Seiten"`

### Task 7: Aufräumen, E2E, Screenshots

**Files:**
- Modify: `tests/e2e/lib.mjs` (`adminCreateDay` auf `/admin/spieltage` mit `data-testid`s, Start auf Detailseite), `tests/e2e/foreign-group.mjs` (Willkommen-Check bleibt auf `/admin`)
- Delete: verwaiste Komponenten und Imports (Orphan-Regel), Text „Historische Daten" nirgends mehr im `src/`

- [ ] **Step 1:** `grep -rn "Historische Daten\|players-section\|group-section" src tests` → keine Treffer.
- [ ] **Step 2:** Volle Suite und `tsc` grün.
- [ ] **Step 3:** Lokale Dev-DB seeden (`scripts/seed-initial.ts` mit `INITIAL_ADMIN_PASSWORD`, siehe `docs`), Dev-Server, `node tests/e2e/foreign-group.mjs` grün.
- [ ] **Step 4:** Screenshots per Playwright auf 390×844 von allen acht Routen und 1280×800 von `/admin` in den Workspace-Ordner `shots/` (nicht ins Repo); ein Spieler mit langem Namen ist geseedet.
- [ ] **Step 5: Commit** `"Verwaltung: Aufräumen und E2E"`
