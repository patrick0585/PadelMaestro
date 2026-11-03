import type { EmailTokenPurpose, Prisma } from "@prisma/client";

// Without a purpose, both verify and reset tokens are revoked.
export function revokeOpenTokens(
  tx: Prisma.TransactionClient,
  playerId: string,
  purpose?: EmailTokenPurpose,
  now: Date = new Date(),
) {
  return tx.emailToken.updateMany({
    where: { playerId, usedAt: null, ...(purpose && { purpose }) },
    data: { usedAt: now },
  });
}
