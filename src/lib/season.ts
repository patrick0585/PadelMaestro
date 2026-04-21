import { prisma } from "./db";

export async function getOrCreateActiveSeason() {
  const year = new Date().getFullYear();
  const existing = await prisma.season.findFirst({ where: { isActive: true } });
  if (existing) return existing;

  return prisma.season.create({
    data: {
      year,
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31),
      isActive: true,
    },
  });
}

export async function closeSeason(id: string) {
  return prisma.season.update({ where: { id }, data: { isActive: false } });
}
