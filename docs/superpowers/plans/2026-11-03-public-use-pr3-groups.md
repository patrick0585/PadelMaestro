# Phase 2, PR 3 „Gruppen" – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mehrere Gruppen pro Konto nutzbar machen: aktive Gruppe mit Gruppenwechsler, Rollen „Mitglied/Admin", Besitz übertragen, Gruppe umbenennen und löschen, Gruppe verlassen, Skripte für mehrere Gruppen.

**Architecture:** `Player.activeGroupId` (neue Migration) löst „neueste Mitgliedschaft gewinnt" ab; `findActiveMembership` bevorzugt die aktive Gruppe und bleibt der einzige Ort, der die Gruppe für Login und Token-Refresh bestimmt. Neue Lib-Module `src/lib/group/{active-group,transfer,rename,delete,leave}.ts` mit Route-Handlern im bestehenden Muster (zod, Guards aus `@/lib/auth/route-guard`, Fehlercodes `snake_case`). UI: Gruppenwechsler in beiden Navigationsleisten, Rollen-Auswahl im Bearbeiten-Dialog, Dialoge „Besitz übertragen", „Gruppe löschen", Abschnitt „Gruppe" auf `/admin`, Abschnitt „Gruppe" auf `/profil`.

**Tech Stack:** Next.js 15 (App Router), next-auth 5 beta (JWT; Claims werden bei jedem Request über `refreshTokenFromPlayer` → `findPlayerForRefresh` → `findActiveMembership` aufgefrischt), Prisma 6/Postgres, zod 4, vitest 4 (Integrationstests gegen echte DB, `fileParallelism: false`), Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-02-public-use-design.md` (Abschnitte „Datenmodell" (`activeGroupId`), „Rollen, Besitz, Gruppe", „Gruppenwechsel", „Skripte und Migration der Live-Daten", „PR-Folge" Punkt 3).

**Rulings des Planers (Abweichungen und Festlegungen):**

- Der E2E-Lauf „fremde Gruppe" ist nicht Teil dieses PRs. Er braucht Playwright, einen zweiten Treiber neben `tests/e2e/run.mjs` (839 Zeilen) und läuft laut Spec „lokal vor dem Beta-Start"; er bekommt nach PR 5 einen eigenen kleinen Plan.
- Umbenennen ändert nur `Group.name`, der `slug` bleibt (er steckt in keiner URL, nur in Skript-Argumenten).
- Gruppenwechsel schreibt kein Audit (Nutzerpräferenz, keine Gruppenänderung). `membership.leave`, `group.rename`, `group.transfer_owner`, `group.delete` schreiben Audit.
- Beim Löschen einer Gruppe bleiben `InvitationUse`-Zeilen von Gründer-Links erhalten (`foundedGroupId` wird per FK auf null gesetzt); `Player.activeGroupId` der Mitglieder wird per FK auf null gesetzt, der nächste Request wählt die neueste verbleibende Mitgliedschaft.
- Die Seed- und Import-Skripte bekommen `--group <slug>` (bestehende Gruppe), ohne Flag weiter `getSoleGroup()`; bei mehreren Gruppen bricht `getSoleGroup()` mit Hinweis auf `--group` ab. `bootstrap:admin` legt mit `--group <slug>` keine neue Gruppe an, sondern verlangt eine bestehende; ohne Flag wie bisher (leere DB → Gruppe „Padelmaestro").
- `isAdmin` bleibt in `PATCH /api/players/[id]` und in der Session als Übergang (Spec: fliegt in Phase 3); `role` hat Vorrang, wenn beides gesendet wird.

## Global Constraints

- Branch `feat/public-3-groups`, Worktree unter `.claude/worktrees/`. Kein Merge und kein Deploy ohne Patricks Go.
- Migration nur additiv: `Player.activeGroupId String?` mit Relation `activeGroup Group? @relation("ActiveGroup", fields: [activeGroupId], references: [id], onDelete: SetNull)` und `Group.activeFor Player[] @relation("ActiveGroup")`, Index `@@index([activeGroupId])`. Kein Backfill (Bestandskonten haben eine Mitgliedschaft; „neueste gewinnt" liefert dasselbe Ergebnis).
- Gruppenwahl: `findActiveMembership(db, playerId)` liefert die aktive Mitgliedschaft in `activeGroupId`, wenn sie existiert und `removedAt` null ist; sonst die neueste (`joinedAt desc, id desc`); sonst null. Beitritt (`joinGroup`), Einlösen (`joinWithInvitation` member) und Gründung (`createGroup`) setzen `activeGroupId` auf die betroffene Gruppe.
- Rollenregeln aus Phase 1 bleiben: Besitzer nicht herabstufbar (`OwnerProtectedError`, 409 `owner_protected`), letzter Admin geschützt (`LastAdminError`, 409 `last_admin`).
- Besitz übertragen: nur Besitzer, Ziel ist aktives Mitglied der Gruppe (nicht der Besitzer selbst); bisheriger Besitzer wird `admin`; Audit `group.transfer_owner` (payload `{ from, to }`).
- Gruppe löschen: nur Besitzer; Body `{ name, password }`; `name` muss exakt `Group.name` sein (400 `name_mismatch`), Passwort über `verifyPassword` (403 `wrong_password`); hartes Löschen in einer Transaktion in FK-Reihenfolge JokerUse, Match, GameDayParticipant, GameDay, Season, InvitationUse (der Gruppen-Einladungen), Invitation, Membership, AuditLog der Gruppe, Group; vorher ein globales Audit `group.delete` (groupId null, payload `{ name, slug, members, gameDays }`).
- Gruppe verlassen: jedes Mitglied außer Besitzer (409 `owner_protected`); letzter Admin geschützt (409 `last_admin`); aktive Teilnahme (`confirmed`/`joker` an `planned`/`in_progress`) blockiert (409 `active_participation`); setzt `removedAt`, Audit `membership.leave`; `activeGroupId` wird auf null gesetzt, wenn es diese Gruppe war.
- Gruppenname 2–40 Zeichen getrimmt (`groupNameField` aus `@/lib/invitations/schemas`).
- Fehlercodes: `invalid` (400), `name_mismatch` (400), `unauthorized` (401), `forbidden` (403), `wrong_password` (403), `not_found` (404), `last_admin`, `owner_protected`, `active_participation` (409), `rate_limited` (429). Gruppe löschen: 5/h pro Konto (`rateLimit(\`group-delete:${userId}\`)`).
- Texte Deutsch; Design-Sprache wie bisher (dunkle Karten, `rounded-2xl`, `border-border`, `bg-surface`, `Dialog`, `Button`, `Input`, `Badge`, `InlineMessage`); Tap-Ziele min. 44 px, sichtbare Fokusringe; destruktive Aktionen mit Bestätigung.
- Alle Tests mit `memory`-Mail-Transport; Integrationstests gegen die Dev-DB (`resetDb` in `beforeEach`).
- Nirgendwo Claude/Anthropic-Hinweise; Commit-Messages kurz, Deutsch, ohne Conventional-Commit-Präfix.

