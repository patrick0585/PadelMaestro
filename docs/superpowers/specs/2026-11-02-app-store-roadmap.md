# Padelmaestro im App Store – Vorgehen und Zeitplan

Stand: 2026-11-02. Ersetzt die Grobschätzung vom 2026-09-17.

## Rahmen

- Ziel: öffentliche iOS-App, die jede Padel-Gruppe nutzen kann.
- Zeitbudget: ca. 5 Stunden pro Woche, also etwa zwei Arbeitssitzungen.
- Plattform zum Start: nur iOS. Android-Nutzer weiter über Web/PWA.
- Monetarisierung: zunächst kostenlos. In-App-Kauf, Gewerbe und
  Paid-Apps-Agreement kommen nach dem Launch.
- Bestehende Gruppe läuft durchgehend weiter und wird per Migration
  zur ersten Gruppe im neuen Modell.

## Was sich gegenüber September ändert

1. **Capacitor-Spike ganz nach vorn.** Die größte technische Unbekannte
   ist, ob Cookie-Session, CSRF-Origin-Check und SSE in der WKWebView
   funktionieren. Das lässt sich in ein bis zwei Sitzungen mit einem
   Wegwerf-Projekt gegen die Live-Seite prüfen. Scheitert es, wissen wir
   das, bevor Wochen in die Mandantenfähigkeit fließen.
2. **Konfigurierbare Regeln und Sprachen raus aus dem Launch-Umfang.**
   Beides ist für den Store nicht nötig und kostet zusammen mehr Zeit als
   die ganze native Hülle. Version 1 erscheint auf Deutsch mit den
   heutigen Regeln (Joker 15 Spiele, 2 Joker pro Saison, 4 bis 6 Spieler,
   Satz- bzw. Summe-3-Format) als festen Produktregeln.
3. **Kein Social-Login.** E-Mail plus Passwort reicht. Damit entfällt die
   Pflicht zu „Sign in with Apple“.
4. **CI und Offsite-Backup vor dem Umbau.** Der Mandanten-Umbau berührt
   fast jede Query. Ohne automatische Tests pro PR ist das fahrlässig.
   Sobald fremde Gruppen Daten anlegen, muss ein Backup außerhalb des
   VPS liegen.
5. **Händlerstatus „kein Händler“.** Ohne Bezahlfunktion kann die App in
   der EU als Nicht-Händler eingereicht werden. Gewerbe und Steuerdaten
   verschieben sich in Phase 4.

## Zielarchitektur in Kürze

- `Player` bleibt das globale Konto (E-Mail, Passwort, Avatar).
- Neu: `Group` (Name, Slug, Einstellungen später) und `Membership`
  (Player x Group, Rolle `owner` / `admin` / `member`, Beitrittsdatum).
- `isAdmin` wandert von `Player` in die `Membership`.
- `Season` bekommt `groupId`; Eindeutigkeit des Namens gilt pro Gruppe;
  „aktive Saison“ gilt pro Gruppe.
- `GameDay`, `Match`, `GameDayParticipant`, `JokerUse` erben die Gruppe
  über die Saison, bekommen aber denormalisiert eine `groupId` für
  einfache Filterung. `AuditLog` ebenfalls.
- Session-Token trägt die aktuell gewählte Gruppe. Ein zentraler Helfer
  prüft Mitgliedschaft und Rolle; jede API-Route und jede Seite nutzt ihn.
- Die Migration legt eine Gruppe „Padelmaestro“ an, hängt alle
  bestehenden Daten daran und macht den heutigen Admin zum `owner`.

Offen gelassen für die Phase-1-Spezifikation: Gruppenwechsel in der
UI (vermutlich erst in Phase 2 sichtbar), Umgang mit Spielern, die in
mehreren Gruppen sind, bei Statistiken auf der Profilseite.

## Zeitplan

Rechnung: 5 h/Woche, eine Sitzung ergibt in der Regel einen PR. Zwei
Wochen Puffer für Weihnachten sind eingerechnet. Kalenderangaben sind
Richtwerte.

