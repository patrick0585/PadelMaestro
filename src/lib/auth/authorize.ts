import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { normaliseUsername } from "@/lib/auth/username";
import { rateLimitRequest } from "@/lib/rate-limit";

const CredentialsSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

// Dummy bcrypt hash so timing is equalised for unknown identifiers.
// Must use the same cost factor as hash.ts (12) or timing diverges.
const DUMMY_HASH =
  "$2b$12$8sANOXIue.8nEZjolEcnOeIuI/e.bcGuTH1cYjCoyhiLMSVkd6I4W";

export type AuthorizedUser = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  isAdmin: boolean;
};

export async function authorizeCredentials(
  raw: unknown,
  request?: Request,
): Promise<AuthorizedUser | null> {
  const parsed = CredentialsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { identifier, password } = parsed.data;
  if (request) {
    const rl = rateLimitRequest(request, "login", { windowMs: 60_000, max: 10 });
    if (!rl.allowed) return null;
  }
  const normalised = normaliseUsername(identifier);
  const player = await prisma.player.findFirst({
    where: {
      OR: [{ email: identifier }, { username: normalised }],
      deletedAt: null,
    },
  });
  const hash = player?.passwordHash ?? DUMMY_HASH;
  const ok = await verifyPassword(password, hash);
  if (!ok || !player) return null;
  return {
    id: player.id,
    email: player.email,
    name: player.name,
    username: player.username,
    isAdmin: player.isAdmin,
  };
}
