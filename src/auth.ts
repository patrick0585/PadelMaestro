import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authorizeCredentials } from "@/lib/auth/authorize";
import { findPlayerForRefresh } from "@/lib/auth/refresh-lookup";
import { refreshTokenFromPlayer } from "@/lib/auth/refresh-token";
import { prisma } from "@/lib/db";
import type { GroupRole } from "@/lib/auth/roles";

const DEV_PLACEHOLDERS = new Set([
  "dev-secret-replace-me",
  "dev-secret-replace-me-in-production",
  "replace-me",
  "changeme",
]);

if (process.env.NODE_ENV === "production") {
  const secret = process.env.AUTH_SECRET ?? "";
  const normalised = secret.toLowerCase();
  if (!secret || secret.length < 32 || DEV_PLACEHOLDERS.has(normalised) || normalised.startsWith("dev-secret-replace-me")) {
    throw new Error(
      "AUTH_SECRET is missing, too short, or still set to a dev placeholder. " +
        "Generate a real secret with `openssl rand -base64 32` and set it in .env before starting in production.",
    );
  }
}

export { authorizeCredentials as authorizeForTests };

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "E-Mail oder Benutzername" },
        password: { label: "Passwort", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    // Forward only the session callback explicitly. Avoid `...authConfig.callbacks`
    // so a future addition to auth.config.ts cannot silently shadow or duplicate
    // the jwt callback below — that drift was a real bug we just removed.
    session: authConfig.callbacks.session,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = user.isAdmin ?? false;
        token.username = user.username ?? null;
        token.groupId = user.groupId ?? null;
        token.role = user.role ?? null;
        token.sessionVersion = user.sessionVersion ?? 0;
        token.refreshedAt = Date.now();
        return token;
      }

      const result = await refreshTokenFromPlayer(token, {
        findUnique: (id) => findPlayerForRefresh(prisma, id),
      });
      return result.kind === "ok" ? result.token : null;
    },
  },
});

declare module "next-auth" {
  interface User {
    isAdmin?: boolean;
    username?: string | null;
    groupId?: string | null;
    role?: GroupRole | null;
    sessionVersion?: number;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      username: string | null;
      isAdmin: boolean;
      groupId: string | null;
      role: GroupRole | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isAdmin?: boolean;
    username?: string | null;
    groupId?: string | null;
    role?: GroupRole | null;
    refreshedAt?: number;
    sessionVersion?: number;
  }
}
