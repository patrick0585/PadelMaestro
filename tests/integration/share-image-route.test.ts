import { describe, it, expect, vi, beforeEach } from "vitest";

const guard = vi.fn();
vi.mock("@/lib/auth/route-guard", () => ({ guardMember: () => guard() }));
const scope = vi.fn();
vi.mock("@/lib/game-day/group-scope", () => ({ findGroupGameDay: (g: string, id: string) => scope(g, id) }));
const load = vi.fn();
vi.mock("@/lib/share/share-card", () => ({ loadShareCard: (id: string, u: string) => load(id, u) }));
vi.mock("@/lib/share/share-image", () => ({
  renderShareImage: async () => new Response("png", { headers: { "content-type": "image/png" } }),
}));
import { GET } from "@/app/api/game-days/[id]/share-image/route";

const call = () => GET(new Request("http://x"), { params: Promise.resolve({ id: "d1" }) });

describe("GET /api/game-days/[id]/share-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guard.mockResolvedValue({ ctx: { groupId: "g1", userId: "u1" }, response: null });
    scope.mockResolvedValue({ id: "d1" });
    load.mockResolvedValue({ podium: [] });
  });

  it("liefert das Bild für Mitglieder, persönlich und ohne Cache", async () => {
    const res = await call();
    expect(load).toHaveBeenCalledWith("d1", "u1");
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("404 für Spieltage einer anderen Gruppe", async () => {
    scope.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(load).not.toHaveBeenCalled();
  });

  it("404 für nicht abgeschlossene Spieltage", async () => {
    load.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("drosselt viele Bilder pro Minute", async () => {
    guard.mockResolvedValue({ ctx: { groupId: "g1", userId: "spammer" }, response: null });
    const statuses = [];
    for (let i = 0; i < 12; i++) statuses.push((await call()).status);
    expect(statuses.filter((s) => s === 429)).toHaveLength(2);
  });

  it("ohne Anmeldung die Antwort des Guards", async () => {
    guard.mockResolvedValue({ ctx: null, response: new Response(null, { status: 401 }) });
    expect((await call()).status).toBe(401);
  });
});
