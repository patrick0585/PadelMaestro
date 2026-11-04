import { connect, type ClientHttp2Session } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";
import type { ApnsConfig } from "./config";

export type ApnsEnvironment = "sandbox" | "production";
export type ApnsResult = { ok: true } | { ok: false; status: number; reason: string };
export type ApnsTransport = (i: {
  environment: ApnsEnvironment;
  token: string;
  payload: object;
  config: ApnsConfig;
}) => Promise<ApnsResult>;

const JWT_MAX_AGE_MS = 50 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: "api.sandbox.push.apple.com",
  production: "api.push.apple.com",
};

let cachedJwt: { key: string; token: string; createdAt: number } | null = null;

export function resetJwtCache(): void {
  cachedJwt = null;
}

export function createApnsJwt(config: ApnsConfig): string {
  const now = Date.now();
  const key = `${config.keyId}:${config.teamId}`;
  if (cachedJwt && cachedJwt.key === key && now - cachedJwt.createdAt < JWT_MAX_AGE_MS) return cachedJwt.token;
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = `${enc({ alg: "ES256", kid: config.keyId })}.${enc({ iss: config.teamId, iat: Math.floor(now / 1000) })}`;
  const signature = sign("sha256", Buffer.from(data), {
    key: createPrivateKey(config.keyPem),
    dsaEncoding: "ieee-p1363",
  });
  const token = `${data}.${signature.toString("base64url")}`;
  cachedJwt = { key, token, createdAt: now };
  return token;
}

const sessions = new Map<string, ClientHttp2Session>();

function evictSession(host: string, session: ClientHttp2Session): void {
  if (sessions.get(host) === session) sessions.delete(host);
}

function getSession(host: string): ClientHttp2Session {
  const existing = sessions.get(host);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const session = connect(`https://${host}`);
  const drop = () => evictSession(host, session);
  session.on("error", drop);
  session.on("close", drop);
  session.on("goaway", drop);
  sessions.set(host, session);
  return session;
}

// Der CLI-Job ruft das am Ende auf, sonst hält die offene Session den Prozess am Leben.
export function closeApnsSessions(): void {
  for (const session of sessions.values()) session.close();
  sessions.clear();
}

export const http2Transport: ApnsTransport = ({ environment, token, payload, config }) =>
  new Promise<ApnsResult>((resolve, reject) => {
    const host = HOSTS[environment];
    const session = getSession(host);
    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      authorization: `bearer ${createApnsJwt(config)}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    const chunks: Buffer[] = [];
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      // Halboffene Verbindung: Session verwerfen, damit der nächste Versand neu verbindet.
      evictSession(host, session);
      session.destroy();
      reject(new Error("APNs request timeout"));
    });
    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("error", reject);
    req.on("end", () => {
      if (status === 200) return resolve({ ok: true });
      let reason = "Unknown";
      try {
        const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (parsed && typeof parsed === "object" && "reason" in parsed && typeof parsed.reason === "string") {
          reason = parsed.reason;
        }
      } catch {
        // Body fehlt oder ist kein JSON
      }
      resolve({ ok: false, status, reason });
    });
    req.end(JSON.stringify(payload));
  });
