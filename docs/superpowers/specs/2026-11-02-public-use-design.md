# Öffentliche Nutzung (Phase 2) – Design

Stand: 2026-11-02. Teil der App-Store-Roadmap
(`2026-11-02-app-store-roadmap.md`, Phase 2). Baut auf der
Mandantenfähigkeit aus Phase 1 auf (`2026-11-02-multi-tenancy-design.md`,
alle sechs PRs deployt am 2026-11-02).

## Absicht

Bis jetzt legt Patrick jedes Konto von Hand an. Phase 2 macht
Padelmaestro für fremde Gruppen benutzbar: Jemand bekommt einen Link,
registriert sich, gründet eine Gruppe, lädt seine Leute ein, und die
Gruppe spielt einen Spieltag durch, ohne dass Patrick eingreift.
Dazu kommen die Pflichten, die ein öffentliches Konto mit sich bringt:
E-Mail-Verifizierung, Passwort vergessen, Konto löschen, Datenexport,
Rechtstexte. Am Ende der Phase nutzen ein bis zwei fremde Gruppen die
PWA zwei Wochen lang als Beta.

## Ziele

- Registrierung und Gruppengründung über Einladungslinks, ohne Patrick.
- Mitglieder einladen, Rollen vergeben, Besitz übertragen, Gruppe
  löschen: alles in der App, vom Gruppen-Admin bzw. Besitzer.
- E-Mail-Versand für Verifizierung und Passwort-Reset. Die sechs
  bestehenden Konten bekommen einen Weg zu echten Adressen.
- Konto löschen und Daten exportieren als Selbstbedienung (Apple
  5.1.1 (v), DSGVO).
- Impressum, Datenschutz, Nutzungsbedingungen öffentlich erreichbar.
- Jeder PR ist für sich deploybar. Die Live-Gruppe merkt bis auf neue
  Menüpunkte nichts.

## Nicht-Ziele (Phase 3 oder später)

- Freie Registrierung ohne Einladungslink. Der Code dafür entsteht
  mit, bleibt aber hinter einem Flag aus (siehe Flags).
- Mit Apple anmelden, Push, native Hülle.
- Einstellungen pro Gruppe (Regeln bleiben fest), Mehrsprachigkeit.
- Plattform-Admin-Oberfläche (Gruppen auflisten, sperren). Patrick
  arbeitet weiter mit Skripten auf dem VPS.
- Mitglieder per E-Mail einladen (Versand der Einladung). In Phase 2
  wird der Link kopiert und selbst verschickt (WhatsApp).

## Anti-Ziele

- Spam-Konten oder Gruppen von Unbekannten. Deshalb Registrierung nur
  über Links, die ein Admin oder Patrick erzeugt hat.
- Sperre für bestehende Logins. Verifizierung ist nie Voraussetzung
  zum Einloggen.
- Datenverlust bei der Kontolöschung über die eigene Person hinaus:
  Matches, Ränge und Joker der anderen bleiben vollständig.
- Ein Admin, der das Besitzerkonto übernimmt (Grenze aus Phase 1
  bleibt).

## Entscheidungen (Patrick, 2026-11-02)

1. Registrierung nur mit Einladungslink. Patrick erzeugt für jede
   Beta-Gruppe einen Gründer-Link; Gruppen-Admins erzeugen
   Mitglieder-Links. Freie Registrierung kommt mit Phase 3 per Flag.
2. Mail-Versand über Resend (Free-Tier), Absender
   `noreply@padelmaestro.de`. Patrick legt das Konto an und setzt die
   DNS-Einträge; die exakten Einträge liefert der erste PR.
3. Bestehende Mitglieder hinterlegen ihre echte Adresse selbst im
   Profil und bestätigen sie per Mail. Ein Hinweis nach dem Login
   erinnert daran, Login bleibt immer möglich.
