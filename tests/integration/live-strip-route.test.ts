import { describe, it, expect, vi } from "vitest";

const guard = vi.fn();
vi.mock("@/lib/auth/route-guard", () => ({ guardMember: () => guard() }));
const load = vi.fn();
vi.mock("@/lib/game-day/live-strip", () => ({ loadLiveStrip: (id: string) => load(id) }));
import { GET } from "@/app/api/game-day/live/route";

describe("GET /api/game-day/live", () => {
  it("liefert den Live-Stand der aktiven Gruppe, ohne Cache", async () => {
    guard.mockResolvedValue({ ctx: { groupId: "g1" }, response: null });
    load.mockResolvedValue({ current: 4, total: 15 });
    const res = await GET();
    expect(load).toHaveBeenCalledWith("g1");
    expect(await res.json()).toEqual({ live: { current: 4, total: 15 } });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("ohne Anmeldung die Antwort des Guards", async () => {
    guard.mockResolvedValue({ ctx: null, response: new Response(null, { status: 401 }) });
    expect((await GET()).status).toBe(401);
  });
});
