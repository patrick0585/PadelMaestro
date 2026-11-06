/**
 * Baut die Beispiel-Runde für die App-Store-Screenshots (nur lokal).
 * Idempotent: räumt die eigene Gruppe und ihre Spieler vorher weg.
 * Aufruf: pnpm tsx scripts/dev/seed-store-screenshots.ts
 */
import { prisma } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/auth/hash";
import { createGameDay } from "../../src/lib/game-day/create";
import { startGameDay } from "../../src/lib/game-day/start";
import { finishGameDay } from "../../src/lib/game-day/finish";
import { enterScore } from "../../src/lib/match/enter-score";
import { recordJokerUse } from "../../src/lib/joker/use";
import { assignPlayersToTemplate, sortPlayersForAssignment } from "../../src/lib/pairings/assign";

export const SCREENSHOT_EMAIL = "markus.kramer@padelmaestro.example";
export const SCREENSHOT_PASSWORD = "Padel-Screens-2026";
const DOMAIN = "@padelmaestro.example";
const SLUG = "donnerstagsrunde-muenster";

// skill: Grundstärke, drift: Formkurve über die Saison (pro Spieltag dazu)
const ROSTER = [
  { name: "Markus", mail: SCREENSHOT_EMAIL, role: "owner", skill: 0.55, drift: 0.02 },
  { name: "Lena", mail: `lena.hoffmann${DOMAIN}`, role: "admin", skill: 0.9, drift: -0.02 },
  { name: "Timo", mail: `timo.brandt${DOMAIN}`, role: "member", skill: 0.2, drift: 0.07 },
  { name: "Jonas", mail: `jonas.weber${DOMAIN}`, role: "member", skill: 0.65, drift: 0.0 },
  { name: "Finn", mail: `finn.schulte${DOMAIN}`, role: "member", skill: 0.0, drift: 0.01 },
  { name: "Sophie", mail: `sophie.lange${DOMAIN}`, role: "member", skill: 0.1, drift: -0.03 },
  { name: "Felix", mail: `felix.vogel${DOMAIN}`, role: "member", skill: -0.25, drift: 0.04 },
  { name: "Anna", mail: `anna.richter${DOMAIN}`, role: "member", skill: -0.4, drift: 0.0 },
] as const;

// Donnerstage bis gestern, älteste zuerst; heute läuft der neunte Spieltag
const FINISHED_DAYS_AGO = [49, 42, 35, 28, 21, 14, 7, 1];
// Wer fehlt an welchem Spieltag (Index in ROSTER); bei 6 Anwesenden zwei, bei 5 drei
const ABSENT: number[][] = [[6, 7], [2, 5], [4, 7], [1, 6, 7], [3, 5], [4, 6], [2, 7], [5, 7]];
const TODAY_ABSENT = [6, 7];
// Joker: Spieltag-Index -> Spieler-Index (einer der Abwesenden)
const JOKERS: Record<number, number> = { 3: 1, 6: 2 };

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertLocal() {
  const url = process.env.DATABASE_URL ?? "";
  let ok = false;
  try {
    const u = new URL(url);
    ok = ["localhost", "127.0.0.1"].includes(u.hostname) && u.port === "5433";
  } catch {
    ok = false;
  }
  if (!ok) {
    console.error("Abbruch: DATABASE_URL muss auf localhost:5433 zeigen.");
    process.exit(1);
  }
}

async function wipe() {
  const players = await prisma.player.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = players.map((p) => p.id);
  const group = await prisma.group.findUnique({ where: { slug: SLUG }, select: { id: true } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, ...(group ? [{ groupId: group.id }] : [])] },
  });
  if (group) {
    await prisma.gameDay.deleteMany({ where: { groupId: group.id } });
    await prisma.season.deleteMany({ where: { groupId: group.id } });
    await prisma.invitation.deleteMany({ where: { groupId: group.id } });
    await prisma.membership.deleteMany({ where: { groupId: group.id } });
    await prisma.player.updateMany({ where: { activeGroupId: group.id }, data: { activeGroupId: null } });
    await prisma.group.delete({ where: { id: group.id } });
  }
  await prisma.membership.deleteMany({ where: { playerId: { in: ids } } });
  await prisma.player.deleteMany({ where: { id: { in: ids } } });
}

function utcDay(daysAgo: number): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() - daysAgo));
}

