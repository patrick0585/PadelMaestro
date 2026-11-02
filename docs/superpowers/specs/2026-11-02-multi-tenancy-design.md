# Mandantenfähigkeit (Phase 1) – Design

Stand: 2026-11-02. Teil der App-Store-Roadmap
(`2026-11-02-app-store-roadmap.md`, Phase 1).

## Absicht

Padelmaestro soll mehrere unabhängige Padel-Gruppen bedienen. Heute
geht der gesamte Code von genau einer Gruppe aus: eine aktive Saison,
ein aktiver Spieltag, alle Spieler in jedem Spieltag, Rangliste über
alle Spieler. Phase 1 zieht eine Gruppengrenze durch Datenmodell,
Session und jede Abfrage, ohne dass die bestehende Gruppe etwas davon
merkt. Registrierung, Einladungen, Gruppe gründen und Gruppenwechsel
kommen erst in Phase 2 und bauen auf dieser Grenze auf.

## Ziele

- Jede Saison, jeder Spieltag, jedes Match, jeder Joker und jede
  Rangliste gehört genau einer Gruppe.
- Ein Konto (Player) kann Mitglied mehrerer Gruppen sein, mit eigener
  Rolle pro Gruppe.
- Kein API-Endpunkt und keine Seite liefert Daten einer fremden Gruppe,
  auch nicht per geratener ID.
- Die Live-Gruppe wird per Migration zur ersten Gruppe. Verhalten,
  Daten, Logins und URLs bleiben für sie unverändert.
- Jeder PR der Phase ist für sich deploybar und verhaltensneutral.

## Nicht-Ziele (Phase 2 oder später)

- Selbstregistrierung, E-Mail-Versand, Einladungslinks.
- Gruppe gründen, umbenennen, löschen oder übertragen per UI.
- Sichtbarer Gruppenwechsel. Phase 1 wählt die Gruppe unsichtbar.
- Einstellungen pro Gruppe (Regeln bleiben fest).
- Kontolöschung durch den Nutzer, Datenexport, Rechtstexte.
- Mehrsprachigkeit.

## Anti-Ziele

- Datenverlust oder Verhaltensänderung für die bestehende Gruppe.
- Ein „Big Bang“-PR. Wenn ein Schritt nicht verhaltensneutral
  deploybar ist, wird er weiter geteilt.
- Mandantenlogik über URL-Präfixe (`/g/<slug>/...`). URLs bleiben wie
  heute; die aktive Gruppe steckt in der Session.

## Entscheidungen (Patrick, 2026-11-02)

- Ein globales Konto pro Person, Mitgliedschaften pro Gruppe.
- Rollen: Besitzer, Admin, Mitglied.
- Gruppenwechsel erst in Phase 2.
- Name der migrierten Gruppe: „Padelmaestro“.
- Login-Strategie (betrifft Phase 2/3, hier nur Randbedingung):
  E-Mail und Passwort, später zusätzlich „Mit Apple anmelden“, kein
  Google. Phase 1 fügt deshalb keine OAuth-Felder hinzu.

## Datenmodell

Neu:

```
model Group {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  memberships Membership[]
  seasons     Season[]
  gameDays    GameDay[]
  auditLogs   AuditLog[]
}

enum MembershipRole { owner admin member }

model Membership {
  id        String         @id @default(uuid())
  groupId   String
  playerId  String
  role      MembershipRole @default(member)
  joinedAt  DateTime       @default(now())
  removedAt DateTime?
  group  Group  @relation(fields: [groupId], references: [id])
  player Player @relation(fields: [playerId], references: [id])
  @@unique([groupId, playerId])
  @@index([playerId])
  @@index([groupId, removedAt])
}
```

Geändert:

- `Season.groupId`. In PR 1 optional im Prisma-Schema, in der DB
  vollständig befüllt; ab PR 4 Pflicht (dann werden auch die rund 100
  direkten `create`-Aufrufe in Tests umgestellt). `@@unique([groupId,
  name])` ersetzt `name @unique` in PR 4. „Eine aktive Saison pro
  Gruppe“ wird in der Anwendung (Transaktion) gesichert, nicht per
  partiellem Index, weil Prisma solche Indizes als Drift behandelt.
