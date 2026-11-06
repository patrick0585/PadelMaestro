import { describe, it, expect, vi } from "vitest";
vi.mock("next/og", () => ({ ImageResponse: class {} }));
import { seasonLine, shareDateLabel, shownNames } from "@/lib/share/share-image";

describe("Texte im Teilen-Bild", () => {
  it("Datum kurz und in deutscher Zeit", () => {
    expect(shareDateLabel(new Date("2026-11-12T00:00:00Z"))).toBe("Do 12.11.");
    // Mitternacht UTC ist in Berlin schon derselbe Tag, auch im Sommer
    expect(shareDateLabel(new Date("2026-07-02T00:00:00Z"))).toBe("Do 02.07.");
  });

  it("Saison-Bewegung in Worten", () => {
    expect(seasonLine(2, 3)).toEqual({ text: "2 Plätze · jetzt 3. in der Saison", up: true });
    expect(seasonLine(-1, 6)).toEqual({ text: "1 Platz · jetzt 6. in der Saison", up: false });
    expect(seasonLine(0, 4)).toEqual({ text: "Gleich geblieben · 4. in der Saison", up: null });
    expect(seasonLine(null, 1)).toEqual({ text: "1. in der Saison", up: null });
    expect(seasonLine(null, null)).toBeNull();
  });

  it("bei geteiltem Platz steht der Betrachter immer drauf, der Rest als +N", () => {
    const p = (name: string, isMe = false) => ({ name, points: 15, rank: 3, isMe });
    expect(shownNames([p("Clara"), p("Daniel"), p("Patrick", true)])).toEqual(["Patrick", "Clara +1"]);
    expect(shownNames([p("Clara"), p("Daniel")])).toEqual(["Clara", "Daniel"]);
  });
});
