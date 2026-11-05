import { describe, it, expect } from "vitest";
import { pickTableRows } from "@/lib/home/table-rows";

const r = (playerId: string, rank: number) => ({ playerId, rank });

describe("pickTableRows", () => {
  it("Top 3, eigene Zeile angehängt, wenn nicht dabei", () => {
    const rows = [r("a", 1), r("b", 2), r("c", 3), r("d", 4), r("me", 5)];
    expect(pickTableRows(rows, "me").map((x) => x.playerId)).toEqual(["a", "b", "c", "me"]);
  });

  it("keine doppelte Zeile, wenn man in den Top 3 ist", () => {
    const rows = [r("a", 1), r("me", 2), r("c", 3), r("d", 4)];
    expect(pickTableRows(rows, "me").map((x) => x.playerId)).toEqual(["a", "me", "c"]);
  });

  it("ohne eigene Zeile nur die Top 3", () => {
    expect(pickTableRows([r("a", 1), r("b", 2)], "me").map((x) => x.playerId)).toEqual(["a", "b"]);
  });
});
