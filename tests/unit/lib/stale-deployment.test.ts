import { afterEach, describe, it, expect, vi } from "vitest";
import { isStaleDeploymentError, reloadOnceForStaleDeployment } from "@/lib/stale-deployment";

describe("isStaleDeploymentError", () => {
  it.each([
    ["ChunkLoadError", "Loading chunk 123 failed."],
    ["Error", "Loading CSS chunk 7 failed"],
    ["TypeError", "Failed to fetch dynamically imported module: /_next/static/chunks/x.js"],
    ["Error", 'Failed to find Server Action "abc". This request might be from an older or newer deployment.'],
    ["TypeError", "Importing a module script failed."],
  ])("erkennt %s: %s", (name, message) => {
    const e = Object.assign(new Error(message), { name });
    expect(isStaleDeploymentError(e)).toBe(true);
  });

  it("ignoriert normale Fehler", () => {
    expect(isStaleDeploymentError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(false);
  });
});

describe("reloadOnceForStaleDeployment", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("lädt einmal neu und dann nicht noch einmal innerhalb kurzer Zeit", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleDeployment(reload)).toBe(true);
    expect(reloadOnceForStaleDeployment(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("nach einer Minute ist ein erneuter Versuch erlaubt (nächster Deploy)", () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    reloadOnceForStaleDeployment(reload);
    vi.advanceTimersByTime(61_000);
    expect(reloadOnceForStaleDeployment(reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("offline nicht neu laden, die Fehlerseite bleibt stehen", () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const reload = vi.fn();
    expect(reloadOnceForStaleDeployment(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("ohne Speicher lieber nicht neu laden (keine Schleife riskieren)", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const reload = vi.fn();
    expect(reloadOnceForStaleDeployment(reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
