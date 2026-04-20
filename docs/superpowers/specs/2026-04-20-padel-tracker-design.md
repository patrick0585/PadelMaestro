# Padel Tracker – Design Document

**Status**: Design – genehmigt zur Implementierung
**Datum**: 2026-04-20
**Autor**: Patrick (mit Claude Code)

---

## 1. Vision & Überblick

Eine Webapp + Telegram-Bot-Kombination, mit der eine Gruppe von sechs Padel-Spielern ihre wöchentlichen Spielabende komplett digital organisiert: Anwesenheit abstimmen, Paarungen generieren, Ergebnisse live eintragen und eine Saison-Rangliste automatisch pflegen. Ersetzt den bisherigen Prozess (gedruckte Zettel → manuelle XLSX-Pflege).

Die Gruppe spielt jeden Dienstag in Besetzungen von 4, 5 oder 6 Spielern. Für jede Besetzung gibt es ein etabliertes, mathematisch ausgeglichenes Paarungs-Schema. Jeder Spieler hat pro Jahres-Saison maximal zwei „Joker" zum Fehlen ohne Ranking-Nachteil.

## 2. Ziele & Nicht-Ziele

### Muss (MVP)
- Wöchentliche Anwesenheits-Umfrage via Telegram-Bot.
- Automatische, ausgeglichene Paarungs-Generierung für 4/5/6 Spieler.
- Ergebnis-Eingabe via Bot oder Webapp durch jeden Spieler.
- Live-Saison-Ranking mit „Punkte pro Spiel" als Sortierung.
- Joker-Mechanik (max. 2 pro Spieler/Saison).
- Historischer Import der bisherigen 9 Spieltage via Skript.
- Strikte Zugriffskontrolle (nur eingeladene Spieler).

### Soll (nahe Zukunft)
- Historie aller Spieltage durchblätterbar, mit Detail-Ergebnissen.
- Erweiterte Stats: Head-to-Head, Partner-Matrix, Form-Graph, Streaks.
- PWA-Installierbarkeit auf Android + iOS (Homescreen-Icon, offline-fähig für Ergebnis-Eingabe).

### Nicht im Scope (bewusst weggelassen)
- Gäste/externe Spieler (7./8. Mann). Feste Gruppe von sechs.
- Substitutionen mitten im Spieltag. Der Kader ist ab Start fix.
- Gamification/Achievements/Badges. Optional später.
- Mehrere gleichzeitig laufende Spiele auf mehreren Plätzen.
- Native Mobile-Apps (Android-APK, iOS-IPA). PWA reicht.
- Zahlungen, Platzbuchung, Wetter-Integration.

## 3. Nutzer & Rollen

**Spieler (alle sechs)**: können Anwesenheit bestätigen, Joker ziehen, Ergebnisse eintragen, eigene Stats einsehen, Saison-Ranking sehen.

**Admin (initial eine Person)**: alle Spieler-Rechte plus: Spieler einladen/entfernen, Saison starten/beenden, Ergebnisse nachträglich korrigieren, Spieltage zurücksetzen. Flag `isAdmin` im Player-Model.

**Telegram-Bot**: Proxy zur gleichen Backend-API. Keine eigene Identität.

## 4. System-Architektur

### Komponenten

```
┌─────────────────┐        ┌───────────────────────────────────┐
│ Telegram-Client │ HTTPS  │            VPS (Ubuntu)           │
│ (6 Spieler)     │──────▶ │  ┌─────────────────────────────┐  │
└─────────────────┘  Web-  │  │  Caddy (Reverse Proxy, TLS) │  │
                     hook  │  └─────────────────────────────┘  │
┌─────────────────┐        │              │                    │
│ PWA / Webapp    │◀──────▶│              ▼                    │
│ (Browser, PWA   │  SSE + │  ┌─────────────────────────────┐  │
│  auf Handy)     │  HTTPS │  │  Next.js App (Port 3000)    │  │
└─────────────────┘        │  │   ├─ Webapp (React Pages)   │  │
                           │  │   ├─ REST-API (/api/*)      │  │
                           │  │   ├─ Bot-Webhook (/api/...) │  │
                           │  │   └─ SSE-Stream (/api/...)  │  │
                           │  └─────────────────────────────┘  │
                           │              │                    │
                           │              ▼                    │
                           │  ┌─────────────────────────────┐  │
                           │  │  PostgreSQL 16 (Docker)     │  │
                           │  │  LISTEN/NOTIFY → SSE Push   │  │
                           │  └─────────────────────────────┘  │
                           │                                   │
                           │  Cron (node-cron in Next.js):     │
                           │   ├─ Di 09:00 → Attendance-Poll   │
                           │   ├─ Di 18:00 → Reminder Pending  │
                           │   └─ Daily 03:00 → pg_dump Backup │
                           └───────────────────────────────────┘
```

