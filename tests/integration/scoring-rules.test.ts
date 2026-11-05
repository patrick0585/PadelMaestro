import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup, createTestSeason, createTestGameDay, sessionFor } from "../helpers/group";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { startGameDay } from "@/lib/game-day/start";
import { enterScore, InvalidScoreError } from "@/lib/match/enter-score";
import { getGroupScoring } from "@/lib/group/scoring";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { PATCH } from "@/app/api/groups/active/scoring/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function groupWithPlayers(n: number) {
  const group = await createTestGroup();
  const players = [];
  for (let i = 1; i <= n; i++) {
    players.push(
      await createMember(group.id, { name: `P${i}`, email: `p${i}@x`, passwordHash: "x", role: i === 1 ? "owner" : "member" }),
    );
  }
  return { group, players };
}

async function startedDay(n: number, scoring?: object) {
  const { group, players } = await groupWithPlayers(n);
  if (scoring) await prisma.group.update({ where: { id: group.id }, data: { scoring } });
  const day = await createGameDay(group.id, new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await startGameDay(day.id, players[0].id);
  const match = await prisma.match.findFirstOrThrow({ where: { gameDayId: day.id }, orderBy: { matchNumber: "asc" } });
  return { group, players, day, match };
}

const score = (m: { id: string; version: number }, a: number, b: number, by: string) =>
  enterScore({ matchId: m.id, team1Score: a, team2Score: b, scoredBy: by, expectedVersion: m.version, isAdmin: true });

describe("Wertung pro Spieltag", () => {
  beforeEach(resetDb);

  it("neue Gruppen haben den Standard", async () => {
    const group = await createTestGroup();
    expect(await getGroupScoring(group.id)).toEqual({
      "4": { mode: "set", target: 6, max: 7 },
      "5": { mode: "fixed", games: 3 },
      "6": { mode: "fixed", games: 3 },
    });
  });

  it("der Start speichert die Regel für die tatsächliche Spielerzahl", async () => {
    const { day } = await startedDay(5, {
      "4": { mode: "set", target: 6, max: 7 },
      "5": { mode: "fixed", games: 5 },
      "6": { mode: "fixed", games: 3 },
    });
    const updated = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(updated.scoring).toEqual({ mode: "fixed", games: 5 });
  });

  it("Ergebnisse werden gegen die Regel des Spieltags geprüft, nicht gegen die aktuelle Gruppenregel", async () => {
    const { group, players, match } = await startedDay(5, {
      "4": { mode: "set", target: 6, max: 7 },
      "5": { mode: "fixed", games: 5 },
      "6": { mode: "fixed", games: 3 },
    });
    await prisma.group.update({ where: { id: group.id }, data: { scoring: { "5": { mode: "fixed", games: 3 } } } });
    await expect(score(match, 2, 1, players[0].id)).rejects.toThrow(InvalidScoreError);
    const saved = await score(match, 3, 2, players[0].id);
    expect([saved.team1Score, saved.team2Score]).toEqual([3, 2]);
  });

  it("Satz bis 6, höchstens 7 bei 4 Spielern", async () => {
    const { players, match } = await startedDay(4);
    await expect(score(match, 8, 6, players[0].id)).rejects.toThrow("Höchstens 7 Spiele");
    await expect(score(match, 7, 4, players[0].id)).rejects.toThrow(InvalidScoreError);
    const saved = await score(match, 7, 6, players[0].id);
    expect(saved.team1Score).toBe(7);
  });

  it("ältere Spieltage ohne gespeicherte Regel nutzen den Standard", async () => {
    const { group, players } = await groupWithPlayers(4);
    const season = await createTestSeason(group.id);
    const day = await createTestGameDay(group.id, season.id, { status: "in_progress", playerCount: 6 });
    const match = await prisma.match.create({
      data: {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: players[0].id,
        team1PlayerBId: players[1].id,
        team2PlayerAId: players[2].id,
        team2PlayerBId: players[3].id,
      },
    });
    await expect(score(match, 3, 2, players[0].id)).rejects.toThrow("Summe muss 3 sein");
    expect((await score(match, 2, 1, players[0].id)).team1Score).toBe(2);
  });
});

const req = (body: Record<string, unknown>) =>
  new Request("http://test/api/groups/active/scoring", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PATCH /api/groups/active/scoring", () => {
  beforeEach(async () => {
    await resetDb();
    authMock.mockReset();
  });

  it("Admin ändert die Wertung einer Spielerzahl, mit Audit-Eintrag", async () => {
    const group = await createTestGroup();
    const admin = await createMember(group.id, { name: "A", email: "a@x", role: "admin" });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));

    const res = await PATCH(req({ groupId: group.id, playerCount: 4, rule: { mode: "set", target: 6, max: 6 } }));

    expect(res.status).toBe(200);
    expect((await getGroupScoring(group.id))["4"]).toEqual({ mode: "set", target: 6, max: 6 });
    expect((await getGroupScoring(group.id))["5"]).toEqual({ mode: "fixed", games: 3 });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "group.scoring_update" } });
    expect(log.payload).toMatchObject({
      playerCount: 4,
      before: { mode: "set", target: 6, max: 7 },
      after: { mode: "set", target: 6, max: 6 },
    });
  });

  it("ungültige Regeln und Spielerzahlen: 400", async () => {
    const group = await createTestGroup();
    const admin = await createMember(group.id, { name: "A", email: "a@x", role: "admin" });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    for (const body of [
      { groupId: group.id, playerCount: 5, rule: { mode: "fixed", games: 4 } },
      { groupId: group.id, playerCount: 7, rule: { mode: "fixed", games: 3 } },
      { groupId: group.id, playerCount: 4, rule: { mode: "frei" } },
    ]) {
      expect((await PATCH(req(body))).status).toBe(400);
    }
  });

  it("Mitglieder dürfen nicht, fremde Gruppe ist veraltet", async () => {
    const group = await createTestGroup();
    const member = await createMember(group.id, { name: "M", email: "m@x" });
    authMock.mockResolvedValue(sessionFor(member, group.id, "member"));
    const rule = { mode: "fixed", games: 5 };
    expect((await PATCH(req({ groupId: group.id, playerCount: 5, rule }))).status).toBe(403);
    const other = await createTestGroup("Andere");
    expect((await PATCH(req({ groupId: other.id, playerCount: 5, rule }))).status).toBe(409);
  });
});