- `GameDay.groupId` (denormalisiert aus der Saison, damit
  Spieltag-Routen mit einer Abfrage prüfen können; optional bis PR 4
  wie oben). `@@unique([seasonId, date])` bleibt.
- `AuditLog.groupId` (optional; Konto-Aktionen ohne Gruppe bleiben
  leer).
- `Player.isAdmin` wurde in PR 6 entfernt.

Unverändert: `Match`, `GameDayParticipant`, `JokerUse` erben die Gruppe
über `GameDay` bzw. `Season`. `Player.email`/`username` bleiben global
eindeutig (ein Konto pro Person). `Player.deletedAt` bedeutet künftig
„Konto gelöscht“, nicht „aus der Gruppe entfernt“.

Semantik:

- Aktives Mitglied: `Membership` mit `removedAt IS NULL`.
- „Spieler entfernen“ im Admin-Bereich endet die Mitgliedschaft
  (`removedAt` setzen). Historie (Matches, Joker, Ränge) bleibt. Der
  bisherige Soft-Delete des Players wird dafür nicht mehr benutzt;
  bestehende `deletedAt`-Werte werden migriert (siehe unten).
  Seit PR 6 beendet Entfernen nur die Mitgliedschaft; `deletedAt` bleibt
  für die Kontolöschung in Phase 2.
  Passwort und E-Mail des Besitzers kann nur der Besitzer selbst ändern
  (sonst 409 `owner_protected`), damit kein Admin das Besitzerkonto
  übernehmen kann.
- Spieler ohne aktive Mitgliedschaft in der Session-Gruppe können sich
  einloggen, sehen aber eine leere Zustandsseite „Du bist in keiner
  Gruppe“. In Phase 1 kann das nur durch Entfernen entstehen und
  entspricht dem heutigen Verhalten „gelöschter Spieler kann nicht
  mehr rein“ in abgeschwächter Form; genügt, weil Phase 2 hier
  „Gruppe gründen oder Einladung annehmen“ anbietet.
  Der Leerzustand „Du bist in keiner Gruppe“ kommt als einfache
  Komponente bereits mit PR 4, weil Seiten ohne Gruppe keine Saison mehr
  laden können; Feinschliff in PR 6.

## Migration der Live-Daten

Eine Prisma-Migration (SQL) mit Backfill in derselben Transaktion:

1. `Group` „Padelmaestro“, Slug `padelmaestro`, anlegen.
2. Für jeden `Player` eine `Membership` in dieser Gruppe:
   `role = 'admin'` wenn `isAdmin`, sonst `member`;
   `removedAt = deletedAt` (gelöschte Spieler sind entfernte
   Mitglieder); `joinedAt = invitedAt`.
3. `Season.groupId`, `GameDay.groupId` befüllen, dann auf NOT NULL
   setzen; Indizes umstellen.
4. `Player.deletedAt` für migrierte Spieler auf NULL setzen? Nein:
   bleibt gesetzt, damit deren Login weiter blockiert ist (heutiges
   Verhalten). Erst Phase 2 definiert Kontolöschung neu.
5. Besitzer: kein Admin wird automatisch Besitzer. Nach dem Deploy
   setzt `pnpm tenancy:set-owner <email>` (neues Skript) die Rolle für
   Patricks Konto; Thomas bleibt Admin. Bis dahin verhält sich Admin
   wie Besitzer, weil Phase 1 keine Besitzer-exklusiven Funktionen hat.

Die Migration wird vor dem Deploy lokal gegen einen frischen
Produktions-Dump geprobt (`pg_restore` in eine Wegwerf-DB, `migrate
deploy`, Stichproben: Anzahl Spieltage, Matches, Joker pro Saison vor
und nach). Direkt vor dem Deploy ein manueller Dump nach dem Muster in
`/root/backups/`.

## Session und Autorisierung