### Tech-Stack

| Schicht | Technologie | Begründung |
|---------|-------------|------------|
| Framework | Next.js 15 (App Router) | Webapp, API-Routes, Bot-Webhook, SSE in einer Codebase |
| Sprache | TypeScript (strict) | Typ-Sicherheit, gemeinsame Types zwischen Frontend/Backend |
| UI | Tailwind CSS + shadcn/ui | Schnelle Entwicklung, modernes Design, accessible |
| PWA | next-pwa | Installierbarkeit, Offline-Cache für statische Assets |
| ORM | Prisma | Typ-sicher, migrations, gute DX |
| Datenbank | PostgreSQL 16 | Solide, LISTEN/NOTIFY für Realtime, jsonb für Audit |
| Auth | NextAuth.js (Credentials Provider) | E-Mail + Passwort + Session-Cookies |
| Telegram | grammY | Moderne, typ-sichere Library, Webhook-Modus |
| Cron | node-cron (in-process) | Kein separater Scheduler nötig |
| Reverse Proxy | Caddy | Auto-HTTPS via Let's Encrypt, trivial Config |
| Deployment | Docker Compose | App + DB + Reverse Proxy als ein Stack |
| Test-Framework | Vitest + Playwright | Unit + Integration + E2E Golden Path |

### Deployment-Modell

Ein einziger Docker-Compose-Stack auf dem Ubuntu-VPS:

- `app`: Next.js-Container (Next.js im Standalone-Output-Modus, Node.js 22 LTS)
- `db`: Postgres-16-Container, Volume auf Host-Filesystem (`/var/lib/padel-tracker/postgres`)
- `caddy`: Caddy-Container mit Caddyfile, Volume für Zertifikate

Keine externe Queue, kein Redis, kein separater Bot-Prozess. Telegram schickt Webhooks direkt an `/api/telegram/webhook`, Next.js verarbeitet sie synchron.

### Realtime-Mechanik

PostgreSQL `LISTEN/NOTIFY` wird durch Trigger auf `Match`, `GameDayParticipant`, `JokerUse` und `GameDay` ausgelöst. Ein SSE-Endpoint in Next.js (`/api/events`) hält offene Verbindungen zu Webapp-Clients und pusht bei jedem `NOTIFY` das relevante Delta. Bei sechs gleichzeitigen Clients praktisch kein Ressourcen-Overhead.

### Backups & Recovery

- `pg_dump` täglich um 03:00 in `/var/lib/padel-tracker/backups/padel-YYYY-MM-DD.sql.gz`
- Lokale Rotation: 7 Tage
- Optional `rsync` off-site (Hetzner Storage Box oder zweiter VPS)
- Runbook in `docs/runbook.md`: Restore-Schritte, Admin-Account-Recovery, Spieltag-Rollback

## 5. Datenmodell

### Entitäten