4. Kontolöschung eines Besitzers wird abgelehnt, solange er eine Gruppe
   besitzt: erst Besitz übertragen oder Gruppe löschen. Gruppe löschen
   wird in Phase 2 für den Besitzer möglich.

## Begriffe

- **Gründer-Link**: Einladung ohne Gruppe. Wer ihn öffnet, legt ein
  Konto an und direkt danach eine Gruppe, deren Besitzer er wird.
  Erzeugt Patrick per Skript auf dem VPS.
- **Mitglieder-Link**: Einladung in eine bestimmte Gruppe. Erzeugt ein
  Admin oder Besitzer dieser Gruppe in der Admin-Seite.
- **Bestätigte Adresse**: `Player.emailVerifiedAt` gesetzt. Nur
  bestätigte Adressen erhalten Passwort-Reset-Mails.
- **Platzhalter-Adresse**: die sechs migrierten Konten tragen
  `…@padel.local`. Sie gelten als unbestätigt und können keine Mail
  empfangen.

## Datenmodell

Neu:

```
enum InvitationKind { founder member }

model Invitation {
  id          String         @id @default(uuid())
  kind        InvitationKind
  groupId     String?                     // null bei founder
  tokenHash   String         @unique      // sha256 des Tokens
  createdById String?                     // null bei Skript-Erzeugung
  note        String?                     // z. B. "Gruppe Wien"
  expiresAt   DateTime
  revokedAt   DateTime?
  maxUses     Int            @default(1)  // founder: 1, member: 25
  usedCount   Int            @default(0)
  createdAt   DateTime       @default(now())
  group       Group?         @relation(...)
  createdBy   Player?        @relation(...)
  uses        InvitationUse[]
}

model InvitationUse {                     // wer ist über welchen Link gekommen
  id           String     @id @default(uuid())
  invitationId String
  playerId     String
  usedAt       DateTime   @default(now())
  foundedGroupId String?                  // nur founder: die damit gegründete Gruppe
  @@unique([invitationId, playerId])
}

enum EmailTokenPurpose { verify_email password_reset }

model EmailToken {
  id        String            @id @default(uuid())
  playerId  String
  purpose   EmailTokenPurpose
  tokenHash String            @unique
  email     String                         // Zieladresse zum Zeitpunkt der Erzeugung
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime          @default(now())
  @@index([playerId, purpose])
}
```

Geändert an `Player`:

- `emailVerifiedAt DateTime?` – Migration lässt es für alle Konten
  leer (alle tragen Platzhalter).
- `pendingEmail String?` – neue Adresse, die noch bestätigt werden muss.
  `email` wechselt erst nach der Bestätigung; so bleibt der Login mit
  der alten Adresse bis dahin möglich.
- `activeGroupId String?` – vom Nutzer gewählte Gruppe (Gruppenwechsel).
- `termsAcceptedAt DateTime?` – gesetzt bei Registrierung über die
  App. Migrierte Konten: leer, keine nachträgliche Zustimmung nötig
  (meine Wahl; bei Bedarf später ein einmaliger Hinweis).
- E-Mail-Adressen werden beim Schreiben und beim Login-Lookup auf
  Kleinschreibung normalisiert. Migration: `lower(email)` auf
  bestehende Zeilen (alle bereits klein).

`Group` bekommt `deletedAt`? Nein: Gruppe löschen ist ein hartes Löschen
(siehe unten), kein Feld nötig.

`Player.invitedAt` bleibt unangetastet (Beitrittsdatum der
Mitgliedschaft deckt den Zweck ab).

Alle Tokens (Einladung, Verifizierung, Reset) sind 32 zufällige Bytes,
base64url in der URL, in der DB nur als SHA-256-Hash. Laufzeiten:
Gründer-Link 30 Tage, Mitglieder-Link 14 Tage, Verifizierung 24 Stunden,
Reset 1 Stunde. Verifizierungs- und Reset-Tokens sind einmalig; eine
neue Anforderung entwertet ältere offene Tokens desselben Zwecks.

