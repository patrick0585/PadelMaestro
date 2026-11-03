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
      email: "alice@x.de",
      username: "alice",
      deletedAt: new Date("2026-04-01T00:00:00Z"),
      sessionVersion: 0,
      membership: { groupId: "g1", role: "owner" },
    };
    const result = await refreshTokenFromPlayer(token(), client(async () => player));
    expect(result).toEqual({ kind: "invalidate" });
  });

  it("returns a new token object on success and does not mutate the input", async () => {
    const player: PlayerLookup = {
      email: "alice2@x.de",
      username: "alice2",
      deletedAt: null,
      sessionVersion: 0,
      membership: { groupId: "g1", role: "admin" },
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

  it("refresh copies email from the lookup into the token", async () => {
    const player: PlayerLookup = {
      email: "new@x.de",
      username: "alice",
      deletedAt: null,
      sessionVersion: 0,
      membership: null,
    };
    const result = await refreshTokenFromPlayer(
      token({ email: "old@x.de" }),
      client(async () => player),
      5000,
    );
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.token.email).toBe("new@x.de");
  });

  it("copies groupId and role and derives isAdmin true for owner", async () => {
    const player: PlayerLookup = {
      email: "alice@x.de",
      username: "alice",
      deletedAt: null,
      sessionVersion: 0,
      membership: { groupId: "g9", role: "owner" },
    };
    const result = await refreshTokenFromPlayer(token(), client(async () => player), 5000);
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.token.groupId).toBe("g9");
    expect(result.token.role).toBe("owner");
    expect(result.token.isAdmin).toBe(true);
  });

  it("derives isAdmin false for a plain member", async () => {
    const player: PlayerLookup = {
      email: "alice@x.de",
      username: "alice",
      deletedAt: null,
      sessionVersion: 0,
      membership: { groupId: "g9", role: "member" },
    };
    const result = await refreshTokenFromPlayer(token({ isAdmin: true }), client(async () => player));
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.token.role).toBe("member");
    expect(result.token.isAdmin).toBe(false);
  });

  it("clears groupId, role and isAdmin when the membership is gone but keeps the token", async () => {
    const player: PlayerLookup = {
      email: "alice@x.de",
      username: "alice",
      deletedAt: null,
      sessionVersion: 0,
      membership: null,
    };
    const input = token({ isAdmin: true, groupId: "g1", role: "admin" });
    const result = await refreshTokenFromPlayer(input, client(async () => player));
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("unreachable");
    expect(result.token.groupId).toBeNull();
    expect(result.token.role).toBeNull();
    expect(result.token.isAdmin).toBe(false);
    expect(input.groupId).toBe("g1");
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

  describe("sessionVersion", () => {
    const player = (sessionVersion: number): PlayerLookup => ({
      email: "alice@x.de",
      username: "alice",
      deletedAt: null,
      sessionVersion,
      membership: { groupId: "g1", role: "member" },
    });

    it("invalidates when the DB version differs from the token's", async () => {
      const result = await refreshTokenFromPlayer(
        token({ sessionVersion: 0 }),
        client(async () => player(1)),
      );
      expect(result).toEqual({ kind: "invalidate" });
    });

    it("keeps the session when the versions match", async () => {
      const result = await refreshTokenFromPlayer(
        token({ sessionVersion: 2 }),
        client(async () => player(2)),
      );
      expect(result.kind).toBe("ok");
    });

    it("treats a token without the field as version 0", async () => {
      expect((await refreshTokenFromPlayer(token(), client(async () => player(0)))).kind).toBe("ok");
      expect(await refreshTokenFromPlayer(token(), client(async () => player(1)))).toEqual({
        kind: "invalidate",
      });
    });
  });
});
