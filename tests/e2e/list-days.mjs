import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const days = await prisma.gameDay.findMany({
  orderBy: { date: "desc" },
  take: 8,
  select: { id: true, date: true, status: true, createdAt: true, _count: { select: { matches: true, participants: true } } },
});
console.log(JSON.stringify(days, null, 2));
await prisma.$disconnect();