| Phase | Zeitraum | Ergebnis |
|---|---|---|
| 0 Fundament und Spike | Nov 2026 (3 Wochen) | Dev-Account beantragt, CI läuft, Offsite-Backup aktiv, Wrapper-Spike ausgewertet |
| 1 Mandantenfähigkeit | Dez 2026 bis Jan 2027 (8 Wochen) | Jede Query gruppenbezogen, bestehende Gruppe migriert, Verhalten unverändert |
| 2 Öffentliche Nutzung | Feb bis Mär 2027 (7 Wochen) | Registrierung, Gruppe anlegen, Einladen, Konto löschen, Rechtstexte, Beta mit fremden Gruppen |
| 3 Native App und Review | Apr bis Mai 2027 (6 Wochen plus Review) | Capacitor-App mit Push, TestFlight, Einreichung |
| Live im App Store | voraussichtlich Mai 2027 | |
| 4 Ausbau | ab Juni 2027 | In-App-Kauf, Regeln konfigurierbar, Englisch, Android |

Gesamtaufwand bis Live: etwa 120 bis 130 Stunden.

### Phase 0: Fundament und Spike (3 Wochen, ~12 h)

Patrick, parallel zu allem anderen:
- Apple Developer Program beantragen (99 USD/Jahr, Freischaltung dauert
  Tage). Ohne Account kein TestFlight, kein Push-Zertifikat.

Sitzungen:
- GitHub Actions: Typecheck, Lint, Vitest gegen Postgres-Service-Container.
  Pro PR grün oder rot.
- Offsite-Backup: täglicher `pg_dump` zusätzlich auf einen externen
  Speicher (z. B. Hetzner Storage Box oder S3-kompatibel), Restore einmal
  durchspielen.
- Capacitor-Spike (Wegwerf, außerhalb des Repos): leeres iOS-Projekt,
  das `https://padelmaestro.de` lädt. Auf dem echten iPhone prüfen:
  Login und Session-Cookie, Ergebnis eintragen (CSRF), Live-Updates
  (SSE), Safe-Area und Statusleiste, InstallHint. Ergebnis als kurze
  Notiz, Spike wird gelöscht.
- Kleinkram beim Vorbeigehen: Schema-Default `gamesCredited` 10 auf 15,
  Seed-Namen entfernen, Manifest-Texte neutralisieren.

Ausstiegskriterium: Spike zeigt grün, oder wir kennen die nötige
Anpassung (z. B. Origin-Allowlist um `capacitor://localhost` erweitern).

Ergebnis 2026-11-02: Spike grün, siehe
`2026-11-02-capacitor-spike-findings.md`. Remote-URL-Modus bestätigt.

### Phase 1: Mandantenfähigkeit (8 Wochen, ~40 h)

Eigene Spezifikation zu Beginn der Phase. Grobe PR-Folge:
1. Schema plus Migration: `Group`, `Membership`, `groupId`-Spalten,
   Daten der bestehenden Gruppe umhängen. Erst lokal gegen einen
   Produktions-Dump testen.
2. Session und Autorisierung: Gruppen-Claim im Token, Helfer
   `requireMembership`, Umstellung aller `isAdmin`-Prüfungen
   (32 Dateien, davon 15 API-Routen).
3. Saison und Spieltag: `getOrCreateActiveSeason`, `findFirst` auf
   aktiven Spieltag, Spieltag-Erstellung (heute: alle Spieler),
   Archiv (16 Aufrufstellen).
4. Ranking-SQL und Profil-Statistiken gruppenbezogen.
5. SSE-Endpunkt prüft Mitgliedschaft; Admin-Seite, Spielerverwaltung,
   Passwort-Reset gruppenbezogen.
6. Tests nachziehen; E2E-Lauf mit der migrierten Gruppe.

Ausstiegskriterium: Deploy auf den VPS, die Gruppe merkt nichts.

### Phase 2: Öffentliche Nutzung (7 Wochen, ~35 h)

1. E-Mail-Versand (Resend oder Postmark, Free-Tier reicht):
   Verifizierung, Passwort vergessen.
2. Registrierung und Onboarding: Konto anlegen, Gruppe gründen oder
   per Einladungslink beitreten. Einladungslink mit Ablauf, vom
   Gruppen-Admin erzeugt.
3. Rollen in der Admin-Oberfläche: Mitglieder befördern, entfernen,
   Gruppe übertragen.
4. Konto löschen als Selbstbedienung: harte Anonymisierung inklusive
   AuditLog-Payloads und Avatar. Datenexport als JSON. Beides ist
   Store-Pflicht (Apple-Richtlinie 5.1.1 (v)) und DSGVO-Pflicht.
5. Rechtstexte: Datenschutzerklärung, Impressum, kurze
   Nutzungsbedingungen. Text liefert Patrick, Seiten baue ich.
6. Beta: ein bis zwei fremde Gruppen nutzen die PWA zwei Wochen lang.
   Rückmeldungen fließen in Phase 3 ein.

