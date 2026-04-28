import type { NextAuthConfig } from "next-auth";

// Must stay edge-safe: this config is imported by src/middleware.ts which
// runs in the Edge Runtime. No Prisma, no Node-only imports here — the
// DB-refreshing JWT callback lives in src/auth.ts (Node) instead.
//
// The session callback below shapes what `auth()` returns to consumers
// (including middleware). The jwt callback is intentionally absent: the
// canonical jwt callback lives in src/auth.ts and would silently shadow
// any duplicate here, which previously caused identical sign-in logic to
// drift across the two files.
export const authConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        const typedToken = token as { id?: string; isAdmin?: boolean; username?: string | null };
        (session.user as { id: string }).id = typedToken.id ?? "";
        (session.user as { isAdmin: boolean }).isAdmin = typedToken.isAdmin ?? false;
        (session.user as { username: string | null }).username = typedToken.username ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
