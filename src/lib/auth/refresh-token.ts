import type { JWT } from "next-auth/jwt";

export interface PlayerLookup {
  isAdmin: boolean;
  username: string | null;
  deletedAt: Date | null;
}

export interface PlayerLookupClient {
  findUnique(id: string): Promise<PlayerLookup | null>;
}

export type RefreshOutcome =
  | { kind: "ok"; token: JWT }
  | { kind: "invalidate" };

// Cap on how long we will keep serving a token whose DB-side fields could
// not be refreshed. Genuine transient issues (Postgres restart, brief
// connection drops) recover within seconds; anything longer than this means
// a real outage and the user should re-authenticate to get fresh claims.
// 5 minutes is well above the wall-clock duration of a Postgres package
// upgrade and well below any realistic privilege-escalation window.
export const STALE_REFRESH_AFTER_MS = 5 * 60 * 1000;

interface TokenWithRefreshedAt extends JWT {
  refreshedAt?: number;
}

// Refreshes mutable session fields (isAdmin, username) from the DB on every
// JWT renewal. Keeps the existing token when the lookup fails *and* the
// token was successfully refreshed within STALE_REFRESH_AFTER_MS, so users
// are not logged out by transient infrastructure issues. Beyond that grace
// window, a failed lookup invalidates the session — bounding the time a
// stale `isAdmin` claim could survive.
export async function refreshTokenFromPlayer(
  token: JWT,
  client: PlayerLookupClient,
  now: number = Date.now(),
): Promise<RefreshOutcome> {
  const id = (token as { id?: string }).id;
  if (!id) return { kind: "ok", token };

  let player: PlayerLookup | null;
  try {
    player = await client.findUnique(id);
  } catch (err) {
    const refreshedAt = (token as TokenWithRefreshedAt).refreshedAt ?? 0;
    const ageMs = now - refreshedAt;
    if (ageMs > STALE_REFRESH_AFTER_MS) {
      console.warn(
        "[auth] jwt refresh: db lookup failed and token is stale, invalidating session",
        err,
      );
      return { kind: "invalidate" };
    }
    console.warn(
      "[auth] jwt refresh: db lookup failed, keeping recently-refreshed token",
      err,
    );
    return { kind: "ok", token };
  }

  if (!player || player.deletedAt) {
    return { kind: "invalidate" };
  }

  const refreshed: TokenWithRefreshedAt = {
    ...token,
    isAdmin: player.isAdmin,
    username: player.username,
    refreshedAt: now,
  };
  return { kind: "ok", token: refreshed };
}
