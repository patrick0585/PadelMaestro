import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/hash";
import { randomBytes } from "node:crypto";

async function main() {
  const email = process.argv[2];
  const name = process.argv[3];
  if (!email || !name) {
    console.error("Usage: pnpm bootstrap:admin <email> <name>");
    process.exit(1);
  }
  const existing = await prisma.player.findUnique({ where: { email } });
  if (existing) {
    console.error(`Player with email ${email} already exists`);
    process.exit(1);
  }
  const password = randomBytes(12).toString("base64url");
  const hash = await hashPassword(password);
  await prisma.player.create({
    data: { name, email, passwordHash: hash, isAdmin: true },
  });
  console.log(`Created admin ${email}.`);
  console.log(`Temporary password: ${password}`);
  console.log(`Login at /login and change it later.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
