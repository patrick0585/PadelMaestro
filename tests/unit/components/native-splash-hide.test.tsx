import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { NativeSplashHide } from "@/components/native-splash-hide";

afterEach(() => {
  delete window.Capacitor;
});

describe("NativeSplashHide", () => {
  it("hides the native splash once after mount inside the app", () => {
    const hide = vi.fn();
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { SplashScreen: { hide } },
    };
    const { rerender } = render(<NativeSplashHide />);
    rerender(<NativeSplashHide />);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("does nothing in a plain browser", () => {
    const { container } = render(<NativeSplashHide />);
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing when the SplashScreen plugin is missing", () => {
    window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
    expect(() => render(<NativeSplashHide />)).not.toThrow();
  });

  it("ignores a rejected hide()", async () => {
    const hide = vi.fn(() => Promise.reject(new Error("x")));
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { SplashScreen: { hide } },
    };
    render(<NativeSplashHide />);
    await Promise.resolve();
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