## Review Focus

1. Ein Konto mit zwei Gruppen wird aus der aktiven Gruppe entfernt (Admin entfernt es oder Gruppe gelöscht): der nächste Request landet in der anderen Gruppe, nicht auf 403 und nicht in einer entfernten Mitgliedschaft. (Tests in Task 1 und Task 6.)
2. Besitz übertragen auf ein Mitglied, das gleichzeitig entfernt wird: genau ein Besitzer bleibt übrig, nie null, nie zwei. (Test in Task 5.)
3. Gruppe löschen mit laufendem Spieltag und offenen Einladungen: alles weg, fremde Gruppen und Gründer-Verwendungen unberührt, Konten bleiben, Spieler-Avatare bleiben. (Test in Task 6.)
4. Gruppe verlassen als letzter Admin oder mit bestätigter Teilnahme: 409 mit klarer Meldung, nichts verändert. (Test in Task 7.)
5. Gruppenwechsler nach Wechsel: Dashboard, Spieltag und Admin zeigen die neue Gruppe ohne erneutes Login; `/admin` für ein Konto, das in der neuen Gruppe nur Mitglied ist, leitet auf `/ranking` um. (Tests in Task 2 und Task 3.)

---

### Task 1: Migration `activeGroupId`, Gruppenwahl im Refresh, Setzen bei Beitritt und Gründung