## Mail

- Paket `resend`. Schnittstelle `src/lib/mail/send.ts` mit
  `sendMail({ to, subject, text, html })`, dahinter ein Transport:
  `resend` (Produktion), `console` (lokale Entwicklung, loggt die Mail
  inklusive Link), `memory` (Tests, sammelt Mails zum Prüfen).
  Auswahl über `MAIL_TRANSPORT`; ohne Variable `console`. In
  Produktion muss die Variable gesetzt sein, `memory` wird abgelehnt
  (Startprüfung wie bei `AUTH_SECRET`); `console` ist erlaubt und
  schreibt beim Start eine Warnung ins Journal, damit PR 1 vor der
  DNS-Einrichtung deploybar bleibt.
- Env: `RESEND_API_KEY`, `MAIL_FROM` (Standard
  `Padelmaestro <noreply@padelmaestro.de>`), `APP_URL` für Links (fällt
  auf `AUTH_URL` zurück).
- DNS bei IONOS (Patrick): Resend verifiziert die Domain über eine
  Subdomain für den Rückweg (z. B. `send.padelmaestro.de`, MX plus
  SPF-TXT) und einen DKIM-TXT-Eintrag `resend._domainkey`. Die
  bestehenden MX- und SPF-Einträge für das IONOS-Postfach bleiben
  unverändert. Die genauen Werte zeigt Resend nach dem Anlegen der
  Domain; der erste PR enthält eine Checkliste in `docs/DEPLOYMENT.md`.
- Drei Mails, Deutsch, Text plus schlichtes HTML, ohne Tracking:
  Adresse bestätigen, Passwort zurücksetzen, Adresse geändert (Hinweis
  an die alte Adresse, nur wenn sie bestätigt war).
- Fehler beim Versand: Logeintrag, Nutzer sieht „Mail konnte nicht
  gesendet werden, bitte später erneut versuchen". Keine stille
  Erfolgsmeldung.

## Abläufe

### Registrierung über einen Link

`/einladung/<token>` ist öffentlich.

1. Seite prüft den Token: unbekannt, abgelaufen, widerrufen oder
   aufgebraucht → Erklärung, kein Formular.
2. Angemeldeter Nutzer bei Mitglieder-Link: Button „Gruppe X
   beitreten". Beitritt legt die Mitgliedschaft an oder reaktiviert
   eine entfernte (`removedAt = null`, Rolle `member`, `joinedAt`
   neu) und trägt die Person wie `createPlayer` in alle geplanten
   Spieltage der Gruppe ein. Danach ist X die aktive Gruppe. Bereits
   aktives Mitglied: Hinweis, Link zum Dashboard.
   Angemeldeter Nutzer bei Gründer-Link: Button „Gruppe gründen";
   schreibt die `InvitationUse` für das bestehende Konto und führt zu
   `/gruppe/neu`. Kein zweites Konto nötig (ein Konto pro Person).
3. Nicht angemeldet: Formular Name, E-Mail, Passwort (mindestens 8,
   höchstens 72 Zeichen), Pflicht-Checkbox „Ich akzeptiere die
   Nutzungsbedingungen und habe die Datenschutzerklärung gelesen",
   darunter „Schon ein Konto? Anmelden" (Login mit Rücksprung auf den
   Link).
4. Absenden: Konto anlegen, `termsAcceptedAt` setzen, bei
   Mitglieder-Link Mitgliedschaft anlegen (plus Eintrag in geplante
   Spieltage wie in Schritt 2), `InvitationUse` schreiben,
   `usedCount` erhöhen (in einer Transaktion; `maxUses` wird in der
   Transaktion geprüft). Verifizierungsmail senden. Nutzer wird
   eingeloggt und landet auf dem Dashboard (Mitglied) bzw. auf
   „Gruppe gründen" (Gründer).
5. E-Mail bereits vergeben: Meldung „Zu dieser Adresse gibt es schon ein
   Konto, bitte anmelden". Kein Hinweis, ob die Adresse zu einer
   anderen Gruppe gehört.

