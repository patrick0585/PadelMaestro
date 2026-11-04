export const NATIVE_UA_MARKER = "PadelmaestroApp/";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: Record<string, unknown>;
    };
  }
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.Capacitor?.isNativePlatform?.() === true) return true;
  } catch {
    // Bridge defekt: auf UA-Marker zurückfallen
  }
  return window.navigator.userAgent.includes(NATIVE_UA_MARKER);
}
