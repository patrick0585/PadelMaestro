# Phase 2, PR 5 „Rechtstexte" – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Öffentliche Seiten `/impressum`, `/datenschutz`, `/nutzungsbedingungen` mit Patricks Texten, Fußzeilen-Links auf den öffentlichen Seiten und im Profil.

**Architecture:** Inhalte als einfache TSX-Blöcke unter `src/content/legal/` (ein Modul je Seite, exportiert `title`, `updatedAt` und eine Komponente), eine gemeinsame Seitenhülle `LegalPage` (öffentlich, ohne Login), eine `LegalFooter`-Komponente mit den drei Links. Solange die Inhaltsmodule Platzhalter enthalten, bleibt der PR offen und wird nicht gemerged (Spec: „solange Platzhalter drin sind, bleibt der PR unmerged").

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind, vitest 4 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-02-public-use-design.md` (Abschnitt „Rechtstexte und öffentliche Seiten", „PR-Folge" Punkt 5).

**Rulings des Planers:**

- Inhalte als TSX, nicht MDX (kein neues Tooling für drei Seiten).
- Die Platzhalter-Seiten aus PR 2 (`/datenschutz`, `/nutzungsbedingungen`) werden durch die neue Hülle ersetzt; der „Zurück"-Link entfällt, stattdessen die Fußzeile mit allen drei Links und „Zur Anmeldung".
- Platzhalter-Text ist unübersehbar markiert („PLATZHALTER – Text folgt vor dem Beta-Start") und wird durch einen Test erkannt, der fehlschlägt, solange ein Modul `PLACEHOLDER = true` exportiert; dieser Test wird vor dem Merge grün, wenn die Texte drin sind.
- Kein Flag, kein Navigationspunkt (Spec).

## Global Constraints

- Branch `feat/public-5-legal`. Kein Merge, solange Platzhalter drin sind; kein Deploy ohne Patricks Go.
- Seiten öffentlich ohne Login, gleiche Hülle wie die anderen öffentlichen Seiten (zentriert, `max-w-2xl` für Fließtext, Karte `rounded-2xl border border-border bg-surface p-6`), Überschrift `h1`, Zwischenüberschriften `h2`, Stand-Datum („Stand: <Datum>") unter der Überschrift.
- Fußzeile `LegalFooter`: Links „Impressum", „Datenschutz", „Nutzungsbedingungen" (min. 44 px Tap-Ziel, Fokusring), auf: `/login`, `/einladung/[token]`, `/passwort-vergessen`, `/passwort-zuruecksetzen/[token]`, `/email-bestaetigen/[token]`, `/gruppe/neu`, `/profil` (unten) und auf den drei Rechtsseiten selbst (dort zusätzlich „Zur Anmeldung"). Keine Fußzeile in der App-Navigation sonst.
- Inhaltsmodule exportieren `export const title: string`, `export const updatedAt: string` (ISO-Datum), `export const PLACEHOLDER: boolean`, `export default function Content()`.
- Texte Deutsch; nirgendwo Claude/Anthropic-Hinweise; Commit-Messages kurz, Deutsch, ohne Präfix.

## Review Focus

1. Die Checkbox der Registrierung verlinkt weiter auf `/nutzungsbedingungen` und `/datenschutz` und öffnet sie in neuem Tab; die Seiten rendern ohne Login. (Test in Task 1.)
2. Platzhalter-Erkennung: ein Modul mit `PLACEHOLDER = true` lässt den Test `legal-content.test.ts` fehlschlagen, mit `false` ist er grün. (Task 1.)
3. Fußzeile auf jeder genannten Seite genau einmal, auch auf Seiten mit Fehlerzustand (ungültiger Token). (Task 2.)
4. Lange Texte am Handy: Zeilenlänge und Abstände lesbar, keine horizontale Scrollleiste. (Design-Review in Task 1.)
5. `updatedAt` wird als deutsches Datum angezeigt, nicht als ISO-String. (Task 1.)

---

### Task 1: Inhaltsmodule, Seitenhülle, drei Seiten

**Files:**
- Create: `src/content/legal/impressum.tsx`, `src/content/legal/datenschutz.tsx`, `src/content/legal/nutzungsbedingungen.tsx`, `src/components/legal-page.tsx`, `src/app/impressum/page.tsx`
- Modify: `src/app/datenschutz/page.tsx`, `src/app/nutzungsbedingungen/page.tsx` (auf `LegalPage` umstellen)
- Test: `tests/unit/legal-content.test.ts`, `tests/components/legal-page.test.tsx`

**Interfaces:**
- Produces: Inhaltsmodule nach den Global Constraints; Platzhalter-Inhalt: ein Absatz „PLATZHALTER – Text folgt vor dem Beta-Start." in `text-destructive font-semibold` plus eine Gliederung der erwarteten Abschnitte (Impressum: Anbieter, Kontakt, Verantwortlich; Datenschutz: Verantwortlicher, Hosting (IONOS, Deutschland), Mailversand (Resend), gespeicherte Daten, Cookies, Betroffenenrechte inkl. Export und Löschung im Profil; Nutzungsbedingungen: Zweck, Konto, Verhalten, Haftung, Kündigung) aus `docs/legal/datenschutz-stichpunkte.md`.
- Produces: `LegalPage({ title, updatedAt, children })` – Server-Komponente, Hülle mit `PadelLogo`, `h1`, „Stand: {Datum de-DE}", Inhalt, `LegalFooter` (aus Task 2; in Task 1 zunächst ein lokaler Platzhalter-Link „Zur Anmeldung", Task 2 ersetzt ihn).
- Produces: `/impressum` neu; `/datenschutz` und `/nutzungsbedingungen` nutzen `LegalPage` und das jeweilige Modul.

- [ ] **Step 1: Failing Tests**:

```ts
// legal-content.test.ts
it("every legal module exports title, updatedAt (ISO date) and a Content component")
it("no legal module is still a placeholder")   // bleibt absichtlich rot, bis die Texte drin sind (Merge-Sperre)
// legal-page.test.tsx
it("renders title, German date and the content, without requiring a session")
```

- [ ] **Step 2: Run** `pnpm vitest run tests/unit/legal-content.test.ts tests/components/legal-page.test.tsx` → FAIL
- [ ] **Step 3: Implementieren** (der Platzhalter-Test bleibt absichtlich rot, solange `PLACEHOLDER = true`; im Report ausweisen)
- [ ] **Step 4: Run** → PASS bis auf den Platzhalter-Test; `AUTH_SECRET=$(openssl rand -base64 32) pnpm build` → drei Routen gelistet
- [ ] **Step 5: Commit** `Rechtsseiten mit Inhaltsmodulen`

---

### Task 2: Fußzeile mit Rechtslinks

**Files:**
- Create: `src/components/legal-footer.tsx`
- Modify: `src/components/legal-page.tsx`, `src/app/login/page.tsx`, `src/app/einladung/[token]/page.tsx`, `src/app/passwort-vergessen/page.tsx`, `src/app/passwort-zuruecksetzen/[token]/page.tsx`, `src/app/email-bestaetigen/[token]/page.tsx`, `src/app/gruppe/neu/page.tsx`, `src/app/profil/page.tsx`
- Test: `tests/components/legal-footer.test.tsx`, bestehende Seiten-Tests erweitern (`tests/unit/components/invitation-page.test.tsx`, `tests/unit/components/no-group-pages.test.tsx` für `/profil`)

**Interfaces:**
- Produces: `LegalFooter({ showLogin?: boolean })` – `<nav aria-label="Rechtliches">` mit drei Links (`text-xs text-foreground-muted`, `min-h-11`, Fokusring), optional „Zur Anmeldung" (nur auf den Rechtsseiten); Abstand `mt-6`.
- Seiten: Fußzeile unter der Karte (öffentliche Seiten) bzw. unter der letzten Karte (Profil).

- [ ] **Step 1: Failing Tests**:

```ts
it("LegalFooter renders the three links and the login link only when showLogin")
it("invitation page (invalid and valid state) and profile page render the footer exactly once")
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implementieren**
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `Fußzeile mit Rechtslinks`

---

### Task 3: Texte einsetzen, Doku, Gesamtlauf, PR

**Files:**
- Modify: die drei Inhaltsmodule (Patricks Texte, `PLACEHOLDER = false`, `updatedAt`), `README.md` (Absatz Rechtsseiten: wo die Texte liegen), `docs/DEPLOYMENT.md` §4.6 (ein Satz: Rechtstexte unter `src/content/legal/`, Änderung = Deploy)

- [ ] **Step 1: Texte** von Patrick einsetzen (dieser Schritt wartet auf ihn; bis dahin bleibt der PR als Entwurf offen).
- [ ] **Step 2: Gesamtlauf**: `pnpm lint && pnpm test && AUTH_SECRET=$(openssl rand -base64 32) pnpm build` → grün (inklusive Platzhalter-Test).
- [ ] **Step 3: Commit** `Rechtstexte eingesetzt`, Push, PR `Öffentliche Nutzung PR 5: Rechtstexte` (Deploy ohne Migration; danach Beta-Start mit zwei Gründer-Links).
