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
