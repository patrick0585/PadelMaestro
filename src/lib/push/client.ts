import type { PushNotificationsPlugin } from "@capacitor/push-notifications";

export const PUSH_TOKEN_KEY = "pm.pushToken";

const DEVICES_URL = "/api/push/devices";
const JSON_HEADERS = { "content-type": "application/json" };

// Nur Typ-Import: das Plugin kommt zur Laufzeit von der nativen Brücke.
export function getPushPlugin(): PushNotificationsPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  return window.Capacitor?.Plugins?.PushNotifications as PushNotificationsPlugin | undefined;
}

export async function registerThisDevice(token: string): Promise<void> {
  try {
    const res = await fetch(DEVICES_URL, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ token, platform: "ios" }),
    });
    if (res.ok) localStorage.setItem(PUSH_TOKEN_KEY, token);
  } catch {
    // Nächster App-Start meldet das Token erneut
  }
}

export async function unregisterThisDevice(): Promise<void> {
  let token: string | null;
  try {
    token = localStorage.getItem(PUSH_TOKEN_KEY);
  } catch {
    return;
  }
  if (!token) return;
  try {
    await fetch(DEVICES_URL, {
      method: "DELETE",
      headers: JSON_HEADERS,
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Abmelden darf daran nicht scheitern
  }
  localStorage.removeItem(PUSH_TOKEN_KEY);
}
