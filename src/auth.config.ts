import type { NextAuthConfig } from "next-auth";
import type { GroupRole } from "@/lib/auth/roles";

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
        (session.user as { id: string }).id = token.id ?? "";
        (session.user as { isAdmin: boolean }).isAdmin = token.isAdmin ?? false;
        (session.user as { username: string | null }).username = token.username ?? null;
        (session.user as { groupId: string | null }).groupId = token.groupId ?? null;
        (session.user as { role: GroupRole | null }).role = token.role ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
