import { describe, it, expect } from "vitest";
import { pickTableRows } from "@/lib/home/table-rows";

const r = (playerId: string, rank: number) => ({ playerId, rank });
const ids = (rows: { playerId: string }[]) => rows.map((x) => x.playerId);

describe("pickTableRows", () => {
  const field = [r("a", 1), r("b", 2), r("c", 3), r("d", 4), r("me", 5), r("f", 6), r("g", 7)];

  it("Platz 1 plus die eigene Zeile mit je einem Nachbarn", () => {
    expect(ids(pickTableRows(field, "me"))).toEqual(["a", "d", "me", "f"]);
  });

  it("auf Platz 2 schließt die Umgebung direkt an Platz 1 an", () => {
    const rows = [r("a", 1), r("me", 2), r("c", 3), r("d", 4)];
    expect(ids(pickTableRows(rows, "me"))).toEqual(["a", "me", "c"]);
  });

  it("auf Platz 1 die beiden Verfolger", () => {
    const rows = [r("me", 1), r("b", 2), r("c", 3), r("d", 4)];
    expect(ids(pickTableRows(rows, "me"))).toEqual(["me", "b", "c"]);
  });

  it("als Letzter die beiden Plätze davor", () => {
    expect(ids(pickTableRows([...field.slice(0, 4), r("me", 5)], "me"))).toEqual(["a", "c", "d", "me"]);
  });

  it("ohne eigene Zeile die Top 3", () => {
    expect(ids(pickTableRows(field, "x"))).toEqual(["a", "b", "c"]);
    expect(ids(pickTableRows([r("a", 1), r("b", 2)], "me"))).toEqual(["a", "b"]);
  });
});