**Files:**
- Modify: `prisma/schema.prisma` (`Player.activeGroupId`, Relation, Index; `Group.activeFor`)
- Create: `prisma/migrations/20261105100000_active_group/migration.sql`
- Modify: `src/lib/group/active-membership.ts:9-18` (`findActiveMembership`)
- Modify: `src/lib/group/join.ts` (`joinGroup` setzt `activeGroupId`), `src/lib/group/create.ts` (`createGroup` setzt `activeGroupId`)
- Modify: `tests/helpers/group.ts` (`createMember` akzeptiert `activeGroupId?: string | null`)
- Test: `tests/integration/active-membership.test.ts` (neu), `tests/integration/group-join.test.ts`, `tests/integration/group-create.test.ts` (je eine Assertion)

**Interfaces:**
- Produces: `findActiveMembership(db, playerId): Promise<{ groupId: string; role: GroupRole } | null>` – Signatur unverändert, Auswahl nach den Global Constraints. Alle Aufrufer (Login, Token-Refresh) profitieren ohne Änderung.
- Produces: `joinGroup` setzt nach `joined`/`reactivated` `player.activeGroupId = groupId`; `createGroup` setzt `activeGroupId = group.id` in derselben Transaktion.

- [ ] **Step 1: Failing Tests**:

```ts
// active-membership.test.ts
it("returns the membership of activeGroupId when it is active")
it("falls back to the newest membership when activeGroupId points to a removed membership")
it("falls back to the newest membership when activeGroupId is null and to null without memberships")
it("ignores an activeGroupId of a group the player never joined")
// group-join.test.ts (zusätzlich)
it("joinGroup sets activeGroupId to the joined group on join and on reactivation")
// group-create.test.ts (zusätzlich)
it("createGroup sets the founder's activeGroupId to the new group")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/integration/active-membership.test.ts tests/integration/group-join.test.ts tests/integration/group-create.test.ts` → FAIL
- [ ] **Step 3: Schema, Migration** (`pnpm prisma migrate dev --name active_group --create-only`, Ordner umbenennen, anwenden; SQL nur `ALTER TABLE ADD COLUMN`, Index, FK), **Implementierung** gemäß Interfaces.
- [ ] **Step 4: Run** → PASS; dazu `pnpm vitest run tests/integration/auth.test.ts tests/integration/refresh-lookup.test.ts tests/integration/invitation-redeem.test.ts` → PASS
- [ ] **Step 5: Commit** `Aktive Gruppe je Konto`

---

### Task 2: Aktive Gruppe wechseln (Lib + Route)

**Files:**
- Create: `src/lib/group/active-group.ts`, `src/app/api/profile/active-group/route.ts`
- Test: `tests/integration/active-group.test.ts`, `tests/integration/api-active-group.test.ts`

**Interfaces:**
- Produces: `class NotAMemberError extends Error`; `setActiveGroup(i: { playerId: string; groupId: string }): Promise<void>` – aktive Mitgliedschaft in der Gruppe nötig, sonst `NotAMemberError`; setzt `activeGroupId`.
- Produces: `listMyGroups(playerId: string): Promise<{ id: string; name: string; role: GroupRole }[]>` – aktive Mitgliedschaften, nach Gruppenname sortiert.
- Produces: `PATCH /api/profile/active-group` – Session Pflicht (401); Body `{ groupId: z.string().uuid() }` (400); `NotAMemberError` → 403 `forbidden`; 204.

- [ ] **Step 1: Failing Tests**:

