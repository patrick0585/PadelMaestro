import { describe, it, expect, vi, afterEach } from "vitest";
import { hapticError, hapticSuccess, hapticTap } from "@/lib/haptics";

afterEach(() => {
  delete window.Capacitor;
});

function stubPlugin() {
  const plugin = { impact: vi.fn().mockResolvedValue(undefined), notification: vi.fn().mockResolvedValue(undefined) };
  window.Capacitor = { isNativePlatform: () => true, Plugins: { Haptics: plugin } };
  return plugin;
}

describe("haptics", () => {
  it("tippt leicht, meldet Erfolg und Fehler über das native Plugin", () => {
    const plugin = stubPlugin();
    hapticTap();
    hapticSuccess();
    hapticError();
    expect(plugin.impact).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(plugin.notification).toHaveBeenNthCalledWith(1, { type: "SUCCESS" });
    expect(plugin.notification).toHaveBeenNthCalledWith(2, { type: "ERROR" });
  });

  it("macht nichts ohne Plugin (Browser oder ältere App-Version)", () => {
    expect(() => hapticTap()).not.toThrow();
    window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    expect(() => hapticSuccess()).not.toThrow();
  });

  it("schluckt Fehler des Plugins", async () => {
    const plugin = stubPlugin();
    plugin.impact.mockRejectedValue(new Error("not implemented"));
    plugin.notification.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => hapticTap()).not.toThrow();
    expect(() => hapticError()).not.toThrow();
    await Promise.resolve();
  });
});
