import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isNativeApp } from "@/lib/platform";

const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const SHELL_UA = `${SAFARI_IPHONE} PadelmaestroApp/1.0 (iOS)`;

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    get: () => ua,
  });
}

function setCapacitor(value: Window["Capacitor"]) {
  window.Capacitor = value;
}

describe("isNativeApp", () => {
  beforeEach(() => {
    delete window.Capacitor;
    setUserAgent(SAFARI_IPHONE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false in a plain browser", () => {
    expect(isNativeApp()).toBe(false);
  });

  it("returns true when the Capacitor bridge reports a native platform", () => {
    setCapacitor({ isNativePlatform: () => true });
    expect(isNativeApp()).toBe(true);
  });

  it("returns false when the bridge reports web", () => {
    setCapacitor({ isNativePlatform: () => false });
    expect(isNativeApp()).toBe(false);
  });

  it("falls back to the user agent marker", () => {
    setUserAgent(SHELL_UA);
    expect(isNativeApp()).toBe(true);
  });

  it("falls back to the user agent when isNativePlatform throws", () => {
    setCapacitor({
      isNativePlatform: () => {
        throw new Error("bridge broken");
      },
    });
    setUserAgent(SHELL_UA);
    expect(isNativeApp()).toBe(true);
    setUserAgent(SAFARI_IPHONE);
    expect(isNativeApp()).toBe(false);
  });

  it("returns false without window (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(isNativeApp()).toBe(false);
  });
});
