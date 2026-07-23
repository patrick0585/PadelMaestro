# Teamwork mit allen Partnern — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Teamwork-Sektion auf der Startseite zeigt alle Partner der Saison — die zwei bekannten Highlight-Karten bleiben, darunter kommt eine Kompaktliste der übrigen Partner (Design-Variante B).

**Architecture:** Die Datenschicht (`computePlayerSeasonStats`) berechnet bereits alle Partner und verwirft sie am Ende — sie exponiert künftig zusätzlich `partners: PartnerStat[]` (sortiert wie `bestSorted`). Die Server-Komponente `page.tsx` filtert best/worst heraus und rendert den Rest als Liste. Keine neuen Queries, keine Schemaänderung.

**Tech Stack:** Next.js App Router (Server Component), Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-23-teamwork-all-partners-design.md` (freigegeben).

## Global Constraints

- Sortierung: Gesamtpunkte absteigend → Matches absteigend → Name (`localeCompare` de) — exakt die bestehende `bestSorted`-Logik, wiederverwenden statt duplizieren.
- UI-Texte deutsch; Zeilenformat der Restliste: `X Pt · Y M` (tabular-nums, muted), Avatar 32px, Name fett.
- `bestPartner`/`worstPartner` und deren Tie-Guard bleiben unverändert.
- Keine Co-Authored-By-/Claude-Trailer in Commits.
- Tests gegen lokale Postgres :5433 (`docker compose -f docker-compose.dev.yml up -d`); `pnpm test` wischt die lokale DB — vor einer Demo neu seeden.
- Branch: `feat/teamwork-all-partners` (existiert, Spec liegt darauf).

---

### Task 1: Datenschicht — `partners`-Liste

**Files:**
- Modify: `src/lib/player/season-stats.ts` (Interface `PlayerSeasonStats` ~Zeile 30-38; Rückgabe ~Zeile 255-267)
- Test: `tests/integration/player-season-stats.test.ts`

**Interfaces:**
- Produces: `PlayerSeasonStats.partners: PartnerStat[]` — alle Partner der Saison, sortiert nach Punkten/Matches/Name; `partners[0]` ist identisch mit `bestPartner` (falls vorhanden). `PartnerStat` bleibt `{ playerId, name, avatarVersion, pointsTogether, matches }`.

- [ ] **Step 1: Failing Tests schreiben**

In `tests/integration/player-season-stats.test.ts`:

(a) Im bestehenden Test „returns empty stats when the player has no activity" das `toEqual`-Objekt um `partners: []` ergänzen (nach `worstPartner: null`):

```ts
      bestPartner: null,
      worstPartner: null,
      partners: [],
```

(b) Neuen Test ergänzen (neben den bestehenden bestPartner/worstPartner-Tests):

```ts
  it("returns all partners sorted by points, matches, then name", async () => {
    const season = await makeSeason();
    const [me, anna, ben, carl] = await Promise.all(
      ["Me", "Anna", "Ben", "Carl"].map(makePlayer),
    );
    const day = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-05-01"), playerCount: 4, status: "finished" },
    });
    // Mit Anna: 2 Matches, 5+1=6 Punkte; mit Ben: 1 Match, 6 Punkte; mit Carl: 1 Match, 2 Punkte.
    await prisma.match.createMany({
      data: [
        {
          gameDayId: day.id, matchNumber: 1,
          team1PlayerAId: me.id, team1PlayerBId: anna.id,
          team2PlayerAId: ben.id, team2PlayerBId: carl.id,
          team1Score: 5, team2Score: 0,
        },
        {
          gameDayId: day.id, matchNumber: 2,
          team1PlayerAId: anna.id, team1PlayerBId: me.id,
          team2PlayerAId: ben.id, team2PlayerBId: carl.id,
          team1Score: 1, team2Score: 6,
        },
        {
          gameDayId: day.id, matchNumber: 3,
          team1PlayerAId: me.id, team1PlayerBId: ben.id,
          team2PlayerAId: anna.id, team2PlayerBId: carl.id,
          team1Score: 6, team2Score: 0,
        },
        {
          gameDayId: day.id, matchNumber: 4,
          team1PlayerAId: carl.id, team1PlayerBId: me.id,
          team2PlayerAId: anna.id, team2PlayerBId: ben.id,
          team1Score: 2, team2Score: 6,
        },
      ],
    });

    const stats = await computePlayerSeasonStats(me.id, season.id);

    // Anna 6 Pt/2 M und Ben 6 Pt/1 M sind punktgleich → mehr Matches zuerst.
    expect(stats.partners.map((p) => [p.name, p.pointsTogether, p.matches])).toEqual([
      ["Anna", 6, 2],
      ["Ben", 6, 1],
      ["Carl", 2, 1],
    ]);
    // Konsistenz: erstes Element == bestPartner.
    expect(stats.partners[0]).toEqual(stats.bestPartner);
  });
