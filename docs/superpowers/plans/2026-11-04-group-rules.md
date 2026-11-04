# Spielregeln pro Gruppe – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Joker pro Saison und Spiele pro Joker werden pro Gruppe gespeichert und von Admins in den Einstellungen geändert.

**Architecture:** Zwei Spalten auf `Group` mit Defaults; ein Lese-Helfer `getGroupRules`; alle Nutzer der beiden Konstanten lesen die Gruppenwerte; neue Route `PATCH /api/groups/active/rules`; Umbenennen wird für Admins geöffnet; Einstellungsseite bekommt Stepper.

**Tech Stack:** Prisma + Postgres-Migration, Next.js Route Handler mit zod, React-Client-Komponenten, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-group-rules-design.md`

## Global Constraints

- Spalten `Group.jokersPerSeason Int @default(2)` und `Group.jokerGamesCredited Int @default(15)`; Migration `prisma/migrations/20261106100000_group_rules/`.
- Grenzen: `jokersPerSeason` 0–10, `jokerGamesCredited` 1–30, ganze Zahlen.
- Route `PATCH /api/groups/active/rules`, Body `{ groupId: uuid, jokersPerSeason, jokerGamesCredited }`; 400 `invalid`, 403 `forbidden` (Rolle member), 409 `stale_group`, 409 `below_used` mit `{ minimum: number }`; Erfolg 200 mit den neuen Werten.
- Audit-Aktion `group.rules_update`, Payload `{ before: {...}, after: {...} }`.
- Rechte: Admin oder Owner für Regeln und Umbenennen; Besitz übertragen und Löschen bleiben Owner.
- Untergrenze: `jokersPerSeason` ≥ höchste Zahl `JokerUse` eines aktiven Mitglieds in der aktiven Saison der Gruppe (ohne aktive Saison: 0).
- Bestehende `JokerUse`-Zeilen werden nie geändert.
- Texte: Fußnote „Änderungen gelten sofort. Bereits eingesetzte Joker bleiben unverändert."; Fehler `below_used` → „Mindestens {minimum}, weil schon {minimum} Joker eingesetzt wurden."
- Commits deutsch und kurz, ohne Tool-Hinweise. Tests: `set -a; . ./.env; set +a; node node_modules/vitest/vitest.mjs run <file>`; Typecheck `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`; Migration lokal mit `node node_modules/prisma/build/index.js migrate dev --name group_rules` erzeugen bzw. `migrate deploy`.

## Review Focus

- **Gleichzeitiger Joker während Regeländerung:** Die Obergrenze in `useJoker` liest den Gruppenwert innerhalb derselben Transaktion nach dem Advisory-Lock. Test in Task 1.
- **Senken auf genau die eingesetzte Zahl** ist erlaubt (Grenzfall `minimum`), eins darunter nicht. Test in Task 2.
- **Fremde Gruppe / veraltete Gruppe** in der Route: 409 `stale_group`, nichts geändert. Test in Task 2.
- **Entfernte Mitglieder** zählen nicht für die Untergrenze. Test in Task 2.
- **Wert 0 Joker:** Roster zeigt „Keine Joker übrig", Joker-Route lehnt ab. Test in Task 1.

---

### Task 1: Datenmodell und Lesepfad

**Files:**
- Modify: `prisma/schema.prisma`; Create: `prisma/migrations/20261106100000_group_rules/migration.sql`
- Create: `src/lib/group/rules.ts`
- Modify: `src/lib/joker/use.ts`, `src/lib/admin/game-days.ts`, `src/lib/player/season-stats.ts`, `src/app/admin/spieltage/page.tsx`, `src/app/admin/saison/page.tsx`, `src/app/admin/einstellungen/page.tsx`, `src/components/joker-confirm-dialog.tsx` und sein Aufrufer, `src/app/game-day/print/print-sheet.tsx` und sein Aufrufer
- Test: `tests/integration/group-rules.test.ts`, bestehende Joker-/Season-Stats-Tests anpassen

**Interfaces:**
- Produces: `type GroupRules = { jokersPerSeason: number; jokerGamesCredited: number }`; `getGroupRules(groupId: string, db?: Prisma.TransactionClient): Promise<GroupRules>`; Defaults weiter exportiert als `DEFAULT_JOKERS_PER_SEASON = 2`, `DEFAULT_JOKER_GAMES_CREDITED = 15` (bisherige Konstanten-Namen werden entfernt oder auf die Defaults umgelenkt, keine Laufzeitnutzung mehr außer Tests/Seeds).

- [ ] **Step 1: Tests:** neue Gruppe hat 2/15; `useJoker` mit `jokersPerSeason = 3` erlaubt den dritten Joker, mit `1` lehnt es den zweiten ab (`JokerCapExceededError`); mit `0` lehnt es den ersten ab; `jokerGamesCredited = 10` schreibt `gamesCredited = 10` und `pointsCredited = 10 × ppg`; Saison-Statistik `jokers.total` folgt dem Gruppenwert; Roster `jokersRemaining` folgt dem Gruppenwert.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** Schema, Migration (ALTER TABLE mit DEFAULT, NOT NULL), `getGroupRules`, alle Aufrufer. In `useJoker` die Regeln innerhalb der Transaktion nach dem Lock lesen. Client-Komponenten bekommen die Werte als Props.
- [ ] **Step 4: Run** neue und angepasste Tests, dann volle Suite → PASS; `tsc` sauber; `grep -rn "MAX_JOKERS_PER_SEASON\|JOKER_GAMES_CREDITED" src` zeigt keine Laufzeitnutzung mehr.
- [ ] **Step 5: Commit** `"Joker-Regeln pro Gruppe speichern"`

### Task 2: Route und Rechte

**Files:**
- Create: `src/lib/group/update-rules.ts`, `src/app/api/groups/active/rules/route.ts`
- Modify: `src/lib/group/rename.ts` (Admin oder Owner), `src/app/api/groups/active/route.ts` (PATCH für Admin), `tests/integration/api-group.test.ts` (Erwartung „403 für Admin" wird „200 für Admin", Mitglied weiterhin 403)
- Test: `tests/integration/api-group-rules.test.ts`

**Interfaces:**
- Consumes: `getGroupRules`
- Produces: `updateGroupRules(i: { groupId: string; actorId: string; rules: GroupRules }): Promise<GroupRules>`; `class RulesBelowUsedError extends Error { minimum: number }`

- [ ] **Step 1: Tests:** Admin 200 und Werte gespeichert, Audit `group.rules_update` mit before/after; Mitglied 403; ohne Session 401; falsche `groupId` 409 `stale_group` ohne Änderung; Werte außerhalb 0–10 / 1–30 oder keine ganze Zahl 400; Spieler mit 2 Jokern in aktiver Saison: Senken auf 2 → 200, auf 1 → 409 `below_used` mit `minimum: 2`; entfernter Spieler mit 3 Jokern zählt nicht; Umbenennen durch Admin jetzt 200.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (Untergrenze in derselben Transaktion berechnen). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `"Regeln und Gruppenname für Admins änderbar"`

### Task 3: Einstellungsseite

**Files:**
- Modify: `src/app/admin/einstellungen/settings-view.tsx`, `src/app/admin/einstellungen/page.tsx`
- Test: `tests/components/admin-settings-view.test.tsx`

**Interfaces:**
- Consumes: Route aus Task 2, `GroupRules`
- Produces: `SettingsView` Props ersetzen `maxJokers` durch `rules: GroupRules`; `isOwner` bleibt nur für Übertragen/Löschen. Die Seite ist ohnehin nur für Admins erreichbar (`requireAdmin`), Umbenennen und Regeln sind damit für jeden Betrachter editierbar.

- [ ] **Step 1: Tests:** Admin (nicht Owner, `isOwner=false`) sieht Umbenennen und zwei Stepper-Zeilen „Joker pro Saison" und „Spiele pro Joker" mit −/+ (`aria-label` „Joker pro Saison verringern" usw.); Grenzen deaktivieren − bei 0 bzw. 1 und + bei 10 bzw. 30; „Sichern" erst nach Änderung aktiv und sendet `PATCH /api/groups/active/rules` mit beiden Werten; 409 `below_used` zeigt „Mindestens 2, weil schon 2 Joker eingesetzt wurden."; „Spieler pro Spieltag 4–6" bleibt Anzeige; neue Fußnote; Besitz übertragen und Löschen weiterhin nur für Owner.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** im Listenstil (Stepper rechts in der Zeile, Werte `tabular-nums`). **Step 4: Run** → PASS, volle Suite, `tsc`.
- [ ] **Step 5: Commit** `"Spielregeln in den Einstellungen bearbeiten"`
