import { prisma } from "../../src/lib/db";

async function main() {
  const season = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
  const players = await prisma.player.findMany({ orderBy: { name: "asc" } });
  const byName = (n: string) => {
    const p = players.find((x) => x.name === n);
    if (!p) throw new Error(`Player ${n} not found – run seed-initial first`);
    return p;
  };
  const patrick = byName("Patrick");
  const werner = byName("Werner");
  const michi = byName("Michi");
  const thomas = byName("Thomas");
  const paul = byName("Paul");
  const rene = byName("Rene");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const day = await prisma.gameDay.create({
    data: {
      seasonId: season.id,
      date: today,
      playerCount: 6,
      status: "in_progress",
      participants: {
        create: [patrick, werner, michi, thomas, paul, rene].map((p) => ({
          playerId: p.id,
          attendance: "confirmed",
        })),
      },
    },
  });

  const now = new Date();
  const earlier = new Date(now.getTime() - 42 * 60 * 1000);

  await prisma.match.createMany({
    data: [
      {
        gameDayId: day.id,
        matchNumber: 1,
        team1PlayerAId: patrick.id,
        team1PlayerBId: werner.id,
        team2PlayerAId: michi.id,
        team2PlayerBId: thomas.id,
        team1Score: 2,
        team2Score: 1,
        scoredById: patrick.id,
        scoredAt: earlier,
      },
      {
        gameDayId: day.id,
        matchNumber: 2,
        team1PlayerAId: paul.id,
        team1PlayerBId: rene.id,
        team2PlayerAId: patrick.id,
        team2PlayerBId: michi.id,
        team1Score: 0,
        team2Score: 3,
        scoredById: werner.id,
        scoredAt: now,
      },
      {
        gameDayId: day.id,
        matchNumber: 3,
        team1PlayerAId: werner.id,
        team1PlayerBId: thomas.id,
        team2PlayerAId: paul.id,
        team2PlayerBId: rene.id,
      },
      {
        gameDayId: day.id,
        matchNumber: 4,
        team1PlayerAId: patrick.id,
        team1PlayerBId: paul.id,
        team2PlayerAId: werner.id,
        team2PlayerBId: michi.id,
      },
      {
        gameDayId: day.id,
        matchNumber: 5,
        team1PlayerAId: thomas.id,
        team1PlayerBId: rene.id,
        team2PlayerAId: patrick.id,
        team2PlayerBId: werner.id,
      },
    ],
  });

  console.log(`Seeded in_progress game day ${day.id} with 6 players and 5 matches (2 scored).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
