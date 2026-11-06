import { describe, it, expect } from "vitest";
import { dayPersonal } from "@/lib/share/share-card";

const m = (t1: [string, string], t2: [string, string], s1: number, s2: number) => ({
  team1PlayerAId: t1[0],
  team1PlayerBId: t1[1],
  team2PlayerAId: t2[0],
  team2PlayerBId: t2[1],
  team1Score: s1,
  team2Score: s2,
});

describe("dayPersonal", () => {
  const matches = [
    m(["me", "ben"], ["lea", "tim"], 3, 0),
    m(["lea", "me"], ["ben", "tim"], 1, 2),
    m(["tim", "jo"], ["me", "ben"], 0, 3),
    m(["lea", "tim"], ["ben", "jo"], 2, 1),
  ];

  it("zählt gespielte und gewonnene Matches des Spielers", () => {
    expect(dayPersonal(matches, "me")).toMatchObject({ matches: 3, wins: 2 });
  });

  it("bestes Duo ist der Partner mit den meisten gemeinsamen Punkten", () => {
    expect(dayPersonal(matches, "me")?.partnerId).toBe("ben");
  });

  it("ohne Matches null", () => {
    expect(dayPersonal(matches, "x")).toBeNull();
  });

  it("bei Gleichstand der Punkte entscheidet die Zahl der Siege, dann die ID", () => {
    const tie = [m(["me", "a"], ["x", "y"], 2, 1), m(["me", "b"], ["x", "y"], 1, 2), m(["me", "b"], ["x", "y"], 1, 2)];
    // a: 2 Punkte 1 Sieg, b: 2 Punkte 0 Siege
    expect(dayPersonal(tie, "me")?.partnerId).toBe("a");
  });
});