```

- [ ] **Step 2: Tests laufen rot**

Run: `pnpm vitest run tests/integration/player-season-stats.test.ts`
Expected: FAIL — der Empty-Test scheitert am fehlenden `partners`-Feld, der neue Test an `stats.partners === undefined`.

- [ ] **Step 3: Implementierung**

In `src/lib/player/season-stats.ts`:

(a) Interface erweitern (nach `worstPartner`):

```ts
export interface PlayerSeasonStats {
  medals: { gold: number; silver: number; bronze: number };
  attendance: { attended: number; total: number };
  winRate: { wins: number; losses: number; draws: number; matches: number };
  recentDays: DayTrend[];
  bestPartner: PartnerStat | null;
  worstPartner: PartnerStat | null;
  partners: PartnerStat[];
  jokers: { used: number; remaining: number; total: number };
}
```

(b) Im Rückgabeobjekt am Funktionsende (`bestSorted` und `stripId` existieren dort bereits) nach `worstPartner` ergänzen:

```ts
    bestPartner,
    worstPartner,
    partners: bestSorted.map(stripId),
```

- [ ] **Step 4: Tests grün**

Run: `pnpm vitest run tests/integration/player-season-stats.test.ts && pnpm tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/player/season-stats.ts tests/integration/player-season-stats.test.ts
git commit -m "feat(stats): expose full sorted partner list in player season stats"
```

---

### Task 2: UI — Restliste in der Teamwork-Sektion

**Files:**
- Modify: `src/app/page.tsx` (Teamwork-Sektion, ~Zeile 175-215)

**Interfaces:**
- Consumes: `stats.partners: PartnerStat[]` aus Task 1; `stats.bestPartner`/`stats.worstPartner` (unverändert).

- [ ] **Step 1: Restliste einbauen**

In `src/app/page.tsx`, innerhalb des `{stats.bestPartner && (...)}`-Blocks, direkt nach dem schließenden `</div>` des `grid grid-cols-2`-Containers (nach dem worstPartner-Ternary) und vor dem schließenden `</div>` der Sektion, einfügen:

```tsx
          {(() => {
            const rest = stats.partners.filter(
              (p) =>
                p.playerId !== stats.bestPartner?.playerId &&
                p.playerId !== stats.worstPartner?.playerId,
            );
            if (rest.length === 0) return null;
            return (
              <ul className="mt-3 space-y-1 border-t border-border pt-2">
                {rest.map((p) => (
                  <li key={p.playerId} className="flex items-center gap-3 py-1 text-sm">
                    <Avatar
                      playerId={p.playerId}
                      name={p.name}
                      avatarVersion={p.avatarVersion}
                      size={32}
                    />
                    <span className="flex-1 font-semibold text-foreground">{p.name}</span>
                    <span className="tabular-nums text-xs text-foreground-muted">
                      {p.pointsTogether} Pt · {p.matches} M
                    </span>
                  </li>
                ))}
              </ul>
            );
          })()}
```

Hinweis: `Avatar` ist in `page.tsx` bereits importiert. Das IIFE-Muster hält die Filterung lokal zur Sektion; alternativ ist eine `const restPartners = ...` vor dem `return` der Komponente gleichwertig — dann bitte oberhalb von `return` platzieren, nicht im JSX.

- [ ] **Step 2: Verifikation**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: alles grün (die Sektion hat keine eigenen Component-Tests; die Datenlogik ist durch Task 1 abgedeckt).

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(dashboard): show remaining partners below teamwork highlight cards"
```

---

### Task 3: Verifikation & Live-Demo

**Files:** keine neuen — Verifikations-Task.

- [ ] **Step 1: Demo-Daten aufsetzen**

Nach `pnpm test` ist die lokale DB leer:

```bash
pnpm seed:demo
pnpm bootstrap:admin patrick@padel.local "Patrick"   # Temp-Passwort sofort an Patrick durchgeben
```

Damit die Restliste sichtbar wird, braucht der Demo-User Matches mit 3+ verschiedenen Partnern — einen fertigen Spieltag mit entsprechenden Paarungen per Wegwerf-Skript im Scratchpad seeden (Muster: Session-Skript `seed-finished-day.ts` mit `import { prisma } from ".../src/lib/db"`), z. B. 4 Matches des eingeloggten Users mit 3 verschiedenen Partnern.

- [ ] **Step 2: Dev-Server starten und Demo-Drehbuch**

```bash
pnpm dev
```

1. Als Demo-User einloggen → Startseite.
2. Teamwork-Sektion: zwei Highlight-Karten wie bisher, darunter Trennlinie + Restliste (punktabsteigend, `X Pt · Y M`).
3. Gegenprobe Edge Case: Als User mit nur 1–2 Partnern (z. B. zweiter Demo-User) → keine Restliste, Layout unverändert.

- [ ] **Step 3: Review-Fan-out + Abschluss**

Standard-Fan-out (`reviewer` + `test-engineer` + `refactor-cleanup` + `design-reviewer` wegen UI) auf den Branch-Diff; Befunde beheben. Danach `superpowers:finishing-a-development-branch` (Patrick entscheidet: Merge/PR).
