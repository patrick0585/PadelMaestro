import { prisma } from "../src/lib/db";
import { bootstrapAdmin, PlayerExistsError } from "../src/lib/group/bootstrap-admin";
import { resolveGroup, splitArgs, GroupNotFoundError } from "../src/lib/group/resolve-group";
import { AmbiguousGroupError } from "../src/lib/group/sole-group";
import { randomBytes } from "node:crypto";

async function main() {
  const argv = process.argv.slice(2);
  const { group: slug, positionals } = splitArgs(argv);
  const [email, name] = positionals;
  if (!email || !name) {
    console.error("Usage: pnpm bootstrap:admin <email> <name> [--group <slug>]");
    process.exit(1);
  }
  const password = randomBytes(12).toString("base64url");
  try {
    const groupId = slug ? (await resolveGroup(argv)).id : undefined;
    await bootstrapAdmin({ email, name, password, groupId });
  } catch (err) {
    if (
      err instanceof PlayerExistsError ||
      err instanceof GroupNotFoundError ||
      err instanceof AmbiguousGroupError
    ) {
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