- JWT bekommt `groupId` und `role`. Beim Login wird die aktive
  Mitgliedschaft gewählt: genau eine in Phase 1; bei mehreren die
  zuletzt beigetretene (Vorgriff auf Phase 2, dort kommt der Wechsler).
  Keine Mitgliedschaft: `groupId = null`, `role = null`.
- `isAdmin` in Session und Token bleibt als abgeleitetes Feld
  (`role in (admin, owner)`), damit die UI-Komponenten, die heute
  `session.user.isAdmin` lesen, unverändert bleiben.
- `refreshTokenFromPlayer` liest künftig Mitgliedschaft und Rolle statt
  `Player.isAdmin`; die 5-Minuten-Stale-Logik bleibt. Entfernte
  Mitgliedschaft führt zu `groupId = null`, nicht zum Logout.
- Neuer Helfer `src/lib/auth/group-context.ts`:
  - `getGroupContext()` → `{ userId, groupId, role }` oder `null`.
  - `requireMember()` wirft/404 ohne aktive Mitgliedschaft.
  - `requireGroupAdmin()` für Admin- und Besitzer-Rechte.
  - `requireOwner()` vorbereitet, in Phase 1 ungenutzt.
- Ressourcenprüfung: Spieltag-, Match- und Spieler-Routen laden das
  Objekt immer zusammen mit `groupId` und antworten mit 404 (nicht
  403), wenn es nicht zur Session-Gruppe gehört. Spieler-Routen prüfen
  die Zielperson über eine aktive Mitgliedschaft in der Gruppe.
- SSE-Endpunkt prüft die Gruppenzugehörigkeit des Spieltags vor dem
  Öffnen des Streams.
- Middleware, CSRF, Rate-Limiter: unverändert.

## Abfragen, die gruppenbezogen werden

- `getOrCreateActiveSeason(groupId)`, `closeSeasonAndStartNext`
  (Namenskonflikt nur innerhalb der Gruppe), Archiv-Listen.
- Aktiver Spieltag: `findFirst({ groupId, status in planned/in_progress })`
  auf Dashboard, Spieltag-Seite, Druckansicht, Admin.
- Spieltag anlegen: Teilnehmer = aktive Mitglieder der Gruppe statt
  aller Spieler. `GameDay.groupId` aus der Saison setzen.
- Spielerlisten im Admin, Spieler anlegen (legt Konto und
  Mitgliedschaft an; existiert die E-Mail bereits, antwortet die Route
  wie heute mit 409 `email_taken`; das Wiederaufnehmen entfernter
  Mitglieder kommt mit den Einladungen in Phase 2), Spieler entfernen
  (Mitgliedschaft beenden), Passwort zurücksetzen (nur für Mitglieder
  der Gruppe).
- Admin-Schalter (`PATCH /api/players/[id]` mit `isAdmin`) bildet auf
  `role` ab: `true` → `admin`, `false` → `member`. Der Besitzer kann
  weder herabgestuft noch entfernt werden (409 `owner_protected`); die
  „letzter Admin“-Prüfung zählt den Besitzer mit.
- Übergang: Von PR 2 bis PR 5 wurden `Player.isAdmin` und
  `Membership.role` parallel geschrieben, gelesen wurde nur noch die
  Rolle. PR 6 hat die Spalte entfernt.
- Ranking-SQL, Verlaufsdiagramm, Partner-Statistik, Spieltag-Roster:
  Spielerquelle wird `Membership` der Saison-Gruppe mit
  `removedAt IS NULL` statt `Player WHERE deletedAt IS NULL`. Entfernte
  Mitglieder sind damit ausgeblendet, genau wie heute gelöschte
  Spieler. Nur das Archiv-Podium (`game-day/summary.ts`) zeigt sie wie
  heute weiterhin. Die Probe gegen den Produktions-Dump prüft, dass
  die Rangliste vor und nach der Migration identisch ist.
- Profil-Statistiken, Teamwork-Partner, Joker-Zähler: Saison der
  Session-Gruppe.