```ts
it("setActiveGroup stores the group for an active member and rejects a removed member and a stranger")
it("listMyGroups lists only active memberships sorted by name with roles")
it("PATCH /api/profile/active-group 401 without session, 403 for a foreign group, 204 and findActiveMembership returns it afterwards")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Aktive Gruppe wechseln`

---

### Task 3: Gruppenwechsler in der Navigation

**Files:**
- Create: `src/components/group-switcher.tsx`
- Modify: `src/components/app-shell.tsx` (lädt `listMyGroups`, reicht `groups` und `activeGroupId` durch), `src/components/top-nav.tsx`, `src/components/mobile-top-bar.tsx`
- Test: `tests/components/group-switcher.test.tsx`, `tests/components/top-nav.test.tsx` und `tests/components/mobile-top-bar.test.tsx` (erweitern)

**Interfaces:**
- Consumes: `listMyGroups`, `session.user.groupId`.
- Produces: `GroupSwitcher({ groups: { id: string; name: string }[]; activeGroupId: string | null })` (Client). Eine Gruppe: nur der Name als `<span>` (`text-sm font-semibold text-foreground-muted`, `truncate`, max. 40 Zeichen). Mehrere: Button mit Gruppenname und `ChevronDown` (lucide, `aria-haspopup="menu"`, `aria-expanded`), Menü wie `UserMenu` (`role="menu"`, Einträge `role="menuitemradio"` mit `aria-checked`), Klick → `PATCH /api/profile/active-group` → `router.refresh()`; während des Wechsels Button `disabled`; Fehler → `InlineMessage` unter dem Menü „Wechsel fehlgeschlagen." Keine Gruppe: nichts rendern.
- TopNav: `GroupSwitcher` rechts neben dem Markennamen; MobileTopBar: links (`justify-between` statt `justify-end`).

- [ ] **Step 1: Failing Tests**:

```ts
it("renders only the name for one group and no button")
it("renders a menu for two groups, marks the active one, and patches then refreshes on select")
it("shows an error when the patch fails")
it("TopNav and MobileTopBar render the switcher with the given groups")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**; `router.refresh` über `vi.mock("next/navigation")` prüfen.
- [ ] **Step 4: Run** → PASS; lokal: zwei Gruppen per `pnpm seed:demo --group …` (Task 8) oder per Gründer-Link, Wechsel im Browser prüfen.
- [ ] **Step 5: Commit** `Gruppenwechsler in der Navigation`

---

### Task 4: Rolle „Mitglied / Admin" statt Haken

**Files:**
- Modify: `src/lib/players/update.ts` (`fields.role`), `src/app/api/players/[id]/route.ts` (`PatchSchema.role`), `src/app/admin/edit-player-dialog.tsx`
- Test: `tests/integration/players-update.test.ts`, `tests/unit/components/edit-player-dialog.test.tsx` (erweitern)

**Interfaces:**
- Produces: `UpdatablePlayerFields.role?: "member" | "admin"`; `role` hat Vorrang vor `isAdmin`; Regeln und Audit wie bisher (`changedFields` enthält `isAdmin`, zusätzlich `role` in `before`/`after`).
- Produces: `PATCH /api/players/[id]` akzeptiert `role: z.enum(["member", "admin"]).optional()`.
- Dialog: `<select>` mit `Label` „Rolle" und Optionen „Mitglied" / „Admin"; für den Besitzer stattdessen `Badge` „Besitzer" und kein Select; Diff sendet `role` statt `isAdmin`. Fehlertexte wie bisher.

- [ ] **Step 1: Failing Tests**:

```ts
it("updatePlayer with role admin promotes, with role member demotes, and role wins over isAdmin")
it("PATCH role member on the owner → 409 owner_protected; on the last admin → 409 last_admin")
it("dialog shows a role select for members and the owner badge for the owner, and sends role on change")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Rolle als Auswahl statt Admin-Haken`

---

### Task 5: Besitz übertragen

**Files:**
- Create: `src/lib/group/transfer.ts`, `src/app/api/groups/active/transfer-owner/route.ts`, `src/app/admin/transfer-owner-dialog.tsx`
- Modify: `src/lib/auth/route-guard.ts` (`guardOwner`), `src/app/admin/players-section.tsx` (Button „Besitz übertragen" nur für Besitzer, Prop `viewerRole`), `src/app/admin/page.tsx` (Prop)
- Test: `tests/integration/group-transfer.test.ts`, `tests/integration/api-group-transfer.test.ts`, `tests/unit/components/transfer-owner-dialog.test.tsx`

**Interfaces:**
- Produces: `guardOwner(): Promise<GuardResult>` (401/403 wie `guardGroupAdmin`, Rolle muss `owner` sein).
- Produces: `transferOwnership(i: { groupId: string; actorId: string; newOwnerId: string }): Promise<void>` – Transaktion: Actor ist Besitzer (sonst `ForbiddenError` aus `@/lib/auth/group-context`), Ziel hat aktive Mitgliedschaft (sonst `PlayerNotFoundError` aus `@/lib/players/errors`), Ziel ≠ Actor (`SelfTransferError`); Ziel → `owner`, Actor → `admin`, beide per `updateMany` mit Rollen-Bedingung (`where: { …, role: "owner" }` für den Actor) und `count`-Prüfung; Audit `group.transfer_owner`.
- Produces: `POST /api/groups/active/transfer-owner` – `guardOwner`; Body `{ playerId: z.string().uuid() }`; 404 `not_found`, 409 `self_transfer`; 204.
- Dialog: Titel „Besitz übertragen", Text „{Name} wird Besitzer der Gruppe. Du wirst Admin.", Bestätigung per Button „Besitz übertragen" (primary), „Abbrechen"; nach 204 `router.refresh()`.

- [ ] **Step 1: Failing Tests**:

```ts
it("transferOwnership makes the target owner, the actor admin, writes audit, and exactly one owner remains")
it("transferOwnership rejects a non-owner actor, a removed target, a stranger, and self")
it("concurrent transfer and removal of the target: exactly one owner remains (allSettled)")
it("POST /api/groups/active/transfer-owner 403 for admin, 204 for owner, 409 self_transfer")
it("dialog confirms and posts the playerId")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Besitz übertragen`

---

### Task 6: Gruppe umbenennen und löschen

**Files:**
- Create: `src/lib/group/rename.ts`, `src/lib/group/delete.ts`, `src/app/api/groups/active/route.ts` (PATCH, DELETE), `src/app/admin/group-section.tsx`, `src/app/admin/delete-group-dialog.tsx`
- Modify: `src/app/admin/page.tsx` (Abschnitt „Gruppe" ganz unten, nur `ctx.role === "owner"`)
- Test: `tests/integration/group-rename.test.ts`, `tests/integration/group-delete.test.ts`, `tests/integration/api-group.test.ts`, `tests/unit/components/delete-group-dialog.test.tsx`

**Interfaces:**
- Produces: `renameGroup(i: { groupId: string; actorId: string; name: string }): Promise<{ name: string }>` – trimmt, Audit `group.rename` (payload `{ from, to }`), Slug bleibt.
- Produces: `class NameMismatchError`, `class WrongPasswordError`; `deleteGroup(i: { groupId: string; actorId: string; name: string; password: string }): Promise<void>` – Besitzer-Prüfung (`ForbiddenError`), Name exakt, Passwort über `verifyPassword` gegen `Player.passwordHash` (Konto ohne Passwort → `WrongPasswordError`); dann Transaktion in der FK-Reihenfolge der Global Constraints, globales Audit zuerst.
- Produces: `PATCH /api/groups/active` – `guardOwner`; Body `{ name: groupNameField }`; 200 `{ name }`. `DELETE /api/groups/active` – `guardOwner`; Limit 5/h pro Konto; Body `{ name: z.string(), password: z.string().min(1) }`; 400 `name_mismatch`, 403 `wrong_password`; 204.
- UI `group-section.tsx` (Client): Karte „Gruppe" mit Feld „Gruppenname" + Button „Umbenennen" (PATCH, danach `router.refresh()`, Erfolg `InlineMessage` „Gespeichert."), darunter Button „Gruppe löschen" (destruktiv) → `DeleteGroupDialog` mit Text „Das löscht alle Spieltage, Ergebnisse und Einladungen von {name}. Die Konten der Mitglieder bleiben.", Feld „Gruppenname zur Bestätigung", Feld „Dein Passwort", Button „Endgültig löschen" erst aktiv, wenn der Name übereinstimmt; nach 204 `window.location.assign("/")`. Fehlertexte: 400 „Der Name stimmt nicht.", 403 „Passwort falsch.", 429 „Zu viele Versuche, bitte später.", sonst generisch.

- [ ] **Step 1: Failing Tests**:

```ts
it("renameGroup trims, keeps the slug, writes audit group.rename")
it("deleteGroup removes jokers, matches, participants, game days, seasons, invitations and uses, memberships, the group's audit rows and the group; writes a global audit group.delete with counts")
it("deleteGroup leaves another group, its players, avatars and founder InvitationUse rows untouched; foundedGroupId becomes null; members' activeGroupId becomes null")
it("deleteGroup rejects wrong name, wrong password, account without password, and a non-owner actor without deleting anything")
it("PATCH /api/groups/active 403 for admin, 200 for owner; DELETE 400 name_mismatch, 403 wrong_password, 204 then group gone")
it("dialog enables the delete button only when the name matches and posts name and password")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS; dazu `pnpm vitest run tests/integration/game-day-group-scope.test.ts` → PASS
- [ ] **Step 5: Commit** `Gruppe umbenennen und löschen`