async function main() {
  assertLocal();
  await wipe();

  const passwordHash = await hashPassword(SCREENSHOT_PASSWORD);
  const now = new Date();
  const group = await prisma.group.create({ data: { name: "Donnerstagsrunde Münster", slug: SLUG } });
  const players: Awaited<ReturnType<typeof prisma.player.create>>[] = [];
  for (const r of ROSTER) {
    const p = await prisma.player.create({
      data: {
        name: r.name,
        email: r.mail,
        passwordHash: r.name === "Markus" ? passwordHash : null,
        emailVerifiedAt: now,
        termsAcceptedAt: now,
        activeGroupId: group.id,
        invitedAt: utcDay(120),
      },
    });
    await prisma.membership.create({
      data: { groupId: group.id, playerId: p.id, role: r.role, joinedAt: utcDay(120) },
    });
    players.push(p);
  }
  const me = players[0];
  const rand = mulberry32(20261106);

  async function playDay(daysAgo: number, absent: number[], dayIndex: number, finish: boolean, jokerFor?: number) {
    const day = await createGameDay(group.id, utcDay(daysAgo), me.id, "19:00");
    const present = players.filter((_, i) => !absent.includes(i));
    for (const p of players) {
      const here = present.includes(p);
      await prisma.gameDayParticipant.update({
        where: { gameDayId_playerId: { gameDayId: day.id, playerId: p.id } },
        data: { attendance: here ? "confirmed" : "declined", respondedAt: now },
      });
    }
    if (jokerFor !== undefined) await recordJokerUse({ playerId: players[jokerFor].id, gameDayId: day.id });

    // Feste Seeds, damit die Paarungen bei jedem Lauf gleich sind
    if (finish) {
      await prisma.gameDay.update({ where: { id: day.id }, data: { seed: `store-day-${dayIndex}` } });
    } else {
      // Beim laufenden Spieltag steht Markus im 5. Spiel
      const sorted = sortPlayersForAssignment(present.map((p) => ({ id: p.id, name: p.name })));
      for (let i = 0; i < 500; i++) {
        const plan = assignPlayersToTemplate(sorted, `store-${i}`)[4];
        const t1 = plan.team1.map((p) => p.id);
        const t2 = plan.team2.map((p) => p.id);
        if (t1.includes(me.id) && !t2.includes(players[1].id) && !t1.includes(players[1].id)) {
          await prisma.gameDay.update({ where: { id: day.id }, data: { seed: `store-${i}` } });
          break;
        }
      }
    }
    await startGameDay(day.id, me.id);

    const skillOf = (id: string) => {
      const i = players.findIndex((p) => p.id === id);
      return ROSTER[i].skill + ROSTER[i].drift * dayIndex;
    };
    const matches = await prisma.match.findMany({ where: { gameDayId: day.id }, orderBy: { matchNumber: "asc" } });
    const toScore = finish ? matches : matches.slice(0, 4);
    for (const m of toScore) {
      const diff =
        skillOf(m.team1PlayerAId) + skillOf(m.team1PlayerBId) - skillOf(m.team2PlayerAId) - skillOf(m.team2PlayerBId);
      const p = 1 / (1 + Math.exp(-diff * 1.4));
      let t1 = 0;
      for (let g = 0; g < 3; g++) if (rand() < p) t1++;
      await enterScore({
        matchId: m.id,
        team1Score: t1,
        team2Score: 3 - t1,
        scoredBy: me.id,
        expectedVersion: m.version,
        isAdmin: true,
      });
    }
    if (finish) await finishGameDay(day.id, me.id);
    return day;
  }

  for (let i = 0; i < FINISHED_DAYS_AGO.length; i++) {
    await playDay(FINISHED_DAYS_AGO[i], ABSENT[i], i, true, JOKERS[i]);
  }
  const live = await playDay(0, TODAY_ABSENT, FINISHED_DAYS_AGO.length, false);
  // Nächsten Donnerstag geplant, ein Teil hat schon zugesagt
  const next = await createGameDay(group.id, utcDay(-6), me.id, "19:00");
  for (const i of [0, 1, 3, 4, 5]) {
    await prisma.gameDayParticipant.update({
      where: { gameDayId_playerId: { gameDayId: next.id, playerId: players[i].id } },
      data: { attendance: "confirmed", respondedAt: now },
    });
  }
  console.log(`Fertig. Login: ${SCREENSHOT_EMAIL} / ${SCREENSHOT_PASSWORD}; laufender Spieltag ${live.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