- AuditLog: `groupId` bei allen gruppenbezogenen Aktionen setzen.

## Skripte und Tests

- `bootstrap:admin`: legt bei leerer DB die Gruppe „Padelmaestro“ an
  und macht den neuen Admin zum Besitzer. Bei vorhandener Gruppe wird
  er Admin dieser Gruppe.
- `seed:demo`, `seed:initial`, `scripts/dev/seed-demo-day.ts`,
  Import-Skripte: Gruppe anlegen oder ermitteln, Mitgliedschaften
  schreiben.
- `import-statistik.ts`: `wipeAll` entfernt bereits Mitgliedschaften
  (PR 1).
- Neues Skript `tenancy:set-owner <email>`.
- Tests: `tests/helpers/reset-db.ts` erhält `createTestGroup()` und
  `addMember()`. Integrationstests, die Spieler anlegen, laufen über
  diese Helfer. Neue Tests pro PR: Zugriff auf Objekt einer fremden
  Gruppe liefert 404; Rangliste enthält keine Spieler anderer Gruppen;
  Session ohne Mitgliedschaft rendert den Leerzustand.
- E2E-Lauf (`pnpm e2e`) nach PR 4 und PR 6 gegen den lokalen Stand.

## PR-Folge

Jeder PR wird reviewt, gemergt und auf den VPS deployt, bevor der
nächste beginnt. Nach jedem Deploy: Login, Dashboard, Spieltag,
Rangliste kurz prüfen.

1. **Schema und Backfill.** Group, Membership, groupId-Spalten,
   Indizes, Daten-Migration, `tenancy:set-owner`. Die drei Schreiber
   (`getOrCreateActiveSeason`, `closeSeasonAndStartNext`,
   `createGameDay`) erhalten die Gruppe vorerst über eine Hilfsfunktion
   `getSoleGroup()`, die in PR 4 wieder verschwindet; sonst bleibt der
   App-Code unberührt. Probe gegen Produktions-Dump dokumentiert im
   PR.
2. **Gruppenkontext.** Zuerst eine Abgleich-Migration (idempotent):
   fehlende Mitgliedschaften anlegen, `role` aus `isAdmin` übernehmen
   (ohne `owner` anzufassen), `removedAt` aus `deletedAt`,
   `groupId`-NULLs füllen — gleicht Daten ab, die zwischen Deploy von
   PR 1 und PR 2 ohne Gruppe entstanden sind (Spieler anlegen,
   Admin-Schalter, Skripte, Build-Fenster). Dann Session-Claims,
   Helfer, Token-Refresh über
   Mitgliedschaft, `isAdmin` abgeleitet. `bootstrap:admin` und Seeds
   auf Mitgliedschaften umgestellt. Testhelfer.
3. **Spieler.** Listen, Anlegen, Entfernen, Passwort-Reset, Avatar-
   Routen über Mitgliedschaft; Admin-Seite.
4. **Saison und Spieltag.** Aktive Saison und aktiver Spieltag pro
   Gruppe, Teilnehmer aus Mitgliedern, Archiv, Joker, Saison schließen,
   Druckansicht, alle `game-days`-Routen mit Gruppenprüfung. Vor dem
   Setzen von NOT NULL die `groupId`-NULLs erneut füllen und fehlende
   Mitgliedschaften anlegen (nur diese beiden Teile der
   Abgleich-Migration aus PR 2; Rolle und `removedAt` nicht mehr aus
   `Player` spiegeln, weil Rolle und Entfernen ab PR 3 auf der
   Mitgliedschaft geführt werden).
5. **Rangliste, Profil, Live.** Ranking-SQL, Profil-Statistiken, SSE-
   Autorisierung, Ranking-API.
6. **Aufräumen.** `Player.isAdmin` entfernen, letzte `findFirst`-Reste
   per Grep prüfen, Leerzustand „keine Gruppe“, Doku.

## Risiken

- Vergessene Stelle, die weiter global abfragt: Abschluss-Audit in
  PR 6 per Grep auf `findFirst(`, `findMany(` ohne `groupId` in
  `src/lib` und `src/app/api`; jede Stelle wird im PR begründet.
