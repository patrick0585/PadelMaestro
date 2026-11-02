import { prisma } from "../src/lib/db";
import { getSoleGroup } from "../src/lib/group/sole-group";
import { setGroupOwner } from "../src/lib/group/set-owner";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm tenancy:set-owner <email>");
    process.exit(1);
  }
  const group = await getSoleGroup();
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
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
