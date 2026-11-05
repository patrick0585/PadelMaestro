import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGameDay, createTestGroup, createTestSeason } from "../helpers/group";
import { registerDevice } from "@/lib/push/devices";
import { notifyGameDayFinished } from "@/lib/push/notify-finished";
import type { ApnsTransport } from "@/lib/push/apns";
import type { ApnsConfig } from "@/lib/push/config";

const config: ApnsConfig = { keyId: "k", teamId: "t", keyPem: "pem", bundleId: "b" };

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function setup() {
  const group = await createTestGroup("Runde");
  const season = await createTestSeason(group.id);
  const mk = async (name: string) => {
    const p = await createMember(group.id, { name, email: `${name}@example.com` });
    await registerDevice({ playerId: p.id, token: `tok-${name}` });
    return p;
  };
  const [anna, ben, clara, dirk, eva, finn] = await Promise.all(["Anna", "Ben", "Clara", "Dirk", "Eva", "Finn"].map(mk));
  const day = await createTestGameDay(group.id, season.id, { status: "finished", playerCount: 4, date: new Date("2026-11-12T00:00:00Z") });
  await prisma.match.create({
    data: {
      gameDayId: day.id,
      matchNumber: 1,
      team1PlayerAId: anna.id,
      team1PlayerBId: ben.id,
      team2PlayerAId: clara.id,
      team2PlayerBId: dirk.id,
      team1Score: 6,
      team2Score: 3,
    },
  });
  await prisma.jokerUse.create({
    data: { playerId: eva.id, seasonId: season.id, gameDayId: day.id, ppgAtUse: 1, gamesCredited: 1, pointsCredited: 1.4 },
  });
  return { day, anna, ben, clara, dirk, eva, finn };
}

const bodies = (t: ReturnType<typeof vi.fn<ApnsTransport>>) =>
  Object.fromEntries(t.mock.calls.map((c) => [c[0].token, (c[0].payload as { aps: { alert: { body: string } } }).aps.alert.body]));

describe("notifyGameDayFinished", () => {
  it("persönliche Texte für Sieger, Mitspieler, Joker und Abwesende; der Admin bekommt nichts", async () => {
    const { day, dirk } = await setup();
    const transport = vi.fn<ApnsTransport>().mockResolvedValue({ ok: true });

    await notifyGameDayFinished(day.id, dirk.id, { transport, config });

    expect(bodies(transport)).toEqual({
      "tok-Anna": "Runde: Du gewinnst gemeinsam mit Ben – 6 Punkte!",
      "tok-Ben": "Runde: Du gewinnst gemeinsam mit Anna – 6 Punkte!",
      "tok-Clara": "Runde: Anna und Ben gewinnen mit 6 Punkten. Du wirst 2. mit 3.",
      "tok-Eva": "Runde: Ohne dich: Anna und Ben gewinnen mit 6 Punkten. Dein Joker bringt 1 Punkt.",
      "tok-Finn": "Runde: Anna und Ben gewinnen mit 6 Punkten.",
    });
    expect(transport.mock.calls[0][0].payload).toMatchObject({ aps: { alert: { title: "Spieltag beendet" } }, gameDayId: day.id });
  });

  it("ohne gewertete Matches keine Nachricht, und Fehler werfen nie", async () => {
    const group = await createTestGroup();
    const season = await createTestSeason(group.id);
    const p = await createMember(group.id, { name: "A", email: "a@x" });
    await registerDevice({ playerId: p.id, token: "t" });
    const day = await createTestGameDay(group.id, season.id, { status: "finished" });
    const transport = vi.fn<ApnsTransport>().mockResolvedValue({ ok: true });
    await notifyGameDayFinished(day.id, "x", { transport, config });
    expect(transport).not.toHaveBeenCalled();
    await expect(notifyGameDayFinished("00000000-0000-0000-0000-000000000000", "x", { transport, config })).resolves.toBeUndefined();
  });
});
