import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGameDay, createTestGroup, createTestSeason, sessionFor } from "../helpers/group";
import { registerDevice } from "@/lib/push/devices";
import { notifyNewGameDay } from "@/lib/push/notify-game-day";
import type { ApnsTransport } from "@/lib/push/apns";
import type { ApnsConfig } from "@/lib/push/config";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/push/send", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/push/send")>();
  return { ...actual, sendToPlayers: vi.fn(actual.sendToPlayers) };
});
import { sendToPlayers } from "@/lib/push/send";
const sendMock = sendToPlayers as unknown as ReturnType<typeof vi.fn>;
import { auth } from "@/auth";
import { POST } from "@/app/api/game-days/route";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const config: ApnsConfig = { keyId: "k", teamId: "t", keyPem: "pem", bundleId: "b" };

async function player(groupId: string, name: string, token: string) {
  const p = await createMember(groupId, { name, email: `${name}@example.com` });
  await registerDevice({ playerId: p.id, token });
  return p;
}

async function setup() {
  const group = await createTestGroup("Donnerstagsrunde");
  const season = await createTestSeason(group.id);
  const day = await createTestGameDay(group.id, season.id, { date: new Date("2026-11-12T00:00:00Z") });
  const creator = await player(group.id, "creator", "tok-creator");
  const other = await player(group.id, "other", "tok-other");
  const off = await player(group.id, "off", "tok-off");
  await prisma.player.update({ where: { id: off.id }, data: { pushRemindersEnabled: false } });
  const removed = await player(group.id, "removed", "tok-removed");
  await prisma.membership.updateMany({ where: { playerId: removed.id }, data: { removedAt: new Date() } });
  const deleted = await player(group.id, "deleted", "tok-deleted");
  await prisma.player.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
  return { group, day, creator, other, off };
}

beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  vi.restoreAllMocks();
  sendMock.mockReset();
  sendMock.mockImplementation((await vi.importActual<typeof import("@/lib/push/send")>("@/lib/push/send")).sendToPlayers);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("notifyNewGameDay", () => {
  it("skips creator, removed and deleted players; reminder switch does not matter", async () => {
    const { day, creator } = await setup();
    const transport = vi.fn<ApnsTransport>().mockResolvedValue({ ok: true });
    await notifyNewGameDay(day.id, creator.id, { transport, config });
    const tokens = transport.mock.calls.map((c) => c[0].token).sort();
    expect(tokens).toEqual(["tok-off", "tok-other"]);
    expect(transport.mock.calls[0][0].payload).toMatchObject({
      aps: { alert: { title: "Neuer Spieltag", body: "Donnerstagsrunde: Do, 12.11. – bist du dabei?" } },
      gameDayId: day.id,
      groupId: day.groupId,
    });
  });

  it("never throws", async () => {
    const { day, creator } = await setup();
    const transport = vi.fn<ApnsTransport>().mockRejectedValue(new Error("boom"));
    await expect(notifyNewGameDay(day.id, creator.id, { transport, config })).resolves.toBeUndefined();
    await expect(notifyNewGameDay("missing", creator.id, { transport, config })).resolves.toBeUndefined();
  });
});

describe("POST /api/game-days", () => {
  async function post() {
    const group = await createTestGroup("G");
    const admin = await createMember(group.id, { name: "Admin", email: "a@example.com", role: "admin" });
    await createMember(group.id, { name: "Bea", email: "b@example.com" });
    authMock.mockResolvedValue(sessionFor(admin, group.id, "admin"));
    const res = await POST(
      new Request("http://test/api/game-days", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "2030-05-02" }),
      }),
    );
    return { res, group };
  }

  it("returns 201 and keeps the game day when sending rejects", async () => {
    sendMock.mockRejectedValue(new Error("boom"));
    const { res, group } = await post();
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(await prisma.gameDay.count({ where: { groupId: group.id } })).toBe(1);
  });

  it("does not wait for a send that never resolves", async () => {
    sendMock.mockImplementation(() => new Promise(() => {}));
    const { res, group } = await post();
    expect(res.status).toBe(201);
    expect(await prisma.gameDay.count({ where: { groupId: group.id } })).toBe(1);
  });
});
