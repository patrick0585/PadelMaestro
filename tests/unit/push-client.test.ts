import { describe, it, expect, vi, afterEach } from "vitest";
import { getPushPlugin, unregisterThisDevice, PUSH_TOKEN_KEY } from "@/lib/push/client";

afterEach(() => {
  delete window.Capacitor;
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("getPushPlugin", () => {
  it("liest das Plugin aus window.Capacitor", () => {
    const plugin = { register: vi.fn() };
    window.Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: plugin } };
    expect(getPushPlugin()).toBe(plugin);
  });

  it("liefert undefined ohne Capacitor", () => {
    expect(getPushPlugin()).toBeUndefined();
  });
});

describe("unregisterThisDevice", () => {
  it("nutzt den Key pm.pushToken", () => {
    expect(PUSH_TOKEN_KEY).toBe("pm.pushToken");
  });

  it("sendet DELETE mit dem gespeicherten Token und löscht den Key", async () => {
    localStorage.setItem("pm.pushToken", "abc123");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);
    await unregisterThisDevice();
    expect(fetchMock).toHaveBeenCalledWith("/api/push/devices", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "abc123" }),
    });
    expect(localStorage.getItem("pm.pushToken")).toBeNull();
  });

  it("schickt ohne Token keinen Request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await unregisterThisDevice();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("schluckt Netzwerkfehler und löscht den Key trotzdem", async () => {
    localStorage.setItem("pm.pushToken", "abc123");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(unregisterThisDevice()).resolves.toBeUndefined();
    expect(localStorage.getItem("pm.pushToken")).toBeNull();
  });
});
