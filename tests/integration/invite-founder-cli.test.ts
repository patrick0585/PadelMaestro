import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/reset-db";
import { runInviteFounder } from "../../scripts/invite-founder";

beforeEach(resetDb);

async function run(argv: string[]) {
  const lines: string[] = [];
  await runInviteFounder(argv, (l) => lines.push(l));
  return lines;
}

describe("invite-founder CLI", () => {
  it("runInviteFounder --note creates a founder link and prints a url with a 43-char token", async () => {
    const lines = await run(["--note", "Gruppe Wien"]);
    expect(lines[0]).toMatch(/^Gründer-Link \(gültig bis .+\):$/);
    expect(lines[1]).toMatch(/\/einladung\/[A-Za-z0-9_-]{43}$/);
    expect(lines[2]).toBe("Notiz: Gruppe Wien");
  });

  it("runInviteFounder --list shows it and --revoke hides it", async () => {
    expect(await run(["--list"])).toEqual(["Keine offenen Gründer-Links."]);
    await run(["--note", "Gruppe Wien"]);
    const listed = await run(["--list"]);
    expect(listed[0]).toBe("id  note  gültig bis  verwendet");
    expect(listed).toHaveLength(2);
    expect(listed[1]).toContain("Gruppe Wien");
    expect(listed[1]).toMatch(/ {2}0\/1$/);
    const id = listed[1].split("  ")[0];

    expect(await run(["--revoke", id])).toEqual([`Gründer-Link ${id} widerrufen.`]);
    expect(await run(["--list"])).toEqual(["Keine offenen Gründer-Links."]);
  });

  it("rejects conflicting flags and unknown ids", async () => {
    const lines: string[] = [];
    await expect(runInviteFounder(["--list", "--revoke", "x"], (l) => lines.push(l))).rejects.toThrow("usage");
    expect(lines[0]).toMatch(/^Usage: pnpm invite:founder/);
    await expect(runInviteFounder(["--revoke", "nope"], (l) => lines.push(l))).rejects.toThrow("not_found");
    expect(lines).toContain("Gründer-Link nope nicht gefunden.");
  });
});