Rate-Limits: Token-Prüfung 30/min pro IP, Registrierung 5/h pro IP.

### Gruppe gründen

`/gruppe/neu`: erreichbar, wenn das Konto eine `InvitationUse` auf
einer Gründer-Einladung mit leerem `foundedGroupId` hat (serverseitig
geprüft, kein Session-Merker), oder, mit Flag `PUBLIC_SIGNUP=true`, für
jedes Konto. Ein Gründer-Link berechtigt zu genau einer Gruppe; beim
Anlegen wird `foundedGroupId` gesetzt. Wer später eine zweite Gruppe
will, braucht einen neuen Gründer-Link. Formular: Gruppenname (2–40
Zeichen). Slug wird aus dem Namen abgeleitet, bei Kollision mit
Zahlensuffix. Anlegen: `Group`, Mitgliedschaft `owner`, erste Saison
über `getOrCreateActiveSeason`, Audit `group.create`. Danach aktive
Gruppe, Weiterleitung auf die Admin-Seite mit Hinweis „Lade jetzt
deine Mitspieler ein".

### Mitglieder-Links in der Admin-Seite

Neuer Abschnitt „Einladen" auf `/admin`: Button „Einladungslink
erstellen" (Laufzeit 14 Tage, 25 Verwendungen, optionale Notiz), Liste
der offenen Links mit Ablauf, Verwendungen, „Kopieren" und
„Widerrufen", aufgeklappt die Namen der Beigetretenen. Abgelaufene und
widerrufene Links verschwinden aus der Liste. Audit
`invitation.create`, `invitation.revoke`. Der bestehende Dialog
„Spieler anlegen" (Admin setzt Passwort) bleibt für Leute ohne eigene
Mail.

### Gründer-Links

Skript `pnpm invite:founder --note "Gruppe Wien"` auf dem VPS (Muster
wie `tenancy:set-owner`): legt eine Gründer-Einladung an, druckt den
Link. `--list` zeigt offene Gründer-Links, `--revoke <id>` widerruft.
Kein UI in Phase 2.

### Rollen, Besitz, Gruppe

Admin-Seite, Abschnitt Spieler:

- Der `isAdmin`-Haken im Bearbeiten-Dialog wird zur Auswahl
  „Mitglied / Admin" (Besitzer: nur Anzeige „Besitzer"). API: `PATCH
  /api/players/[id]` nimmt `role: "member" | "admin"` zusätzlich zum
  bisherigen `isAdmin` an (Übergang; `isAdmin` fliegt in Phase 3).
  Regeln aus Phase 1 bleiben (Besitzer nicht herabstufbar, letzter
  Admin geschützt).
- Nur Besitzer: „Besitz übertragen" an ein aktives Mitglied, Dialog mit
  Bestätigung. Der bisherige Besitzer wird Admin (wie
  `setGroupOwner`). Audit `group.transfer_owner`.
- Nur Besitzer: Abschnitt „Gruppe" mit Umbenennen und „Gruppe löschen".
  Löschen verlangt die Eingabe des Gruppennamens und das eigene
  Passwort. Hartes Löschen in einer Transaktion in FK-Reihenfolge:
  JokerUse, Match, GameDayParticipant, GameDay, Season, InvitationUse,
  Invitation, Membership, AuditLog der Gruppe, Group. Konten der
  Mitglieder bleiben; wer danach keine Gruppe mehr hat, sieht den
  Leerzustand. Audit vorab global (ohne `groupId`) `group.delete` mit
  Name, Mitglieder- und Spieltagzahl, damit die Löschung nachvollziehbar
  bleibt.
- Jedes Mitglied (nicht Besitzer): „Gruppe verlassen" im Profil, gleiche
  Regeln wie „Spieler entfernen" (letzter Admin, aktive Teilnahme).

### Gruppenwechsel