```
Player                         Season
─────────────                  ─────────────
id            uuid             id            uuid
name          text             year          int      unique
email         text  unique     startDate     date
passwordHash  text             endDate       date
telegramId    bigint nullable  isActive      bool
isAdmin       bool             createdAt     timestamptz
invitedAt     timestamptz
deletedAt     timestamptz
createdAt     timestamptz

GameDay                        JokerUse
─────────────                  ─────────────
id            uuid             id            uuid
seasonId      fk Season        playerId      fk Player
date          date             seasonId      fk Season
playerCount   int  (4|5|6)     gameDayId     fk GameDay
status        enum             ppgAtUse      decimal(5,3)
  (planned,                    gamesCredited int   (=10)
   roster_locked,              pointsCredited decimal(6,2)
   in_progress,                createdAt     timestamptz
   finished)
seed          text (for        unique (playerId, seasonId, gameDayId)
               deterministic
               shuffle)
createdAt     timestamptz

GameDayParticipant             Match
──────────────────             ─────────────
id            uuid             id            uuid
gameDayId     fk GameDay       gameDayId     fk GameDay
playerId      fk Player        matchNumber   int  (1..15)
attendance    enum             team1PlayerA  fk Player
  (pending,                    team1PlayerB  fk Player
   confirmed,                  team2PlayerA  fk Player
   declined,                   team2PlayerB  fk Player
   joker)                      team1Score    int nullable
respondedAt   timestamptz      team2Score    int nullable
unique (gameDayId, playerId)   scoredBy      fk Player nullable
                               scoredAt      timestamptz nullable
                               version       int  (optimistic lock)
                               unique (gameDayId, matchNumber)

Invitation                     AuditLog
─────────────                  ─────────────
id            uuid             id            uuid
email         text             actorId       fk Player
token         text unique      action        text
                               entityType    text
invitedBy     fk Player        entityId      uuid
expiresAt     timestamptz      payload       jsonb
usedAt        timestamptz      createdAt     timestamptz
createdAt     timestamptz
```

### Wesentliche Design-Entscheidungen

**Joker-Snapshot (nicht live-Berechnung)**. `JokerUse.ppgAtUse` friert den Durchschnitt zum Zeitpunkt des Jokers ein. Gründe: deterministisch in Historie, sichtbar während der Saison, korrigierte Ergebnisse verschieben nicht rückwirkend andere Joker-Werte. Falls später live-Berechnung gewünscht: 3-Zeilen-Änderung im Ranking-Query, kein Schema-Wechsel nötig.

**Match-Unique `(gameDayId, matchNumber)`** plus `version`-Spalte ermöglichen Optimistic Locking: erster Write gewinnt, zweiter bekommt Konflikt-Fehler.

**Soft-Delete auf Player** (`deletedAt`). Historische Spieltage behalten ihre Referenzen, aber der Spieler ist aus Ranking und Login raus.

**AuditLog** mit `payload jsonb`: neue Event-Typen erfordern keine Migration, nur einen neuen `action`-String.

**Ranking ist ein SQL-View** (`player_ranking_view`), nicht materialisiert. Bei der Datenmenge (∼500 Matches/Jahr, 6 Spieler) trivial schnell. Änderungen am Ranking-Algorithmus = `ALTER VIEW`, keine Daten-Migration.

**UUIDs** überall statt Integer-IDs: kollisionsfrei beim Import externer Daten oder Merges zwischen Umgebungen.

### Erweiterbarkeit

Alle denkbaren Stats (Siegquote, Head-to-Head, Partner-Chemie, Streaks, Form) lassen sich aus der `Match`-Tabelle per SQL ableiten – keine neue Spalte nötig. Ergänzende Metadaten (Notizen, Fotos, Wetter, Achievements) sind je 1 Migration: `Match.note text`, `GameDay.photoUrl`, `Achievement`-Tabelle usw.

## 6. Paarungs-Algorithmus

### Ansatz: Templates + Shuffle

Für jede Besetzung (4/5/6) wird ein mathematisch geprüftes, balanciertes Template in JSON gespeichert. Der „Algorithmus" ist eine deterministische Zuordnung von echten Spielern zu den Template-Positionen 1…N, mit einem Shuffle-Seed zur wöchentlichen Abwechslung.

### Template 4 Spieler (3 Matches, first-to-6)

Jede der drei möglichen Partner-Kombinationen genau einmal.

```
Match 1: P1+P2  vs  P3+P4
Match 2: P1+P3  vs  P2+P4
Match 3: P1+P4  vs  P2+P3
```

### Template 5 Spieler (15 Matches, max 3)

