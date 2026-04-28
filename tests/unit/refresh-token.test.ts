import { describe, it, expect, vi } from "vitest";
import type { JWT } from "next-auth/jwt";
import {
  refreshTokenFromPlayer,
  STALE_REFRESH_AFTER_MS,
  type PlayerLookup,
  type PlayerLookupClient,
} from "@/lib/auth/refresh-token";

function token(overrides: Partial<JWT> & { refreshedAt?: number } = {}): JWT {
  return {
    id: "p1",
    isAdmin: false,
    username: "alice",
    ...overrides,
  } as JWT;
}

function client(impl: PlayerLookupClient["findUnique"]): PlayerLookupClient {
  return { findUnique: impl };
}

describe("refreshTokenFromPlayer", () => {
  it("returns the token unchanged when the token has no id (anonymous)", async () => {
    const t = token({ id: undefined });
    const lookup = vi.fn();
    const result = await refreshTokenFromPlayer(t, client(lookup));
    expect(result).toEqual({ kind: "ok", token: t });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("invalidates the session when the player no longer exists", async () => {
    const result = await refreshTokenFromPlayer(
      token(),
      client(async () => null),
    );
    expect(result).toEqual({ kind: "invalidate" });
  });

  it("invalidates the session when the player has been soft-deleted", async () => {
    const player: PlayerLookup = {
      isAdmin: true,
      username: "alice",
      deletedAt: new Date("2026-04-01T00:00:00Z"),
    };
    const result = await refreshTokenFromPlayer(token(), client(async () => player));
    expect(result).toEqual({ kind: "invalidate" });
  });

  it("returns a new token object on success and does not mutate the input", async () => {
    const player: PlayerLookup = {
      isAdmin: true,
      username: "alice2",
      deletedAt: null,
    };
    const input = token({ isAdmin: false, username: "alice", refreshedAt: 1000 });
    const result = await refreshTokenFromPlayer(input, client(async () => player), 5000);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.token).not.toBe(input);
    expect(result.token.isAdmin).toBe(true);
    expect(result.token.username).toBe("alice2");
    expect((result.token as { refreshedAt?: number }).refreshedAt).toBe(5000);
    // input must remain untouched
    expect(input.isAdmin).toBe(false);
    expect(input.username).toBe("alice");
    expect((input as { refreshedAt?: number }).refreshedAt).toBe(1000);
  });

  it("keeps the existing token when the DB lookup throws within the grace window", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const now = 10_000_000;
    const fresh = now - 1000; // 1 second old
    const t = token({ isAdmin: true, username: "alice", refreshedAt: fresh });
    const result = await refreshTokenFromPlayer(
      t,
      client(async () => {
        throw new Error("Connection terminated by administrator");
      }),
      now,
    );
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.token).toBe(t);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("invalidates when the DB lookup throws and the token is older than the grace window", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const now = 10_000_000;
    const stale = now - STALE_REFRESH_AFTER_MS - 1;
    const t = token({ isAdmin: true, refreshedAt: stale });
    const result = await refreshTokenFromPlayer(
      t,
      client(async () => {
        throw new Error("Connection terminated by administrator");
      }),
      now,
    );
    expect(result).toEqual({ kind: "invalidate" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("invalidates when the DB throws and the token has no refreshedAt at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const t = token(); // no refreshedAt
    const result = await refreshTokenFromPlayer(
      t,
      client(async () => {
        throw new Error("PrismaClientValidationError: edge runtime");
      }),
    );
    expect(result).toEqual({ kind: "invalidate" });
    warn.mockRestore();
  });

  it("keeps the token across the specific edge-runtime Prisma error within the grace window", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const now = 10_000_000;
    const t = token({ refreshedAt: now - 60_000 });
    const result = await refreshTokenFromPlayer(
      t,
      client(async () => {
        throw new Error(
          "PrismaClientValidationError: In order to run Prisma Client on edge runtime",
        );
      }),
      now,
    );
    expect(result).toEqual({ kind: "ok", token: t });
    warn.mockRestore();
  });
});