- `Player.activeGroupId` ersetzt „neueste Mitgliedschaft gewinnt".
  Token-Refresh nimmt `activeGroupId`, wenn dort eine aktive
  Mitgliedschaft besteht, sonst die neueste, sonst null. Beitritt und
  Gründung setzen `activeGroupId`.
- Bei mehr als einer aktiven Mitgliedschaft zeigt die Navigation einen
  Gruppenwechsler (Name der aktiven Gruppe, aufklappbar). Wechsel:
  `PATCH /api/profile/active-group`, dann `router.refresh()`; der
  JWT-Callback liest beim nächsten Request die neue Gruppe. Bei einer
  Mitgliedschaft steht nur der Gruppenname in der Navigation.
- Offene SSE-Verbindungen des Spieltags gehören zur alten Gruppe; die
  Seite lädt nach dem Wechsel neu, das genügt.

### E-Mail-Adresse und Verifizierung

- Profil: Feld „E-Mail-Adresse" mit „Ändern". Neue Adresse wird in
  `pendingEmail` gespeichert, Mail mit Bestätigungslink an die neue
  Adresse, Hinweis an die alte (falls bestätigt). Link
  `/email-bestaetigen/<token>` (öffentlich, funktioniert auch ohne
  Login): setzt `email = pendingEmail`, `pendingEmail = null`,
  `emailVerifiedAt = now()`, Audit `player.email_change`. Kollision mit
  bestehender Adresse wird beim Anfordern und beim Bestätigen geprüft
  (409 `email_taken`).
- Erstbestätigung nach Registrierung nutzt denselben Link, nur ohne
  Adresswechsel.
- Hinweisbanner (Dashboard und Profil) solange `emailVerifiedAt` leer:
  Platzhalter-Adresse → „Hinterlege deine E-Mail-Adresse, damit du dein
  Passwort zurücksetzen kannst"; sonst → „Bitte bestätige deine
  Adresse" mit „Mail erneut senden" (Rate-Limit 3/h pro Konto).
  Schließbar für die Sitzung, kommt beim nächsten Login wieder.
- Admin-Seite: unbestätigte Adressen werden in der Spielerliste mit
  einem kleinen Marker gezeigt, damit Admins nachhaken können. Der
  Admin kann die Adresse weiterhin wie heute ändern; das setzt
  `emailVerifiedAt` zurück.

### Passwort vergessen

- Login-Seite: Link „Passwort vergessen?" → `/passwort-vergessen`,
  Feld E-Mail. Antwort immer „Wenn ein Konto mit bestätigter Adresse
  existiert, haben wir eine Mail geschickt". Mail nur, wenn das Konto
  existiert, nicht gelöscht ist und die Adresse bestätigt ist.
  Rate-Limit 3/h pro Adresse, 10/h pro IP.
- `/passwort-zuruecksetzen/<token>`: neues Passwort zweimal. Setzt
  `passwordHash`, entwertet den Token, Audit `player.password_reset`
  mit Actor = Nutzer selbst. Bestehende Sessions bleiben gültig (JWT,
  kein Sitzungsspeicher); meine Wahl, Phase 3 kann eine
  `passwordChangedAt`-Prüfung nachziehen.
- Konten mit Platzhalter-Adresse bleiben auf den Admin-Reset
  angewiesen (bestehender Dialog).

### Konto löschen und Datenexport

Profil, Abschnitt „Konto":

- „Daten exportieren": `GET /api/profile/export` liefert JSON zum
  Download (`padelmaestro-export-<datum>.json`): Konto (Name, E-Mail,
  Username, Erstellungsdatum), Mitgliedschaften (Gruppe, Rolle,
  Zeitraum), Teilnahmen, Matches mit Ergebnis und Mitspieler-Namen,
  Joker, Audit-Einträge, bei denen der Nutzer Actor ist. Avatar als
  Base64. Rate-Limit 5/h. Audit `account.export`.