- Test-Suite: Viele Integrationstests legen Spieler direkt an. Der
  Aufwand steckt in PR 2 (Helfer) und zieht sich durch alle PRs.
- Partieller Unique-Index liegt außerhalb des Prisma-Schemas; `migrate
  dev` darf ihn nicht als Drift verwerfen. Lösung: Index in der
  Migration anlegen und in `schema.prisma` kommentieren; Prisma 6
  toleriert zusätzliche Indizes nicht in allen Fällen, daher wird das
  in PR 1 verifiziert und notfalls durch eine Anwendungsprüfung in
  der Transaktion ersetzt.

## Dem Umsetzenden überlassen

- Exakte Signaturen der Helfer und Aufteilung in Dateien.
- Ob `groupId` auch auf `JokerUse` denormalisiert wird, falls die
  Joker-Abfragen sonst unhandlich werden.
- Reihenfolge innerhalb eines PRs und Schnitt der Tests.
- Form des Leerzustands „keine Gruppe“ (einfacher Text reicht).

## Anhang: Abschluss-Audit PR 6 (Abfragen ohne groupId)

Stand 2026-11-02. Geprüft wurden alle Treffer von
`grep -rn "\.\(findFirst\|findMany\|count\|groupBy\|aggregate\)(" src/lib src/app --include='*.ts' --include='*.tsx' | grep -v groupId`.
Der Filter wirkt zeilenweise: Treffer, bei denen `groupId` erst in der
`where`-Zeile darunter steht, sind mit „groupId in where“ markiert. Ergebnis:
keine Lücke, jede Stelle ist über die Gruppe der Session oder über eine
bereits gruppengeprüfte Beziehung gescoped oder bewusst konto-global.

