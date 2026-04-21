import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { authConfig } from "@/auth.config";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Dummy bcrypt hash of a random string so timing is equalised on unknown email.
// Generated once; safe to expose since matching against it still returns false
// for any real password.
const DUMMY_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8xWJh7G4r8vGG3qJPiE5qiVXc3vN8C";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.player.findFirst({
          where: { email: parsed.data.email, deletedAt: null },
        });
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const ok = await verifyPassword(parsed.data.password, hash);
        if (!ok || !user) return null;
        return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
      },
    }),
  ],
});

declare module "next-auth" {
  interface User {
    isAdmin?: boolean;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isAdmin: boolean;
    };
  }
}
