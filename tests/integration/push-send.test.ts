import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";
import { registerDevice } from "@/lib/push/devices";
import { sendToPlayers } from "@/lib/push/send";
import type { ApnsTransport } from "@/lib/push/apns";
import type { ApnsConfig } from "@/lib/push/config";

const config: ApnsConfig = { keyId: "k", teamId: "t", keyPem: "pem", bundleId: "b" };
const message = { title: "Neuer Spieltag", body: "G: Do, 12.11. – bist du dabei?", gameDayId: "gd1", groupId: "g1" };
const TOKEN = "ab12cd34ef56";

async function setup() {
  const group = await createTestGroup("G");
  const a = await createMember(group.id, { name: "A", email: "a@example.com" });
  await registerDevice({ playerId: a.id, token: TOKEN });
  return a;
}

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sendToPlayers", () => {
  it("counts successes and sends the agreed payload", async () => {
    const a = await setup();
    const transport = vi.fn<ApnsTransport>().mockResolvedValue({ ok: true });
    const r = await sendToPlayers([a.id], message, { transport, config });
    expect(r).toEqual({ sent: 1, removed: 0, dryRun: false });
    expect(transport).toHaveBeenCalledWith({
      environment: "production",
      token: TOKEN,
      config,
      payload: {
        aps: { alert: { title: message.title, body: message.body }, sound: "default" },
        gameDayId: "gd1",
        groupId: "g1",
      },
    });
  });

  it("deletes the device on 410 Unregistered", async () => {
    const a = await setup();
    const transport = vi.fn<ApnsTransport>().mockResolvedValue({ ok: false, status: 410, reason: "Unregistered" });
    const r = await sendToPlayers([a.id], message, { transport, config });
    expect(r).toEqual({ sent: 0, removed: 1, dryRun: false });
    expect(await prisma.pushDevice.count()).toBe(0);
  });

  it("keeps the device and switches to sandbox when production says BadDeviceToken but sandbox succeeds", async () => {
    const a = await setup();
    const transport = vi.fn<ApnsTransport>().mockImplementation(async (i) =>
      i.environment === "production" ? { ok: false, status: 400, reason: "BadDeviceToken" } : { ok: true },
    );
    const r = await sendToPlayers([a.id], message, { transport, config });
    expect(r).toEqual({ sent: 1, removed: 0, dryRun: false });
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { token: TOKEN } })).environment).toBe("sandbox");
  });

  it("deletes the device when both environments say BadDeviceToken", async () => {
    const a = await setup();
    const transport = vi.fn<ApnsTransport>().mockResolvedValue({ ok: false, status: 400, reason: "BadDeviceToken" });
    const r = await sendToPlayers([a.id], message, { transport, config });
    expect(r).toEqual({ sent: 0, removed: 1, dryRun: false });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(await prisma.pushDevice.count()).toBe(0);
  });

  it("does not throw when the transport throws and keeps the device", async () => {
    const a = await setup();
    const transport = vi.fn<ApnsTransport>().mockRejectedValue(new Error("boom"));
    const r = await sendToPlayers([a.id], message, { transport, config });
    expect(r).toEqual({ sent: 0, removed: 0, dryRun: false });
    expect(await prisma.pushDevice.count()).toBe(1);
  });

  it("keeps the device on other failures", async () => {
    const a = await setup();
    const transport = vi.fn<ApnsTransport>().mockResolvedValue({ ok: false, status: 429, reason: "TooManyRequests" });
    const r = await sendToPlayers([a.id], message, { transport, config });
    expect(r).toEqual({ sent: 0, removed: 0, dryRun: false });
    expect(await prisma.pushDevice.count()).toBe(1);
  });

  it("dry-runs without config and never calls the transport", async () => {
    const a = await setup();
    const transport = vi.fn<ApnsTransport>();
    const r = await sendToPlayers([a.id], message, { transport, config: null });
    expect(r).toEqual({ sent: 0, removed: 0, dryRun: true });
    expect(transport).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("[push] dry-run"));
  });

  it("ignores empty recipient lists", async () => {
    const transport = vi.fn<ApnsTransport>();
    expect(await sendToPlayers([], message, { transport, config })).toEqual({ sent: 0, removed: 0, dryRun: false });
  });
});