Exaktes bestehendes Schema der Gruppe, aus dem Zettel übernommen. Eigenschaften:

- Jeder sitzt genau 3× (P_k sitzt in Matches k, k+5, k+10)
- Jede Partnerschaft erscheint exakt 3×
- Jedes Gegenüber erscheint exakt 6×

```
 1: {3,5} vs {2,4}  (sitzt 1)
 2: {4,5} vs {1,3}  (sitzt 2)
 3: {2,5} vs {1,4}  (sitzt 3)
 4: {1,2} vs {3,5}  (sitzt 4)
 5: {1,3} vs {2,4}  (sitzt 5)
 6: {2,5} vs {3,4}  (sitzt 1)
 7: {3,4} vs {1,5}  (sitzt 2)
 8: {4,5} vs {1,2}  (sitzt 3)
 9: {1,5} vs {2,3}  (sitzt 4)
10: {1,4} vs {2,3}  (sitzt 5)
11: {2,3} vs {4,5}  (sitzt 1)
12: {1,4} vs {3,5}  (sitzt 2)
13: {1,5} vs {2,4}  (sitzt 3)
14: {1,3} vs {2,5}  (sitzt 4)
15: {1,2} vs {3,4}  (sitzt 5)
```

### Template 6 Spieler (15 Matches, max 3)

Jede der C(6,2)=15 Paar-Kombinationen genau einmal als Partnerteam. Jeder spielt 10 Matches, sitzt 5. Wird aus einem geprüften Whist-Schema übernommen und im Unit-Test auf Balance verifiziert.

### Shuffle-Logik

```typescript
function assignPlayersToTemplate(
  players: Player[],
  lastGameDay?: GameDay
): MatchPlan[] {
  const template = loadTemplate(players.length)
  const seed = randomSeed()
  let assignment = shuffleWithSeed(players, seed)

  for (let i = 0; i < 5 && conflictsWithLast(assignment, lastGameDay); i++) {
    assignment = shuffleWithSeed(players, newSeed())
  }

  return template.matches.map(m => ({
    matchNumber: m.matchNumber,
    team1: [assignment[m.team1[0]-1], assignment[m.team1[1]-1]],
    team2: [assignment[m.team2[0]-1], assignment[m.team2[1]-1]],
    sitting: (m.sitting ?? []).map(i => assignment[i-1]),
    seed,
  }))
}
```

Der `seed` wird in `GameDay.seed` gespeichert; die Paarung ist damit jederzeit reproduzierbar.

### Edge Cases

- **3 oder 7 Spieler**: Bot antwortet „nicht unterstützt, bitte Kader anpassen"
- **Joker nach Lock**: Paarung wird für Rest-Kader neu generiert
- **Ergebnis-Korrektur durch Admin**: Paarung bleibt, nur Scores ändern sich

## 7. Auth & Zugriffskontrolle

### Einladungs-Flow

1. Admin erstellt Einladung (`POST /api/invitations` mit Name + E-Mail)
2. System generiert Token, speichert `Invitation` mit 7 Tagen Gültigkeit
3. Admin kopiert Link, schickt ihn dem neuen Spieler (außerhalb der App)
4. Spieler öffnet Link, setzt Passwort, Konto wird aktiv (`usedAt` gesetzt)

### Login

E-Mail + Passwort via NextAuth Credentials Provider. Passwörter mit bcrypt (cost 12). Session-Cookie HTTP-only, secure, SameSite=Lax, 30 Tage.

Password-Reset über E-Mail-Link (Resend oder SMTP vom VPS). Rate-Limit: 3 Versuche pro E-Mail/Stunde.

### Telegram-Verknüpfung (optional)

Nach Login kann der Spieler im Profil „Telegram verbinden" klicken. App zeigt Anleitung: Bot schreiben mit `/start <one-time-token>`. Bot verifiziert Token, setzt `Player.telegramId`. Ab dann erkennt der Bot den Spieler.

### Bot-Zugriff