- „Konto löschen": Dialog mit Erklärung, Passwort-Eingabe, Bestätigung.
  Abgelehnt mit 409 `owner_of_group` (Liste der Gruppen), solange der
  Nutzer irgendwo Besitzer ist. Sonst in einer Transaktion:
  - alle aktiven Mitgliedschaften beenden (`removedAt`);
  - Teilnahmen an geplanten Spieltagen löschen; laufende und
    beendete Spieltage behalten Teilnahme und Matches;
  - Player anonymisieren: `name = "Gelöschter Spieler"`, `email =
    "geloescht-<id>@anonym.invalid"`, `username = null`, `passwordHash
    = null`, `pendingEmail = null`, Avatar-Felder leer, `telegramId =
    null`, `activeGroupId = null`, `deletedAt = now()`;
  - offene `EmailToken` und `InvitationUse`-Bezug bleiben unschädlich
    (Tokens löschen, Uses bleiben für die Zählung);
  - `AuditLog`-Zeilen mit `entityType = "player"` und `entityId` =
    diese Person: `payload` durch `{ "anonymised": true }` ersetzen
    (dort stehen Name und E-Mail). Zeilen, in denen die Person Actor
    ist, bleiben; sie enthalten keine personenbezogenen Daten außer
    der ID;
  - Audit `account.delete` ohne Payload.
  - Danach Logout; der Token-Refresh wirft gelöschte Konten ohnehin
    raus. Die Adresse ist wieder frei für eine neue Registrierung.
