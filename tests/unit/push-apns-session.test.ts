import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { generateKeyPairSync } from "node:crypto";

type FakeStream = EventEmitter & { setTimeout: (ms: number, cb: () => void) => void; end: () => void; close: () => void; fire: () => void };
type FakeSession = EventEmitter & { closed: boolean; destroyed: boolean; destroy: () => void; close: () => void; request: () => FakeStream };

const created: FakeSession[] = [];
const streams: FakeStream[] = [];

vi.mock("node:http2", () => {
  const connect = () => {
    const session = Object.assign(new EventEmitter(), {
      closed: false,
      destroyed: false,
      close() {
        this.closed = true;
      },
      destroy() {
        this.destroyed = true;
      },
      request() {
        let cb: () => void = () => {};
        const stream = Object.assign(new EventEmitter(), {
          setTimeout: (_ms: number, f: () => void) => {
            cb = f;
          },
          end: () => {},
          close: () => {},
          fire: () => cb(),
        });
        streams.push(stream);
        return stream;
      },
    }) as FakeSession;
    created.push(session);
    return session;
  };
  return { connect, default: { connect } };
});

import { http2Transport, closeApnsSessions, resetJwtCache } from "@/lib/push/apns";

const pem = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const input = {
  environment: "production" as const,
  token: "abc",
  payload: {},
  config: { keyId: "k", teamId: "t", keyPem: pem, bundleId: "b" },
};

beforeEach(() => {
  created.length = 0;
  streams.length = 0;
  closeApnsSessions();
  resetJwtCache();
});

describe("http2Transport session cache", () => {
  it("destroys and evicts the session on timeout so the next request reconnects", async () => {
    const first = http2Transport(input);
    streams[0].fire();
    await expect(first).rejects.toThrow(/timeout/);
    expect(created[0].destroyed).toBe(true);

    void http2Transport(input);
    expect(created).toHaveLength(2);
  });

  it("reuses a healthy session", () => {
    void http2Transport(input);
    void http2Transport(input);
    expect(created).toHaveLength(1);
  });
});