Bot prüft `from.id` jeder eingehenden Nachricht gegen `Player.telegramId`. Unbekannte User erhalten „nicht eingeladen, bitte Admin kontaktieren". Gruppen-Kommandos (`/umfrage`, `/e 3:0`) funktionieren nur wenn Absender in der Whitelist.

### Admin-Rechte

Admin-Endpoints (`DELETE /api/players/:id`, `PATCH /api/matches/:id`, `POST /api/seasons/:id/close`) prüfen `session.user.isAdmin`. Bootstrap: erster eingeladener Spieler wird automatisch Admin; weitere müssen manuell geflagged werden.

## 8. User-Flows

### Flow A – Anwesenheits-Umfrage

1. **Cron Dienstag 09:00**: Bot postet in Gruppe: „Wer kommt heute?" mit Inline-Buttons ✅ / ❌ / 🃏 Joker
2. Spieler klicken, Bot editiert die Message live mit dem aktuellen Stand
3. **18:00**: Bot schickt DM an alle mit Status `pending` („melde dich bitte")
4. Spieltag-Start ist jederzeit manuell möglich, nicht an Uhrzeit gekoppelt

### Flow B – Spieltag-Start

1. Beliebiger Spieler oder Admin triggert über Bot `/start` oder Webapp „Spieltag starten"
2. App validiert: 4, 5 oder 6 `confirmed`? → sonst Blocker-Message
3. Status `roster_locked`. Paarungen werden generiert und gespeichert
4. Bot postet: „🎾 Spieltag gestartet. N Spieler, M Matches. [Link]"
5. Webapp zeigt Match-Liste, oberstes Match groß, nächste zwei als Vorschau

### Flow C – Ergebnis-Eingabe

**Via Bot**: `/e 3:0` in Gruppe oder DM. Bot nimmt das niedrigste Match ohne Score, trägt ein, bestätigt mit dem Team-Kontext.

**Via Webapp**: Tap auf Match-Karte, Dialog mit Quick-Buttons (3:0, 2:1, 1:2, 0:3) oder Zahleneingabe bei 4er-Format.

**Konflikt-Handling (First-Write-Wins + Undo)**: Zweiter Write auf dasselbe Match wird abgelehnt. Erster Eintrag kann 2 Minuten lang vom Ersteller per „↶ Rückgängig" widerrufen werden. Danach nur Admin.

**Realtime**: Eintrag → DB-Trigger → `NOTIFY match_updated` → SSE pusht an alle offenen Clients + Bot editiert seine Gruppen-Message mit dem neuen Stand.

### Flow D – Joker ziehen

1. Spieler klickt Button (Bot oder Webapp) vor Spieltag-Lock
2. App prüft `jokersRemaining >= 1` (max. 2 pro Saison genutzt)
3. Bestätigungs-Dialog mit aktuellem ppg und gutgeschriebenen Punkten (ppg × 10)
4. `GameDayParticipant.attendance = 'joker'`, `JokerUse` mit Snapshot
5. Bot postet in Gruppe: „🃏 Rene hat seinen 2./letzten Joker gezogen"
6. Spieler zählt nicht mehr für Kader-Größe

### Flow E – Stats-Ansicht

Webapp-Tabs:
- **Ranking**: aktuelle Saison-Tabelle, sortiert nach ppg
- **Spieltage**: Liste, pro Spieltag aufklappbar mit allen Match-Ergebnissen
- **Head-to-Head**: Matrix Spieler × Spieler (Partner-Chemie oder Gegner-Bilanz toggleable)
- **Profil**: eigene Form-Kurve, beste/schlechteste Partner, Streaks
- **Archiv**: Tabellen vergangener Saisons

### Flow F – Admin

- Spieler einladen: Name + E-Mail → Einladungslink
- Ergebnis korrigieren: Match öffnen, editieren, AuditLog-Eintrag
- Saison-Übergang: „Saison 2026 beenden" + „Saison 2027 starten"
- Spieler entfernen: Soft-Delete, historische Daten bleiben

## 9. Error Handling & Edge Cases

### Anwesenheit / Spieltag-Start

| Fall | Verhalten |
|------|-----------|
| Keiner antwortet | 18:00-Reminder. Keine Auto-Absage. |
| Nur 3 confirmed | Start blockiert mit Fehlermeldung |
| 7+ confirmed | Start blockiert: „Max. 6. Bitte jemand streichen oder Joker." |
| Spieltag falsch gestartet | Admin kann zurücksetzen, solange kein Match Score hat |
| Cron läuft doppelt | Idempotenz-Key `poll:YYYY-MM-DD` |

### Ergebnis-Eingabe

| Fall | Verhalten |
|------|-----------|
| Gleichzeitige Writes | Optimistic Lock (`version` column) → zweiter bekommt 409-Konflikt mit aktuellem Score |
| Ungültige Score (z. B. 3:2 bei max-3) | Validation rejected mit erklärender Message |
| 6:6 bei first-to-6 | Rejected: „Einer muss 6 erreichen" |
| Offline | PWA-IndexedDB-Queue → sync beim Reconnect |
| Out-of-order Eintrag | Erlaubt; UI markiert fehlende früher |

### Joker

| Fall | Verhalten |
|------|-----------|
| Joker nach Lock | Nicht mehr möglich; Admin-only |
| Joker ohne Vorspiele (ppg=0) | Warnung: „ppg=0, Joker bringt 0. Fortfahren?" |
| 3. Joker | Button disabled, Fehler „max. 2 pro Saison" |

### Auth

| Fall | Verhalten |
|------|-----------|
| Link abgelaufen | „Bitte Admin um neue Einladung" |
| Spieler entfernt | Soft-Delete, Login blockiert, Matches bleiben |
| Telegram ohne Link | Bot antwortet „nicht verknüpft, Webapp → Profil" |
| Admin verloren | Manuell via `psql` (Runbook dokumentiert) |

### Daten-Integrität

- Alle kritischen Writes in Transaktionen
- Soft-Delete statt Hard-Delete für alle user-facing Entitäten
- Saisonwechsel blockiert, solange ein Spieltag nicht `finished` ist
- Historischer Import nutzt `ON CONFLICT DO NOTHING`, loggt Konflikte

## 10. Testing-Strategie

### Unit (Vitest)

- Paarungs-Templates: Balance-Eigenschaften (jeder sitzt N×, jede Partnerschaft N×, jede Gegnerschaft N×) für 4/5/6
- Shuffle: deterministisch mit gleichem Seed
- Score-Validation für beide Formate (max-3, first-to-6)
- Ranking-Query: leer, 1 Match, mit Joker, mit Soft-Delete
- Joker-Snapshot: ppg bleibt stabil nach späteren Matches

### Integration (Vitest + testcontainers-postgres)

- Einladung → Login → Session vollständig
- Spieltag-Lifecycle: planned → locked → in_progress → finished
- Concurrent Writes auf selbem Match (4 parallele Requests, nur 1 gewinnt)
- Telegram-Webhook-Payloads werden korrekt dispatched
- LISTEN/NOTIFY → SSE-Event wird an Subscriber geliefert

### E2E (Playwright, nur Golden Path)

- Ein kompletter Spieltag: Login → Anwesenheit → Start → 5 Ergebnisse → Ranking-Änderung sichtbar
- Joker-Flow inkl. Ranking-Auswirkung

### Manuell / Smoke

- Telegram-Bot gegen echten Test-Token
- PWA-Install auf Android + iPhone, Lighthouse-PWA-Audit
- Backup-Restore einmal pro Monat (Runbook)

### CI

GitHub Actions oder self-hosted Runner:
- `pnpm lint` (ESLint + TypeScript strict)
- `pnpm test` (Unit + Integration)
- `pnpm build` (Next.js muss durchlaufen)
- Deploy-Hook bei Push auf `main`: VPS pullt Images + `docker compose up -d`

## 11. Offene Design-Entscheidungen

Keine Blocker, aber folgende Punkte können während der Implementierung feinjustiert werden:

1. **Joker-Snapshot vs. live**: Default ist Snapshot. Falls gewünscht, Toggle im Admin-Panel später nachrüstbar.
2. **Bot-Notifications bei Ergebnis-Eintrag**: edit-in-place einer zentralen Gruppen-Message vs. neue Message pro Match. Default: in-place, um Gruppe nicht zu spammen.
3. **Tie-Break im Ranking bei gleichem ppg**: nach `Punkte Ges.` absteigend → danach `Anzahl Spiele` aufsteigend (weniger Spiele = besser, weil effizienter). Konfigurierbar.
4. **Saison-Start-Datum**: fix 01.01. oder erster Spieltag im Januar? Default: erster Spieltag, Admin kann überschreiben.

## 12. Technische Einschränkungen

- **Node.js Version**: 22 LTS (für Next.js 15)
- **Postgres Version**: 16+ (für Performance mit `LISTEN/NOTIFY`)
- **Browser-Support**: aktuelle Evergreen-Browser (Chrome, Safari, Firefox, Edge). IE11 nicht unterstützt.
- **Telegram-Bot**: benötigt öffentliche HTTPS-URL für Webhook → Domain + TLS-Zertifikat (Caddy regelt das)
- **VPS-Mindestanforderung**: 1 vCPU, 2 GB RAM, 10 GB Disk reichen für 6 User vollständig aus

## 13. Milestones (grob)

Die genaue Task-Aufteilung kommt in einem separaten Implementation Plan:

1. Projekt-Setup: Next.js, Prisma, Docker Compose, Caddy (lokal lauffähig)
2. Auth-Flow: Einladung → Passwort → Session
3. Datenmodell + Prisma-Migrationen
4. Paarungs-Algorithmus + Templates (4/5/6) + Tests
5. Spieltag-Lifecycle + Match-Eingabe via API
6. Webapp-UI: Ranking, Spieltag-Ansicht, Match-Eingabe
7. Telegram-Bot: Webhook, Umfrage, Ergebnis-Eingabe, Linking
8. Joker-Mechanik + Ranking-View
9. SSE/LISTEN/NOTIFY Realtime
10. Cron-Jobs: Umfrage, Reminder, Backup
11. Historischer Import-Skript (Spieltage 1-9)
12. PWA-Manifest + Installability
13. Deployment auf VPS + Monitoring
14. Extended Stats (Head-to-Head, Partner-Matrix, Profil)

## 14. Anhang: Template-Dateiformat

```json
{
  "playerCount": 5,
  "format": "first-to-3",
  "totalMatches": 15,
  "matches": [
    { "matchNumber": 1,  "team1": [3,5], "team2": [2,4], "sitting": [1] },
    { "matchNumber": 2,  "team1": [4,5], "team2": [1,3], "sitting": [2] },
    { "matchNumber": 3,  "team1": [2,5], "team2": [1,4], "sitting": [3] },
    { "matchNumber": 4,  "team1": [1,2], "team2": [3,5], "sitting": [4] },
    { "matchNumber": 5,  "team1": [1,3], "team2": [2,4], "sitting": [5] },
    { "matchNumber": 6,  "team1": [2,5], "team2": [3,4], "sitting": [1] },
    { "matchNumber": 7,  "team1": [3,4], "team2": [1,5], "sitting": [2] },
    { "matchNumber": 8,  "team1": [4,5], "team2": [1,2], "sitting": [3] },
    { "matchNumber": 9,  "team1": [1,5], "team2": [2,3], "sitting": [4] },
    { "matchNumber": 10, "team1": [1,4], "team2": [2,3], "sitting": [5] },
    { "matchNumber": 11, "team1": [2,3], "team2": [4,5], "sitting": [1] },
    { "matchNumber": 12, "team1": [1,4], "team2": [3,5], "sitting": [2] },
    { "matchNumber": 13, "team1": [1,5], "team2": [2,4], "sitting": [3] },
    { "matchNumber": 14, "team1": [1,3], "team2": [2,5], "sitting": [4] },
    { "matchNumber": 15, "team1": [1,2], "team2": [3,4], "sitting": [5] }
  ]
}
```

Die Templates für 4 und 6 Spieler folgen demselben Schema und werden während der Implementierung erstellt und in Unit-Tests auf Balance-Eigenschaften geprüft.
