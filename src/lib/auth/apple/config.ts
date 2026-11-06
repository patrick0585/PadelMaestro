import { readFileSync } from "node:fs";

export interface AppleConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
  servicesId: string;
}

type Env = Record<string, string | undefined>;

function readPrivateKey(env: Env): string | null {
  const inline = env.APPLE_PRIVATE_KEY?.trim();
  if (inline) return inline.replace(/\\n/g, "\n");
  const path = env.APPLE_PRIVATE_KEY_PATH?.trim();
  if (!path) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function appleConfig(env: Env = process.env): AppleConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim();
  const keyId = env.APPLE_KEY_ID?.trim();
  const bundleId = env.APPLE_BUNDLE_ID?.trim();
  const servicesId = env.APPLE_SERVICES_ID?.trim();
  const privateKey = readPrivateKey(env);
  if (!teamId || !keyId || !bundleId || !servicesId || !privateKey) return null;
  return { teamId, keyId, privateKey, bundleId, servicesId };
}

/** True only when everything for token verification and the code exchange is set. */
export function appleConfigured(env: Env = process.env): boolean {
  return appleConfig(env) !== null;
}
