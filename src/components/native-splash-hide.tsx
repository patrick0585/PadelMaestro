"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/platform";

type SplashScreenPlugin = { hide?: () => Promise<void> | void };

export function NativeSplashHide(): null {
  useEffect(() => {
    if (!isNativeApp()) return;
    const splash = window.Capacitor?.Plugins?.SplashScreen as
      | SplashScreenPlugin
      | undefined;
    if (!splash?.hide) return;
    try {
      Promise.resolve(splash.hide()).catch(() => {});
    } catch {
      // Splash bleibt sichtbar bis zum Timeout der Hülle
    }
  }, []);
  return null;
}
