import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/hash";

const ADMIN_NAME = "Patrick";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "patrick@padel.local";

const NON_ADMIN_PLAYERS: Array<{ name: string; email: string }> = [
  { name: "Werner", email: "werner@padel.local" },
  { name: "Michi", email: "michi@padel.local" },
  { name: "Thomas", email: "thomas@padel.local" },
  { name: "Paul", email: "paul@padel.local" },
  { name: "Rene", email: "rene@padel.local" },
];

export async function seedInitial(options: { adminPassword?: string } = {}): Promise<{
  adminPassword: string;
  adminId: string;
  seasonId: string;
}> {
  const existingPlayers = await prisma.player.count();
  const existingSeasons = await prisma.season.count();
  if (existingPlayers > 0 || existingSeasons > 0) {
    throw new Error(
      `DB is not empty (${existingPlayers} players, ${existingSeasons} seasons). Refusing to seed. ` +
        `Use 'pnpm import:statistik --yes' to wipe + seed + import.`,
    );
  }

  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: {
      year,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
      isActive: true,
    },
  });

  const adminPassword = options.adminPassword ?? randomBytes(12).toString("base64url");
  const adminHash = await hashPassword(adminPassword);

  const admin = await prisma.player.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      isAdmin: true,
    },
  });

  for (const p of NON_ADMIN_PLAYERS) {
    await prisma.player.create({
      data: { name: p.name, email: p.email, passwordHash: null, isAdmin: false },
    });
  }

  return { adminPassword, adminId: admin.id, seasonId: season.id };
}

async function main() {
  const envPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const { adminPassword, adminId, seasonId } = await seedInitial({
    adminPassword: envPassword && envPassword.length > 0 ? envPassword : undefined,
  });
  const wasGenerated = !envPassword || envPassword.length === 0;

  console.log(`Created season (${seasonId}) and 6 players.`);
  console.log(`Admin: ${ADMIN_EMAIL} (id=${adminId})`);
  if (wasGenerated) {
    console.log(`Temporary admin password: ${adminPassword}`);
    console.warn(`IMPORTANT: log in at /login and change this password via /profil immediately.`);
  } else {
    console.log(`Admin password set from INITIAL_ADMIN_PASSWORD env.`);
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
