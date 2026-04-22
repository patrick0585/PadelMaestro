import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/hash";
import { randomBytes } from "node:crypto";

async function main() {
  const identifier = process.argv[2];
  const explicitPassword = process.argv[3];
  if (!identifier) {
    console.error("Usage: pnpm reset:password <email-or-username> [new-password]");
    console.error("If no password is given, a random one is generated and printed.");
    process.exit(1);
  }

  const player = await prisma.player.findFirst({
    where: {
      OR: [{ email: identifier }, { username: identifier.toLowerCase() }],
      deletedAt: null,
    },
  });
  if (!player) {
    console.error(`No active player found with email or username "${identifier}".`);
    process.exit(1);
  }

  const password = explicitPassword ?? randomBytes(12).toString("base64url");
  const hash = await hashPassword(password);
  await prisma.player.update({
    where: { id: player.id },
    data: { passwordHash: hash },
  });

  console.log(`Password reset for ${player.name} (${player.email}).`);
  if (!explicitPassword) {
    console.log(`New password: ${password}`);
    console.log("Login at /login and change it via the UI afterwards.");
  } else {
    console.log("Using the password you supplied.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
