import { prisma } from "../src/lib/db";
import { bootstrapAdmin, PlayerExistsError } from "../src/lib/group/bootstrap-admin";
import { randomBytes } from "node:crypto";

async function main() {
  const email = process.argv[2];
  const name = process.argv[3];
  if (!email || !name) {
    console.error("Usage: pnpm bootstrap:admin <email> <name>");
    process.exit(1);
  }
  const password = randomBytes(12).toString("base64url");
  try {
    await bootstrapAdmin({ email, name, password });
  } catch (err) {
    if (err instanceof PlayerExistsError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
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
