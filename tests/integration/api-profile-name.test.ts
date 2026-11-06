// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import { createMember, createTestGroup } from "../helpers/group";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import { POST } from "@/app/api/profile/name/route";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;
const post = (body: unknown) =>
  POST(
    new Request("http://test/api/profile/name", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

let playerId: string;
beforeEach(async () => {
  await resetDb();
  authMock.mockReset();
  const g = await createTestGroup();
  const p = await createMember(g.id, { name: "Neuer Spieler", email: "a@example.com" });
  await prisma.player.update({ where: { id: p.id }, data: { needsName: true } });
  playerId = p.id;
  authMock.mockResolvedValue({ user: { id: playerId } });
});

describe("POST /api/profile/name", () => {
  it("401 ohne Session", async () => {
    authMock.mockResolvedValue(null);
    expect((await post({ name: "Max" })).status).toBe(401);
  });

  it("speichert den getrimmten Namen und beendet den Namensschritt", async () => {
    const res = await post({ name: "  Max Muster  " });
    expect(res.status).toBe(204);
    expect(await prisma.player.findUniqueOrThrow({ where: { id: playerId } })).toMatchObject({
      name: "Max Muster",
      needsName: false,
    });
  });

  it.each([
    ["leer", { name: "" }],
    ["nur Leerzeichen", { name: "   " }],
    ["61 Zeichen", { name: "x".repeat(61) }],
    ["kein String", { name: 42 }],
    ["ohne Feld", {}],
    ["kein JSON", "{not json"],
  ])("400 bei ungültigem Namen (%s), nichts wird geändert", async (_n, body) => {
    expect((await post(body)).status).toBe(400);
    expect(await prisma.player.findUniqueOrThrow({ where: { id: playerId } })).toMatchObject({
      name: "Neuer Spieler",
      needsName: true,
    });
  });

  it("akzeptiert genau 60 Zeichen und Unicode", async () => {
    const name = "Ä".repeat(60);
    expect((await post({ name })).status).toBe(204);
    expect((await prisma.player.findUniqueOrThrow({ where: { id: playerId } })).name).toBe(name);
  });

  it("ändert nur das eigene Konto", async () => {
    const g = await createTestGroup();
    const other = await createMember(g.id, { name: "Fremd", email: "b@example.com" });
    await post({ name: "Max" });
    expect((await prisma.player.findUniqueOrThrow({ where: { id: other.id } })).name).toBe("Fremd");
  });
});
