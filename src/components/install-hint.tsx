"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "padel.installHintDismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS uses the legacy navigator.standalone flag; everyone else uses the
  // CSS media query. Either being true means we're already installed.
  const iosStandalone =
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const mqStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  return iosStandalone || mqStandalone;
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  // Chrome on iOS reports as CriOS, Firefox as FxiOS, Edge as EdgiOS.
  // In-app browsers (FBAN/FBAV for Facebook, Instagram, etc.) cannot
  // install PWAs, so we hide the hint there too.
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|Line/i.test(ua);
  return isIos && !isOtherBrowser;
}

export function InstallHint() {
  const [androidEvent, setAndroidEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    setShowIos(isIosSafari());

    const persistDismiss = () => {
      window.localStorage.setItem(DISMISS_KEY, "1");
      setDismissed(true);
    };

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setAndroidEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      // Persist so a future beforeinstallprompt (e.g. after manifest
      // changes) doesn't resurrect the banner on an installed app.
      setAndroidEvent(null);
      setShowIos(false);
      persistDismiss();
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (dismissed || (!androidEvent && !showIos)) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  const installAndroid = async () => {
    try {
      await androidEvent!.prompt();
      await androidEvent!.userChoice;
    } catch {
      // prompt() rejects on a stale/already-used event — drop silently.
    }
    // beforeinstallprompt is single-use. Drop our reference and persist
    // the dismiss so the banner stays gone on the next visit too.
    setAndroidEvent(null);
    dismiss();
  };

  return (
    <div className="flex justify-center px-4 pb-3 pt-2 md:pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div
        role="region"
        aria-label="App auf dem Home-Bildschirm hinzufügen"
        className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated/95 p-4 shadow-xl backdrop-blur"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-foreground">
            {androidEvent ? (
              <p>
                Padelmaestro auf dem Startbildschirm? Schneller Zugriff und Vollbild —
                ohne Browser-Leiste.
              </p>
            ) : (
              <p>
                Tipp: <span className="font-semibold">Teilen-Symbol</span> antippen,
                dann <span className="font-semibold">„Zum Home-Bildschirm“</span>{" "}
                — dann startet Padelmaestro im Vollbild wie eine App.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1 text-foreground-muted hover:text-foreground"
            aria-label="Hinweis schließen"
          >
            ×
          </button>
        </div>
        {androidEvent && (
          <div className="mt-3">
            <button
              type="button"
              onClick={installAndroid}
              className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-background hover:bg-primary-strong"
            >
              Installieren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