---

### Task 7: Gruppe verlassen

**Files:**
- Create: `src/lib/group/leave.ts`, `src/app/api/profile/leave-group/route.ts`, `src/app/profil/leave-group-button.tsx`
- Modify: `src/app/profil/page.tsx` (Karte „Gruppe": Name der aktiven Gruppe, Rolle als `Badge`, Button; für Besitzer stattdessen Hinweis „Als Besitzer kannst du die Gruppe nicht verlassen. Übertrage den Besitz im Admin-Bereich.")
- Test: `tests/integration/group-leave.test.ts`, `tests/integration/api-leave-group.test.ts`, `tests/components/leave-group-button.test.tsx`

**Interfaces:**
- Consumes: `countOtherAdmins`, `findGroupMembership`, `ActiveParticipationError` (aus `@/lib/players/delete`), `LastAdminError`, `OwnerProtectedError`.
- Produces: `leaveGroup(i: { groupId: string; playerId: string }): Promise<void>` – Regeln der Global Constraints; Transaktion; Audit `membership.leave` (actor = player, groupId, entityType "Group", entityId groupId); `activeGroupId` → null, wenn es diese Gruppe war.
- Produces: `POST /api/profile/leave-group` – `guardMember` (401/403); Body leer; 409 `owner_protected` | `last_admin` | `active_participation`; 204.
- Button (Client): „Gruppe verlassen" (destruktiv) → Inline-Bestätigung „Wirklich verlassen?" + „Ja, verlassen" / „Abbrechen"; nach 204 `window.location.assign("/")`; 409-Texte: owner_protected „Als Besitzer kannst du die Gruppe nicht verlassen.", last_admin „Du bist der letzte Admin. Ernenne zuerst einen anderen.", active_participation „Du bist für einen Spieltag eingeplant. Sag erst ab."

- [ ] **Step 1: Failing Tests**:

```ts
it("leaveGroup sets removedAt, clears activeGroupId, writes audit membership.leave, and the next findActiveMembership returns the other group")
it("leaveGroup rejects owner, last admin, and confirmed participation on a planned day without changes")
it("POST /api/profile/leave-group 204 for a member, 409 codes as specified")
it("button confirms, posts, navigates to / on 204, and shows the three 409 texts")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Gruppe verlassen`

---

### Task 8: Skripte für mehrere Gruppen

