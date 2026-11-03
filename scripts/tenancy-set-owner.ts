import { prisma } from "../src/lib/db";
import { isGroupArgError, resolveGroup, splitArgs } from "../src/lib/group/resolve-group";
import { setGroupOwner } from "../src/lib/group/set-owner";

async function main() {
  const argv = process.argv.slice(2);
  const [email] = splitArgs(argv).positionals;
  if (!email) {
    console.error("Usage: pnpm tenancy:set-owner <email> [--group <slug>]");
    process.exit(1);
  }
  const group = await resolveGroup(argv);
  const { newOwnerId, previousOwnerId } = await setGroupOwner({
    email,
    groupId: group.id,
  });
  const owner = await prisma.player.findUniqueOrThrow({ where: { id: newOwnerId } });
  console.log(`${owner.name} (${newOwnerId}) ist jetzt Besitzer von ${group.name}`);
  if (previousOwnerId) {
    const prev = await prisma.player.findUniqueOrThrow({ where: { id: previousOwnerId } });
    console.log(`${prev.name} (${previousOwnerId}) ist jetzt Admin`);
  }
}

main()
  .catch((err) => {
    console.error(isGroupArgError(err) ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
