import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as { isAdmin?: boolean }).isAdmin ?? false;
        token.username = (user as { username?: string | null }).username ?? null;
      }
      return token;
    },
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
