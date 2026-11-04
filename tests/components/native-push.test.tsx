import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

import { NativePush } from "@/components/native-push";

type Listener = (payload: unknown) => void;

function fakePlugin(permission: "prompt" | "granted" | "denied", afterRequest = "granted") {
  const calls: string[] = [];
  const listeners = new Map<string, Listener>();
  const removes: string[] = [];
  const plugin = {
    addListener: vi.fn(async (event: string, fn: Listener) => {
      calls.push(`listen:${event}`);
      listeners.set(event, fn);
      return { remove: vi.fn(async () => void removes.push(event)) };
    }),
    checkPermissions: vi.fn(async () => {
      calls.push("check");
      return { receive: permission };
    }),
    requestPermissions: vi.fn(async () => {
      calls.push("request");
      return { receive: afterRequest };
    }),
    register: vi.fn(async () => void calls.push("register")),
  };
  return { plugin, calls, listeners, removes };
}

function install(plugin: unknown) {
  window.Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: plugin } };
}

const fetchMock = vi.fn();

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 204 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete window.Capacitor;
  localStorage.clear();
  vi.unstubAllGlobals();
});

function tap(listeners: Map<string, Listener>, data: Record<string, unknown>) {
  listeners.get("pushNotificationActionPerformed")!({
    actionId: "tap",
    notification: { id: "1", data },
  });
}

describe("NativePush", () => {
  it("ruft außerhalb der App kein Plugin auf", async () => {
    const { plugin } = fakePlugin("granted");
    window.Capacitor = { isNativePlatform: () => false, Plugins: { PushNotifications: plugin } };
    render(<NativePush activeGroupId="g1" />);
    await Promise.resolve();
    expect(plugin.addListener).not.toHaveBeenCalled();
    expect(plugin.checkPermissions).not.toHaveBeenCalled();
  });

  it("registriert die Listener vor der Erlaubnisabfrage", async () => {
    const { plugin, calls } = fakePlugin("prompt");
    install(plugin);
    render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(plugin.register).toHaveBeenCalled());
    expect(calls).toEqual([
      "listen:registration",
      "listen:registrationError",
      "listen:pushNotificationActionPerformed",
      "check",
      "request",
      "register",
    ]);
  });

  it("registriert bei granted direkt ohne Nachfrage", async () => {
    const { plugin } = fakePlugin("granted");
    install(plugin);
    render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(plugin.register).toHaveBeenCalledTimes(1));
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it("registriert nicht, wenn die Erlaubnis verweigert wird", async () => {
    const { plugin } = fakePlugin("prompt", "denied");
    install(plugin);
    render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(plugin.requestPermissions).toHaveBeenCalled());
    await Promise.resolve();
    expect(plugin.register).not.toHaveBeenCalled();
  });

  it("meldet das Token per POST und speichert es", async () => {
    const { plugin, listeners } = fakePlugin("granted");
    install(plugin);
    render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(listeners.has("registration")).toBe(true));
    listeners.get("registration")!({ value: "deadbeef" });
    await waitFor(() => expect(localStorage.getItem("pm.pushToken")).toBe("deadbeef"));
    expect(fetchMock).toHaveBeenCalledWith("/api/push/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "deadbeef", platform: "ios" }),
    });
  });

  it("wechselt bei Tipp aus fremder Gruppe erst die Gruppe, dann zum Spieltag", async () => {
    const { plugin, listeners } = fakePlugin("granted");
    install(plugin);
    render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(listeners.has("pushNotificationActionPerformed")).toBe(true));
    const order: string[] = [];
    fetchMock.mockImplementation(async () => {
      order.push("patch");
      return { ok: true, status: 204 };
    });
    push.mockImplementation(() => order.push("push"));
    tap(listeners, { gameDayId: "d1", groupId: "g2" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/profile/active-group", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupId: "g2" }),
    });
    expect(push).toHaveBeenCalledWith("/game-day");
    expect(order).toEqual(["patch", "push"]);
  });

  it("navigiert bei gleicher Gruppe ohne PATCH", async () => {
    const { plugin, listeners } = fakePlugin("granted");
    install(plugin);
    render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(listeners.has("pushNotificationActionPerformed")).toBe(true));
    tap(listeners, { gameDayId: "d1", groupId: "g1" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/game-day"));
    expect(refresh).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/profile/active-group", expect.anything());
  });

  it("navigiert trotz PATCH 403", async () => {
    const { plugin, listeners } = fakePlugin("granted");
    install(plugin);
    render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(listeners.has("pushNotificationActionPerformed")).toBe(true));
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    tap(listeners, { gameDayId: "d1", groupId: "g2" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/game-day"));
    expect(fetchMock).toHaveBeenCalledWith("/api/profile/active-group", expect.anything());
  });

  it("nutzt die aktuelle Gruppe nach einem Wechsel", async () => {
    const { plugin, listeners } = fakePlugin("granted");
    install(plugin);
    const { rerender } = render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(listeners.has("pushNotificationActionPerformed")).toBe(true));
    rerender(<NativePush activeGroupId="g2" />);
    tap(listeners, { gameDayId: "d1", groupId: "g2" });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/game-day"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(plugin.addListener).toHaveBeenCalledTimes(3);
  });

  it("entfernt die Listener beim Unmount", async () => {
    const { plugin, removes } = fakePlugin("granted");
    install(plugin);
    const { unmount } = render(<NativePush activeGroupId="g1" />);
    await waitFor(() => expect(plugin.register).toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(removes).toHaveLength(3));
  });
});
