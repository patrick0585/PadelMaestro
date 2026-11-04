import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApnsJwt, resetJwtCache } from "@/lib/push/apns";
import { loadApnsConfig, type ApnsConfig } from "@/lib/push/config";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const keyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config: ApnsConfig = { keyId: "KEY1234567", teamId: "TEAM123456", keyPem, bundleId: "de.example.app" };

const b64 = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

afterEach(() => {
  vi.useRealTimers();
  resetJwtCache();
});

describe("createApnsJwt", () => {
  it("has correct header/claims and a verifiable P1363 signature", () => {
    const jwt = createApnsJwt(config);
    const [h, c, s] = jwt.split(".");
    expect(b64(h)).toEqual({ alg: "ES256", kid: "KEY1234567" });
    const claims = b64(c);
    expect(claims.iss).toBe("TEAM123456");
    expect(Math.abs(claims.iat - Date.now() / 1000)).toBeLessThan(5);
    const sig = Buffer.from(s, "base64url");
    expect(sig.length).toBe(64);
    expect(
      verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, sig),
    ).toBe(true);
  });

  it("returns the cached token within 50 minutes, a new one afterwards", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T10:00:00Z"));
    const first = createApnsJwt(config);
    vi.setSystemTime(new Date("2026-11-04T10:49:00Z"));
    expect(createApnsJwt(config)).toBe(first);
    vi.setSystemTime(new Date("2026-11-04T10:51:00Z"));
    expect(createApnsJwt(config)).not.toBe(first);
  });
});

describe("loadApnsConfig", () => {
  const dir = mkdtempSync(join(tmpdir(), "apns-"));
  const path = join(dir, "key.p8");
  writeFileSync(path, keyPem);
  const env = { APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_KEY_PATH: path, APNS_BUNDLE_ID: "b" };

  it("reads the key file", () => {
    expect(loadApnsConfig(env)).toEqual({ keyId: "K", teamId: "T", keyPem, bundleId: "b" });
  });
  it("returns null when a variable is missing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadApnsConfig({ ...env, APNS_TEAM_ID: undefined })).toBeNull();
  });
  it("returns null when the file is unreadable", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadApnsConfig({ ...env, APNS_KEY_PATH: join(dir, "nope.p8") })).toBeNull();
  });
});