**Files:**
- Modify: `src/lib/group/sole-group.ts` (Fehlermeldung nennt `--group <slug>`), `scripts/bootstrap-admin.ts`, `scripts/tenancy-set-owner.ts`, `scripts/seed-demo.ts`, `scripts/seed-initial.ts`, `scripts/import-historical.ts`, `scripts/import-statistik.ts`
- Create: `src/lib/group/resolve-group.ts`
- Modify: `docs/DEPLOYMENT.md` (§4.6 und §10: `--group <slug>`), `README.md` (Absatz Gruppen)
- Test: `tests/integration/resolve-group.test.ts`, `tests/integration/bootstrap-admin.test.ts` und `tests/integration/set-owner.test.ts` (erweitern)

**Interfaces:**
- Produces: `resolveGroup(argv: string[]): Promise<Group>` – liest `--group <slug>` (`parseArgs`, `allowPositionals: true`); mit Slug: `group.findUnique({ where: { slug } })` sonst `GroupNotFoundError`; ohne Slug: `getSoleGroup()`.
- Produces: `bootstrapAdmin(input: { email; name; password; groupId?: string })` – mit `groupId` keine `getSoleGroup`-Erzeugung.
- Alle sechs Skripte: Positionsargumente wie bisher, zusätzlich `--group <slug>`; Seeds und Importe setzen `emailVerifiedAt: new Date()` bei angelegten Spielern (Follow-up 15); `seed-demo.ts` hängt mit `--group` die Demo-Spieler an die genannte Gruppe (Mitgliedschaften upsert wie heute).

- [ ] **Step 1: Failing Tests**:

```ts
it("resolveGroup returns the group for --group <slug>, throws GroupNotFoundError for an unknown slug, and falls back to getSoleGroup")
it("bootstrapAdmin with groupId joins that group as admin (or owner when it has none) and creates no group")
it("setGroupOwner is unchanged; the CLI passes the resolved group (smoke via resolveGroup)")
it("seedDemo creates players with emailVerifiedAt set")  // seed-demo.ts exportiert `seedDemo(groupId: string)`, main() nur bei direktem Aufruf (Muster scripts/invite-founder.ts)
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**; Doku ergänzen.
- [ ] **Step 4: Run** → PASS; lokal: `pnpm seed:demo` (eine Gruppe) und nach Anlegen einer zweiten Gruppe `pnpm seed:demo` ohne Flag → Abbruch mit Hinweis, mit `--group padelmaestro` → läuft.
- [ ] **Step 5: Commit** `Skripte mit --group für mehrere Gruppen`

---

### Task 9: Migrationsprobe, Gesamtlauf, PR

**Files:**
- Create: `docs/superpowers/plans/2026-11-03-public-use-pr3-rehearsal.md`

- [ ] **Step 1: Probe** wie in `docs/superpowers/plans/2026-11-03-public-use-pr2-rehearsal.md` gegen den Dump `/root/backups/2026-11-03-pre-public-2/db.dump` (Stand vor PR 2; `migrate deploy` wendet `20261104100000_invitations` und `20261105100000_active_group` an), Wegwerf-Container, Zeilenzahlen vorher/nachher, Spalte `activeGroupId` (alle null), FK `SET NULL`, kein Drift, Dauer.
- [ ] **Step 2: Dokument** mit Deploy-Ablauf (Vorab-Prüfung: letzte Migration `20261104100000_invitations`; kein `.env`-Eintrag; Dump nach `/root/backups/<datum>-pre-public-3/`; `deploy.sh`; Checks: Dienst, `/login` 200, `/profil` 307, Navigation zeigt „Padelmaestro" als Gruppenname nach Login; Zeilenzahlen) und Rollback (Spalte darf bleiben; Revert auf `main` + `deploy.sh`).
- [ ] **Step 3: Gesamtlauf**: `pnpm lint && pnpm test && AUTH_SECRET=$(openssl rand -base64 32) pnpm build` → grün.
- [ ] **Step 4: Commit** `Migrationsprobe PR 3`, Push, PR `Öffentliche Nutzung PR 3: Gruppen` mit Rulings, Deploy-Hinweisen und Prüfung.
