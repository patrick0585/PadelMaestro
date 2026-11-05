import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGameDay, createTestSeason, setupGroupWithAdmin } from "../helpers/group";
import { recentFormByPlayer } from "@/lib/home/recent-form";

async function scoredDay(
  groupId: string,
  seasonId: string,
  date: string,
  ids: [string, string, string, string],
  score: [number, number],
  status: "finished" | "in_progress" = "finished",
) {
  const day = await createTestGameDay(groupId, seasonId, { date: new Date(`${date}T00:00:00Z`), status });
  await prisma.match.create({
    data: {
      gameDayId: day.id,
      matchNumber: 1,
      team1PlayerAId: ids[0],
      team1PlayerBId: ids[1],
      team2PlayerAId: ids[2],
      team2PlayerBId: ids[3],
      team1Score: score[0],
      team2Score: score[1],
    },
  });
}

describe("recentFormByPlayer", () => {
  beforeEach(resetDb);

  it("PPG je Spieltag, alt nach neu, nur beendete Tage, höchstens 5", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const season = await createTestSeason(group.id);
    const b = await createMember(group.id, { name: "B", email: "b@x" });
    const c = await createMember(group.id, { name: "C", email: "c@x" });
    const d = await createMember(group.id, { name: "D", email: "d@x" });
    const ids: [string, string, string, string] = [admin.id, b.id, c.id, d.id];
    for (let i = 1; i <= 6; i++) await scoredDay(group.id, season.id, `2026-10-0${i}`, ids, [i, 10]);
    await scoredDay(group.id, season.id, "2026-10-09", ids, [99, 0], "in_progress");

    const form = await recentFormByPlayer(season.id, [admin.id, c.id]);

    expect(form.get(admin.id)).toEqual([2, 3, 4, 5, 6]);
    expect(form.get(c.id)).toEqual([10, 10, 10, 10, 10]);
    expect(form.has(b.id)).toBe(false);
  });

  it("null für fehlende Tage, Durchschnitt über mehrere Matches, ungewertete zählen nicht", async () => {
    const { group, admin } = await setupGroupWithAdmin();
    const season = await createTestSeason(group.id);
    const [b, c, d, e] = await Promise.all(
      ["B", "C", "D", "E"].map((n) => createMember(group.id, { name: n, email: `${n}@x` })),
    );
    await scoredDay(group.id, season.id, "2026-10-01", [admin.id, b.id, c.id, d.id], [2, 1]);
    await scoredDay(group.id, season.id, "2026-10-02", [e.id, b.id, c.id, d.id], [3, 0]);
    const day3 = await createTestGameDay(group.id, season.id, {
      date: new Date("2026-10-03T00:00:00Z"),
      status: "finished",
    });
    const mk = (n: number, s1: number | null, s2: number | null) =>
      prisma.match.create({
        data: {
          gameDayId: day3.id,
          matchNumber: n,
          team1PlayerAId: admin.id,
          team1PlayerBId: b.id,
          team2PlayerAId: c.id,
          team2PlayerBId: e.id,
          team1Score: s1,
          team2Score: s2,
        },
      });
    await mk(1, 3, 0);
    await mk(2, 1, 2);
    await mk(3, null, null);

    const form = await recentFormByPlayer(season.id, [admin.id, e.id]);

    expect(form.get(admin.id)).toEqual([2, null, 2]);
    expect(form.get(e.id)).toEqual([null, 3, 1]);
  });

  it("leere Eingaben", async () => {
    const { group } = await setupGroupWithAdmin();
    const season = await createTestSeason(group.id);
    expect((await recentFormByPlayer(season.id, [])).size).toBe(0);
  });
});
