import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (f: string) => JSON.parse(readFileSync(resolve(root, f), "utf8"));

describe("capacitor.config.json", () => {
  const cfg = read("capacitor.config.json");

  it("hat App-Grunddaten", () => {
    expect(cfg.appId).toBe("de.padelmaestro.app");
    expect(cfg.appName).toBe("Padelmaestro");
    expect(cfg.webDir).toBe("capacitor-web");
  });

  it("lädt die Live-Seite mit Offline-Fallback", () => {
    expect(cfg.server.url).toBe("https://padelmaestro.de");
    expect(cfg.server.allowNavigation).toEqual(
      expect.arrayContaining(["padelmaestro.de", "www.padelmaestro.de"]),
    );
    expect(cfg.server.errorPath).toBe("offline.html");
  });

  it("konfiguriert iOS", () => {
    expect(cfg.ios.appendUserAgent).toBe("PadelmaestroApp/1.0 (iOS)");
    expect(cfg.ios.contentInset).toBe("never");
    expect(cfg.ios.backgroundColor).toBe("#0b1220");
  });

  it("konfiguriert Plugins", () => {
    expect(cfg.plugins.SplashScreen).toMatchObject({
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: "#0b1220",
    });
    expect(cfg.plugins.StatusBar).toMatchObject({
      style: "DARK",
      backgroundColor: "#0b1220",
    });
    expect(cfg.plugins.PushNotifications).toEqual({
      presentationOptions: ["banner", "list", "sound"],
    });
  });
});

describe("package.json Capacitor-Versionen", () => {
  const pkg = read("package.json");
  const all = { ...pkg.dependencies, ...pkg.devDependencies };
  const expected = {
    "@capacitor/core": "8.6.0",
    "@capacitor/cli": "8.6.0",
    "@capacitor/ios": "8.6.0",
    "@capacitor/status-bar": "8.0.4",
    "@capacitor/splash-screen": "8.0.2",
    "@capacitor/push-notifications": "8.1.3",
  };
  it.each(Object.entries(expected))("%s exakt %s", (name, v) => {
    expect(all[name]).toBe(v);
  });
});