Ausstiegskriterium: Jemand Fremdes kann ohne Hilfe von Patrick eine
Gruppe gründen, Leute einladen und einen Spieltag durchspielen.

### Phase 3: Native App und Review (6 Wochen plus Review-Schleifen, ~35 h)

1. Capacitor im Repo: iOS-Projekt, App-Icon, Splash-Screen,
   Statusleiste, Safe-Area, InstallHint in der App ausblenden,
   Offline-/Fehlerseite bei fehlendem Netz.
2. Push-Benachrichtigungen (der native Mehrwert gegen Apple-Richtlinie
   4.2): Geräte-Token registrieren (`Device`-Tabelle), Versand über
   APNs mit Token-Auth (.p8-Key), Ereignisse: Spieltag angelegt,
   Erinnerung am Spieltag, Ergebnis eingetragen, Saison geschlossen.
   Einstellungen pro Nutzer.
3. Haptik beim Ergebnis-Eintrag, natives Teilen des Spielplans.
4. TestFlight intern mit der eigenen Gruppe, zwei Wochen laufen lassen.
5. App Store Connect: Screenshots (6,7" und 6,1"), Beschreibung,
   Schlagworte, Datenschutz-Labels, Altersfreigabe, Händlerstatus
   „kein Händler“, Review-Notizen mit Demo-Zugang.
6. Einreichung. Mit ein bis zwei Ablehnungsrunden rechnen; typische
   Gründe: fehlender Demo-Zugang, fehlende Kontolöschung, zu dünner
   nativer Mehrwert.

### Phase 4: Ausbau (nach dem Launch)

Reihenfolge nach Bedarf:
- Gewerbe, Paid-Apps-Agreement, Steuer- und Bankdaten bei Apple,
  Händlerstatus aktualisieren.
- In-App-Kauf via RevenueCat, Freemium-Grenzen (z. B. Gruppen ab
  einer bestimmten Größe oder Saison-Archiv kostenpflichtig).
- Regeln pro Gruppe konfigurierbar (Joker, Format, Spielerzahl).
- Englisch, später Spanisch.
- Android-Build aus demselben Capacitor-Projekt.
- Infrastruktur, falls Last kommt: SSE-Pub/Sub über Postgres NOTIFY,
  Rate-Limiter aus dem Prozess raus, Deploy ohne Downtime, Monitoring.

## Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Apple lehnt als „Web-Wrapper“ ab (4.2) | Review-Schleifen, Wochen Verzug | Push, Haptik, natives Teilen; Review-Notizen begründen den Mehrwert |
| WKWebView bricht Cookie/CSRF/SSE | Architekturwechsel nötig | Spike in Phase 0 klärt das vorab |
| next-auth 5 ist Beta | Breaking Changes beim Update | Version pinnen, Update erst nach Launch |
| Weihnachten und Urlaub | Phase 1 rutscht | Zwei Wochen Puffer eingeplant |
| Fremde Beta-Gruppen fehlen | Phase 2 wird nicht validiert | Früh im Umfeld fragen; notfalls zweite Testgruppe selbst aufsetzen |
| Migration der Live-Daten geht schief | Datenverlust bei der eigenen Gruppe | Migration gegen Produktions-Dump proben, Backup direkt vor dem Deploy |

## Entscheidungen (2026-11-02)

1. Regeln bleiben in Version 1 fest.
2. Start nur auf Deutsch.
3. Fremde Beta-Gruppen für Phase 2 sind vorhanden.
4. Arbeit läuft im bestehenden Repo auf `main`, mit kurzlebigen
   Feature-Branches pro PR wie bisher. Kein Langzeit-Branch, kein
   neues Projekt. Begründung: die Live-Gruppe wird migriert, nicht
   ersetzt; jeder Phase-1-PR ist für sich verhaltensneutral und kann
   sofort deployt werden; Phase-2-Funktionen (Registrierung, Gruppe
   gründen) gehen hinter einem Feature-Flag auf `main`, bis sie
   öffentlich geschaltet werden. Nur der Capacitor-Spike in Phase 0
   liegt außerhalb des Repos und wird verworfen; das echte
   iOS-Projekt kommt in Phase 3 als `ios/` ins Repo.

## Vorgehen pro Phase

Jede Phase startet mit einem kurzen Brainstorming und einer eigenen
Spezifikation unter `docs/superpowers/specs/`, dann Plan, dann PRs in
gewohnter Reihenfolge: Varianten abwägen, lokal zeigen, dann Commit.
