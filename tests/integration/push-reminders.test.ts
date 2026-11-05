import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGameDay, createTestGroup, createTestSeason } from "../helpers/group";
import { registerDevice } from "@/lib/push/devices";
import { sendDueReminders } from "@/lib/push/reminders";
import { reminderRecipients } from "@/lib/push/recipients";
import type { ApnsTransport } from "@/lib/push/apns";
import type { ApnsConfig } from "@/lib/push/config";

const config: ApnsConfig = { keyId: "k", teamId: "t", keyPem: "pem", bundleId: "b" };
const DATE = new Date("2026-12-10T00:00:00Z");
const DAY_BEFORE = new Date("2026-12-09T17:00:00Z");
const SAME_DAY = new Date("2026-12-10T13:00:00Z");
const min = (m: number) => m * 60_000;
const at = (t: Date, offsetMs: number) => new Date(t.getTime() + offsetMs);

async function setup(status: "planned" | "in_progress" = "planned") {
  const group = await createTestGroup("Runde");
  const season = await createTestSeason(group.id);
  const day = await createTestGameDay(group.id, season.id, {
    date: DATE,
    status,
    createdAt: new Date("2026-12-01T10:00:00Z"),
  });
  const mk = async (name: string) => {
    const p = await createMember(group.id, { name, email: `${name}@example.com` });
    await registerDevice({ playerId: p.id, token: `tok-${name}` });
    return p;
  };
  return { group, day, mk };
}

const transportOk = () => vi.fn<ApnsTransport>().mockResolvedValue({ ok: true });

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reminderRecipients", () => {
  it("only pending or missing, with the switch on", async () => {
    const { day, mk } = await setup();
    const pending = await mk("pending");
    const missing = await mk("missing");
    const confirmed = await mk("confirmed");
    const declined = await mk("declined");
    const joker = await mk("joker");
    const off = await mk("off");
    await prisma.player.update({ where: { id: off.id }, data: { pushRemindersEnabled: false } });
    const part = (p: { id: string }, attendance: "pending" | "confirmed" | "declined" | "joker") =>
      prisma.gameDayParticipant.create({ data: { gameDayId: day.id, playerId: p.id, attendance } });
    await part(pending, "pending");
    await part(confirmed, "confirmed");
    await part(declined, "declined");
    await part(joker, "joker");
    await part(off, "pending");
    const ids = await reminderRecipients(day.id);
    expect(ids.sort()).toEqual([pending.id, missing.id].sort());
  });
});

describe("sendDueReminders", () => {
  it("sends nothing before the time", async () => {
    const { mk } = await setup();
    await mk("a");
    const transport = transportOk();
    expect(await sendDueReminders(at(DAY_BEFORE, -1000), { transport, config })).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends within the window, once; second run does nothing", async () => {
    const { day, mk } = await setup();
    await mk("a");
    const transport = transportOk();
    const r = await sendDueReminders(at(DAY_BEFORE, min(3)), { transport, config });
    expect(r).toEqual([{ kind: "day_before", gameDayId: day.id, sent: 1 }]);
    expect(transport.mock.calls[0][0].payload).toMatchObject({
      aps: { alert: { title: "Noch nicht abgestimmt", body: "Runde: morgen ist Spieltag – bist du dabei?" } },
    });
    expect(await sendDueReminders(at(DAY_BEFORE, min(8)), { transport, config })).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
    const same = await sendDueReminders(at(SAME_DAY, min(1)), { transport, config });
    expect(same).toEqual([{ kind: "same_day", gameDayId: day.id, sent: 1 }]);
  });

  it("two parallel runs send exactly once", async () => {
    const { mk } = await setup();
    await mk("a");
    const transport = transportOk();
    const now = at(DAY_BEFORE, min(1));
    await Promise.all([sendDueReminders(now, { transport, config }), sendDueReminders(now, { transport, config })]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await prisma.pushReminderSent.count()).toBe(1);
  });

  it("drops the reminder after the 2h window", async () => {
    const { mk } = await setup();
    await mk("a");
    const transport = transportOk();
    expect(await sendDueReminders(at(DAY_BEFORE, 2 * 60 * min(1) + min(1)), { transport, config })).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("ignores non-planned game days", async () => {
    const { mk } = await setup("in_progress");
    await mk("a");
    const transport = transportOk();
    expect(await sendDueReminders(at(DAY_BEFORE, min(1)), { transport, config })).toEqual([]);
  });

  it("drops reminders whose time was already past at creation", async () => {
    const { day, mk } = await setup();
    await mk("a");
    await prisma.gameDay.update({ where: { id: day.id }, data: { createdAt: at(DAY_BEFORE, min(30)) } });
    const transport = transportOk();
    expect(await sendDueReminders(at(DAY_BEFORE, min(40)), { transport, config })).toEqual([]);
    expect(transport).not.toHaveBeenCalled();
  });

  it("records the row even without recipients", async () => {
    await setup();
    const transport = transportOk();
    const r = await sendDueReminders(at(DAY_BEFORE, min(1)), { transport, config });
    expect(r[0].sent).toBe(0);
    expect(await prisma.pushReminderSent.count()).toBe(1);
  });

  it("same_day folgt einem frühen Anpfiff und nennt die Uhrzeit", async () => {
    const { day, mk } = await setup();
    await mk("a");
    await prisma.gameDay.update({ where: { id: day.id }, data: { startTime: "12:00" } });
    const early = new Date("2026-12-10T08:00:00Z"); // 09:00 Berlin
    const transport = transportOk();
    expect(await sendDueReminders(at(early, -min(5)), { transport, config })).toEqual([]);
    const r = await sendDueReminders(at(early, min(5)), { transport, config });
    expect(r).toEqual([{ kind: "same_day", gameDayId: day.id, sent: 1 }]);
    expect(transport.mock.calls[0][0].payload).toMatchObject({
      aps: { alert: { body: "Runde: heute um 12:00 Uhr ist Spieltag – bist du dabei?" } },
    });
  });

  it("später Anpfiff behält 14 Uhr", async () => {
    const { day, mk } = await setup();
    await mk("a");
    await prisma.gameDay.update({ where: { id: day.id }, data: { startTime: "20:00" } });
    const transport = transportOk();
    expect(await sendDueReminders(at(SAME_DAY, -min(5)), { transport, config })).toEqual([]);
    expect(await sendDueReminders(at(SAME_DAY, min(5)), { transport, config })).toEqual([
      { kind: "same_day", gameDayId: day.id, sent: 1 },
    ]);
  });

  it("sehr früher Anpfiff: keine same_day-Erinnerung", async () => {
    const { day, mk } = await setup();
    await mk("a");
    await prisma.gameDay.update({ where: { id: day.id }, data: { startTime: "07:00" } });
    const transport = transportOk();
    for (const h of [5, 6, 7, 13, 14]) {
      expect(await sendDueReminders(new Date(Date.UTC(2026, 11, 10, h, 5)), { transport, config })).toEqual([]);
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("deleting the game day cascades the log rows", async () => {
    const { day } = await setup();
    await sendDueReminders(at(DAY_BEFORE, min(1)), { transport: transportOk(), config });
    expect(await prisma.pushReminderSent.count()).toBe(1);
    await prisma.gameDay.delete({ where: { id: day.id } });
    expect(await prisma.pushReminderSent.count()).toBe(0);
  });
});
