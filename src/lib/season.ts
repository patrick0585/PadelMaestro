import { prisma } from "./db";

export async function getOrCreateActiveSeason() {
  const year = new Date().getFullYear();
  const existing = await prisma.season.findFirst({ where: { isActive: true } });
  if (existing) return existing;

  return prisma.season.create({
    data: {
      name: `Saison ${year}`,
      year,
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31),
      isActive: true,
    },
  });
}

export class NoActiveSeasonError extends Error {
  constructor() {
    super("no active season");
    this.name = "NoActiveSeasonError";
  }
}

export class OpenGameDaysError extends Error {
  readonly days: { date: Date; status: string }[];
  constructor(days: { date: Date; status: string }[]) {
    super(`season has ${days.length} unfinished game day(s)`);
    this.name = "OpenGameDaysError";
    this.days = days;
  }
}

export class InvalidSeasonNamesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSeasonNamesError";
  }
}

export class SeasonNameConflictError extends Error {
  constructor(name: string) {
    super(`season name already taken: ${name}`);
    this.name = "SeasonNameConflictError";
  }
}

export async function closeSeasonAndStartNext(args: {
  closedName: string;
  nextName: string;
  actorId: string;
}) {
  const closedName = args.closedName.trim();
  const nextName = args.nextName.trim();
  if (!closedName || !nextName)
    throw new InvalidSeasonNamesError("both names are required");
  if (closedName === nextName)
    throw new InvalidSeasonNamesError("names must differ");

  return prisma.$transaction(async (tx) => {
    const active = await tx.season.findFirst({ where: { isActive: true } });
    if (!active) throw new NoActiveSeasonError();

    const openDays = await tx.gameDay.findMany({
      where: { seasonId: active.id, status: { not: "finished" } },
      select: { date: true, status: true },
      orderBy: { date: "asc" },
    });
    if (openDays.length > 0) throw new OpenGameDaysError(openDays);

    const clash = await tx.season.findFirst({
      where: { name: { in: [closedName, nextName] }, id: { not: active.id } },
      select: { name: true },
    });
    if (clash) throw new SeasonNameConflictError(clash.name);

    const now = new Date();
    const year = now.getFullYear();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const previousName = active.name;
    const closedSeason = await tx.season.update({
      where: { id: active.id },
      data: { name: closedName, isActive: false, endDate: today },
    });
    const newSeason = await tx.season.create({
      data: {
        name: nextName,
        year,
        startDate: today,
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: args.actorId,
        action: "season.close",
        entityType: "Season",
        entityId: closedSeason.id,
        payload: { previousName, closedName, nextName, newSeasonId: newSeason.id },
      },
    });
    return { closedSeason, newSeason };
  });
}