- Darstellung: Ranglisten und Archive zeigen anonymisierte Spieler
  wie bisher entfernte Mitglieder (ausgeblendet in Saisonlisten,
  „Gelöschter Spieler" im Archiv-Podium und in Match-Zeilen). Das
  Avatar-Bild fällt auf die Initialen-Variante zurück, bei
  „Gelöschter Spieler" also „GS"; akzeptiert.

### Rechtstexte und öffentliche Seiten

- `/impressum`, `/datenschutz`, `/nutzungsbedingungen`: statische
  Seiten ohne Login, Inhalt als MDX oder einfache TSX-Blöcke unter
  `src/content/legal/`. Patrick liefert die Texte; bis dahin stehen
  deutlich markierte Platzhalter drin, und die Seiten gehen nicht vor
  dem Beta-Start live (Flag siehe unten, oder der PR wartet).
- Links: Fußzeile auf Login, Registrierung, Passwort-Seiten und im
  Profil. In der App-Navigation kein eigener Punkt.
- Für die Datenschutzerklärung braucht der Text: Hosting auf einem
  IONOS-VPS in Deutschland, Mailversand über Resend (USA, EU-Region
  wählen, falls verfügbar), gespeicherte Daten (Konto, Spielergebnisse,
  Audit-Log), Cookies nur Session, keine Analyse-Tools, Löschung über
  das Profil. Ich liefere Patrick diese Stichpunkte als Grundlage.

### Middleware, CSRF, Rate-Limits

- Öffentliche Pfade ergänzen (keine Umleitung, die Seiten prüfen selbst):
  `/einladung`, `/passwort-vergessen`, `/passwort-zuruecksetzen`,
  `/email-bestaetigen`, `/impressum`, `/datenschutz`,
  `/nutzungsbedingungen`. Die Login-Seite leitet Angemeldete weiter wie
  heute.
- Neue API-Routen ohne Session: `POST /api/signup` (Link einlösen),
  `GET /api/invitations/<token>` (Vorschau), `POST
  /api/password-reset/request`, `POST /api/password-reset/confirm`,
  `POST /api/email-verification/confirm`. CSRF-Check gilt wie für alle
  `/api/*`-Mutationen.
- Rate-Limiter bleibt prozesslokal (ein Prozess auf dem VPS).

### Flags

Env-Variablen, in `src/lib/flags.ts` gelesen:

- `PUBLIC_SIGNUP` (Standard `false`): freie Registrierung unter
  `/registrieren` und „Gruppe gründen" für jedes Konto. Phase 3.
- `LEGAL_PAGES` ist kein Flag: die Seiten gehen mit echten Texten live;
  solange Platzhalter drin sind, bleibt der PR unmerged.

### Skripte und Migration der Live-Daten

- Migration 1 (PR 1): Player-Felder, `EmailToken`, `lower(email)`.
- Migration 2 (PR 2): `Invitation`, `InvitationUse`.
- Migration 3 (PR 3): `Player.activeGroupId`.
- Keine Daten-Backfills außer `lower(email)`. Jede Migration wird wie
  in Phase 1 gegen einen Produktions-Dump geprobt; keine braucht
  Downtime (nur neue Spalten und Tabellen).
- Nach Deploy von PR 1: Patrick und Thomas hinterlegen ihre echten
  Adressen, damit der Reset-Weg vor der Beta einmal echt durchläuft.
- `tenancy:set-owner` und `bootstrap:admin` laufen über `getSoleGroup()`
  und brechen ab, sobald eine zweite Gruppe existiert. PR 3 gibt beiden
  `--group <slug>`; `getSoleGroup()` bleibt nur für die leere DB beim
  Bootstrap. Ohne das wären Patricks Skripte ab dem ersten Beta-Gründer
  unbrauchbar.
- `seed:demo`, `seed:initial`, `import-*`: setzen `emailVerifiedAt`,
  damit lokale Demo-Konten kein Banner zeigen (Follow-up 15 aus
  Phase 1, Skripte ohne `groupId`, wird in PR 3 miterledigt, weil
  dann mehrere Gruppen lokal entstehen).

## Tests

- Unit: Token-Erzeugung und -Hash, Slug-Ableitung, Mail-Templates
  (Snapshot der Textfassung), Anonymisierungs-Mapping.
- Integration (Route-Handler mit DB, Muster aus Phase 1):
  Registrierung über Mitglieder- und Gründer-Link, abgelaufener und
  aufgebrauchter Link, Beitritt als Angemeldeter, Reaktivierung einer
  entfernten Mitgliedschaft, Gruppe gründen, Besitz übertragen, Gruppe
  löschen (fremde Gruppe bleibt unberührt), Gruppenwechsel im Token,
  Adresse ändern mit Kollision, Reset-Flow Ende-zu-Ende mit
  `memory`-Transport, Konto löschen als Besitzer (409), Konto löschen
  als Mitglied (Anonymisierung, Audit-Payloads, Matches bleiben),
  Export enthält alle Tabellen der Person.
- E2E-Erweiterung (`tests/e2e`): neuer Lauf „fremde Gruppe": Gründer-
  Link → Registrierung → Gruppe → Mitglieder-Link → zwei Beitritte →
  Spieltag bis Ergebnis. Läuft lokal vor dem Beta-Start.
- Alle Mails in Tests über den `memory`-Transport; kein Test spricht
  mit Resend.

## PR-Folge

Jeder PR: Review, Merge, Deploy, kurzer Check wie in Phase 1. Reihenfolge
so gewählt, dass Patrick die DNS-Einrichtung parallel zu PR 2 erledigen
kann und die Mails ab PR 1 lokal schon sichtbar sind.

1. **Mail und Adressen.** Resend-Transport mit `console`/`memory`,
   `EmailToken`, Player-Felder, Adresse ändern mit Bestätigung,
   Hinweisbanner, Passwort vergessen, öffentliche Pfade, DNS-Checkliste
   in `DEPLOYMENT.md`. Deploybar mit `MAIL_TRANSPORT=console`, bis
   Resend verifiziert ist (Mails landen dann im Journal; akzeptabel,
   weil nur die sechs Bestandskonten betroffen sind).
2. **Einladungen und Registrierung.** `Invitation`, Mitglieder-Links in
   der Admin-Seite, `/einladung/<token>` mit Registrierung und
   Beitritt, Gründer-Skript, Zustimmungs-Checkbox (verlinkt auf die
   Rechtsseiten, die hier noch Platzhalter sein dürfen, weil der Link
   erst in PR 5 öffentlich beworben wird).
3. **Gruppen.** Gruppe gründen, Gruppenwechsel, Rollenauswahl, Besitz
   übertragen, Umbenennen, Gruppe löschen, Gruppe verlassen,
   Seed-Skripte für mehrere Gruppen.
4. **Konto.** Export und Löschung mit Anonymisierung.
5. **Rechtstexte.** Seiten mit Patricks Texten, Fußzeilen-Links.
   Danach Beta-Start: zwei Gründer-Links erzeugen.
6. **Beta-Nachlese** (keine feste Sitzung): Rückmeldungen sammeln,
   kleine Fixes, Ergebnisse in die Phase-3-Spec.

Ausstiegskriterium (aus der Roadmap): Jemand Fremdes gründet ohne
Patricks Hilfe eine Gruppe, lädt Leute ein und spielt einen Spieltag
durch.

## Von Patrick (parallel zu den PRs)

- Resend-Konto anlegen, Domain `padelmaestro.de` dort eintragen, die
  angezeigten DNS-Einträge bei IONOS setzen, API-Key in die `.env` auf
  dem VPS (`RESEND_API_KEY`, `MAIL_TRANSPORT=resend`). Bis PR 2.
- Texte für Impressum, Datenschutzerklärung, Nutzungsbedingungen.
  Bis PR 5. Ich liefere die technischen Stichpunkte für den
  Datenschutzteil mit PR 1.
- Ein bis zwei Beta-Gruppen benennen, Beginn nach PR 5.

## Dem Builder überlassen

- Aufbau der Mail-Templates, HTML-Gestaltung, Betreffzeilen.
- Form der Hinweisbanner und des Gruppenwechslers innerhalb der
  bestehenden Design-Sprache (dunkel, Karten, `rounded-2xl`).
- Slug-Regeln im Detail, Fehlercodes der neuen Routen (Muster
  `snake_case` wie `email_taken`), Zod-Schemata.
- Reihenfolge der Transaktionsschritte beim Gruppen-Löschen und bei der
  Anonymisierung, solange die genannten Ergebnisse herauskommen.
- Ob `/registrieren` schon in PR 2 als Datei existiert (hinter dem Flag)
  oder erst in Phase 3.

## Meine Festlegungen (nicht von Patrick entschieden)

- Verifizierung ist nie Login-Voraussetzung, auch nicht für neue Konten
  (Einladungslink gilt als Zugangskontrolle). Nur der Reset-Weg
  verlangt eine bestätigte Adresse.
- Mitglieder-Links sind mehrfach verwendbar (25) und 14 Tage gültig;
  Gründer-Links einmalig, 30 Tage.
- Zustimmung zu den Rechtstexten nur bei Registrierung, keine
  nachträgliche Abfrage bei Bestandskonten.
- Gruppenwechsel über `Player.activeGroupId` statt Token-Update vom
  Client.
- Gruppe löschen ist ein hartes Löschen inklusive Audit-Log der Gruppe.
- Kontolöschung blockiert nicht wegen laufender Spieltage; nur
  Besitzerschaft blockiert.
- Bestehende Sessions überleben einen Passwort-Reset.
- Audit-Zeilen, in denen die Person Actor ist, bleiben bei der Löschung
  erhalten (nur die ID), Player-bezogene Payloads werden anonymisiert.
- Aus dem Builder-Check (2026-11-02): Gründer-Link auch für angemeldete
  Konten einlösbar, ein Link = eine Gruppe (`foundedGroupId`); Beitritt
  über Link trägt in geplante Spieltage ein wie „Spieler anlegen";
  Skripte bekommen `--group`; `MAIL_TRANSPORT=console` in Produktion
  erlaubt mit Warnung.
