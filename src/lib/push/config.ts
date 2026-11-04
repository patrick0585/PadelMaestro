import { readFileSync } from "node:fs";

export type ApnsConfig = { keyId: string; teamId: string; keyPem: string; bundleId: string };

let warned = false;

function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(`[push] ${message}`);
}

export function loadApnsConfig(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID;
  const teamId = env.APNS_TEAM_ID;
  const keyPath = env.APNS_KEY_PATH;
  const bundleId = env.APNS_BUNDLE_ID;
  if (!keyId || !teamId || !keyPath || !bundleId) {
    warnOnce("APNs nicht konfiguriert, Protokoll-Modus");
    return null;
  }
  try {
    return { keyId, teamId, keyPem: readFileSync(keyPath, "utf8"), bundleId };
  } catch {
    warnOnce("APNs-Schlüsseldatei nicht lesbar, Protokoll-Modus");
    return null;
  }
}