| Datei:Zeile | Abfrage | Begründung |
| --- | --- | --- |
| src/lib/season.ts:79 | `gameDay.findMany` offene Spieltage | gescoped über `seasonId` der aktiven Saison, die per `groupId` ermittelt wird (Zeile 76) |
| src/lib/season.ts:86 | `season.findFirst` Namenskonflikt | groupId in where (nächste Zeile) |
| src/lib/ranking/season-trend.ts:62 | `gameDay.findMany` | gescoped über `seasonId`; Saison gehört der Session-Gruppe (PR 4) |
| src/lib/ranking/season-trend.ts:71 | `match.findMany` | gescoped über `gameDay.seasonId`, Saison der Session-Gruppe |
| src/lib/ranking/season-trend.ts:94 | `jokerUse.findMany` | gescoped über `seasonId`, Saison der Session-Gruppe |
| src/lib/ranking/compute.ts:26 | `gameDay.findMany` | gescoped über `seasonId`; Aufrufer übergeben nur Saisons der Session-Gruppe (Startseite, Rangliste, API) bzw. aus dem gruppengescopten Archiv |
| src/lib/archive/list.ts:26 | `gameDay.findMany` | groupId in where (nächste Zeile) |
| src/lib/archive/list.ts:44 | `jokerUse.groupBy` | gescoped über `gameDayId in` die zuvor gruppengescopten Spieltage |
| src/lib/auth/authorize.ts:41 | `player.findFirst` Login | Konto-global per Design (Login per E-Mail/Benutzername) |
| src/lib/group/sole-group.ts:16 | `group.findMany` | Bootstrap/Skript: einzige Gruppe bis Phase 2, bricht bei mehreren Gruppen ab |
| src/lib/group/members.ts:15 | `membership.findMany` | groupId in where (nächste Zeile) |
| src/lib/group/members.ts:50 | `player.findMany` | Einschränkung über `memberships: { some: { groupId } }` in der Zeile darunter |
| src/lib/group/set-owner.ts:27 | `membership.findFirst` | groupId in where (nächste Zeile) |
| src/lib/group/bootstrap-admin.ts:23 | `membership.count` | groupId in where (nächste Zeile), Skript |
| src/lib/group/active-membership.ts:13 | `membership.findFirst` | Membership-Abfrage ist selbst die Quelle der Gruppe der Session (Login/JWT) |
| src/lib/group/active-membership.ts:25 | `membership.count` | groupId in where (Folgezeilen) |
| src/lib/group/active-membership.ts:40 | `membership.findFirst` | groupId in where (nächste Zeile) |
| src/lib/players/create.ts:60 | `gameDay.findMany` geplante Tage | groupId in where (nächste Zeile) |
| src/lib/players/delete.ts:47 | `gameDayParticipant.findFirst` | gescoped über `gameDay: { groupId }` im `where` |
| src/lib/game-day/group-scope.ts:7 | `gameDay.findFirst` | groupId in where (nächste Zeile); Helfer für die Gruppenprüfung der Routen |
| src/lib/game-day/group-scope.ts:17 | `match.findFirst` | gescoped über `gameDay: { groupId }` in der nächsten Zeile |
| src/lib/game-day/live-standings.ts:206 | `player.findMany` Namen/Avatare | Spieler-IDs stammen aus Matches des bereits gruppengeprüften Spieltags; liefert nur Name und Avatar-Version |
| src/lib/game-day/summary.ts:60 | `player.findMany` Namen/Avatare | wie live-standings: IDs aus Matches des Spieltags |
| src/lib/game-day/remove-extra-match.ts:36 | `match.findFirst` | gescoped über `gameDayId` nach Gruppenprüfung der Route (PR 4) |
| src/lib/game-day/remove-extra-match.ts:68 | `match.findMany` | gescoped über `gameDayId` desselben Matches |
| src/lib/game-day/create.ts:14 | `membership.findMany` | groupId in where (nächste Zeile) |
| src/lib/joker/use.ts:73 | `jokerUse.count` | gescoped über `playerId` + `seasonId` des Spieltags, der zuvor per Route gruppengeprüft wird |
| src/lib/joker/list.ts:15 | `jokerUse.findMany` | gescoped über `gameDayId` nach Gruppenprüfung der Route |
| src/lib/player/season-stats.ts:90 | `match.findMany` | gescoped über `gameDay.seasonId` der Session-Gruppe und `playerId` |
| src/lib/player/season-stats.ts:116 | `jokerUse.count` | gescoped über `seasonId` der Session-Gruppe und `playerId` |
| src/lib/player/season-stats.ts:117 | `gameDay.count` | gescoped über `seasonId` der Session-Gruppe |
| src/app/page.tsx:40 | `gameDay.findFirst` | groupId in where (nächste Zeile) |
| src/app/game-day/page.tsx:54 | `gameDay.findFirst` | groupId in where (nächste Zeile) |
| src/app/game-day/page.tsx:62 | `gameDay.findFirst` | groupId in where (Folgezeilen) |
| src/app/game-day/print/page.tsx:17 | `gameDay.findFirst` | groupId in where (nächste Zeile) |
| src/app/game-day/partnership-counts.tsx:9 | `match.findMany` | gescoped über `gameDayId` des gruppengeprüften Spieltags der Seite |
| src/app/game-day/partnership-counts.tsx:33 | `player.findMany` | IDs aus Matches dieses Spieltags; liefert nur Namen |
| src/app/admin/page.tsx:62 | `gameDay.findFirst` | groupId in where (nächste Zeile) |
| src/app/admin/page.tsx:74 | `jokerUse.groupBy` | gescoped über `seasonId` der Session-Gruppe; ausgewertet nur für Mitglieder der Gruppe |
| src/app/admin/page.tsx:83 | `gameDay.count` | gescoped über `seasonId` der Session-Gruppe |
| src/app/api/game-days/route.ts:13 | `gameDay.findMany` | groupId in where (nächste Zeile) |
| src/app/api/game-days/[id]/matches/route.ts:27 | `gameDayParticipant.findFirst` | gescoped über `gameDayId` und die eigene `userId`, nach `findGroupGameDay` der Route |

Lücken: keine.
