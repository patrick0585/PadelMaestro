import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authorizeCredentials } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db";

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
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
        token.username = (user as { username?: string | null }).username ?? null;
        return token;
      }

      const id = (token as { id?: string }).id;
      if (!id) return token;

      const player = await prisma.player.findUnique({
        where: { id },
        select: { isAdmin: true, deletedAt: true, username: true },
      });

      if (!player || player.deletedAt) {
        return null;
      }

      token.isAdmin = player.isAdmin;
      token.username = player.username;
      return token;
    },
  },
});

declare module "next-auth" {
  interface User {
    isAdmin?: boolean;
    username?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      username: string | null;
      isAdmin: boolean;
    };
  }
}
