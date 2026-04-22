import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { authorizeCredentials } from "@/lib/auth/authorize";

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

// JWT augmentation: In NextAuth v5 beta, JWT interface augmentation via module declaration
// doesn't work due to module resolution, so we cast token types inline in auth.config.ts
// @ts-expect-error - module 'next-auth/jwt' cannot be found in this NextAuth version
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isAdmin?: boolean;
    username?: string | null;
  }
}
