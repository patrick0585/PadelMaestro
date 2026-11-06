import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { loadShareCard } from "@/lib/share/share-card";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";

async function season() {
  const group = await createTestGroup();
  const year = new Date().getFullYear();
  const s = await prisma.season.create({
    data: { groupId: group.id, name: `Saison ${year}`, year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31), isActive: true },
  });
  const [a, b, c, d] = await Promise.all(
    ["Anna Alt", "Ben Bauer", "Cleo Cyr", "Dan Dorn"].map((n, i) => createMember(group.id, { name: n, email: `p${i}@x`, passwordHash: "x" })),
  );
  return { group, s, a, b, c, d };
}

async function day(seasonId: string, groupId: string, date: string, status: "finished" | "in_progress", ms: [string[], string[], number, number][]) {
  const gd = await prisma.gameDay.create({ data: { groupId, seasonId, date: new Date(date), playerCount: 4, status } });
  for (const [i, [t1, t2, s1, s2]] of ms.entries()) {
    await prisma.match.create({
      data: { gameDayId: gd.id, matchNumber: i + 1, team1PlayerAId: t1[0], team1PlayerBId: t1[1], team2PlayerAId: t2[0], team2PlayerBId: t2[1], team1Score: s1, team2Score: s2 },
    });
  }
  return gd.id;
}

describe("loadShareCard", () => {
  beforeEach(resetDb);

  it("liefert Podium, eigene Tageswerte und die Bewegung in der Saison", async () => {
    const { group, s, a, b, c, d } = await season();
    // Tag 1: Dan und Cleo vorne, Anna geteilt Zweite. Nach Tag 2 teilt sich Anna Platz 1 mit Cleo.
    await day(s.id, group.id, "2026-04-01", "finished", [[[d.id, c.id], [a.id, b.id], 3, 0]]);
    // Tag 2: Anna gewinnt zweimal mit Ben
    const id = await day(s.id, group.id, "2026-04-08", "finished", [
      [[a.id, b.id], [c.id, d.id], 3, 0],
      [[a.id, c.id], [b.id, d.id], 2, 1],
    ]);
    const card = await loadShareCard(id, a.id);
    expect(card?.groupName).toBe(group.name);
    expect(card?.dayNumber).toBe(2);
    expect(card?.podium[0]).toEqual({ name: "Anna", points: 5, rank: 1, isMe: true });
    expect(card?.me).toMatchObject({ rank: 1, points: 5, matches: 2, wins: 2, partner: "Ben" });
    expect(card?.me).toMatchObject({ seasonRank: 1, seasonMove: 1 });
  });

  it("ohne eigene Matches kein persönlicher Teil", async () => {
    const { group, s, a, b, c, d } = await season();
    const id = await day(s.id, group.id, "2026-04-01", "finished", [[[a.id, b.id], [c.id, d.id], 2, 1]]);
    const outsider = await createMember(group.id, { name: "Eva", email: "eva@x", passwordHash: "x" });
    const card = await loadShareCard(id, outsider.id);
    expect(card?.me).toBeNull();
    expect(card?.podium.length).toBeGreaterThan(0);
  });

  it("nur für abgeschlossene Spieltage", async () => {
    const { group, s, a, b, c, d } = await season();
    const id = await day(s.id, group.id, "2026-04-01", "in_progress", [[[a.id, b.id], [c.id, d.id], 2, 1]]);
    expect(await loadShareCard(id, a.id)).toBeNull();
  });
});
