import { describe, it, expect } from "vitest";
import { sparkline } from "@/lib/home/sparkline";

describe("sparkline", () => {
  it("verteilt Punkte gleichmäßig und skaliert in die Höhe", () => {
    const s = sparkline([4, 6], { width: 100, height: 40, padX: 10, padTop: 10, padBottom: 10 });
    expect(s.points).toEqual([
      { x: 10, y: 30, value: 4 },
      { x: 90, y: 10, value: 6 },
    ]);
    expect(s.line.startsWith("M10 30 C")).toBe(true);
    expect(s.area.endsWith("Z")).toBe(true);
  });

  it("ein Wert liegt mittig, gleiche Werte liegen auf mittlerer Höhe", () => {
    const one = sparkline([5], { width: 100, height: 40, padX: 10, padTop: 10, padBottom: 10 });
    expect(one.points).toEqual([{ x: 50, y: 20, value: 5 }]);
    const flat = sparkline([5, 5], { width: 100, height: 40, padX: 10, padTop: 10, padBottom: 10 });
    expect(flat.points.map((p) => p.y)).toEqual([20, 20]);
  });

  it("leer ergibt keine Pfade", () => {
    expect(sparkline([], { width: 100, height: 40, padX: 10, padTop: 10, padBottom: 10 })).toEqual({
      points: [],
      line: "",
      area: "",
    });
  });
});
