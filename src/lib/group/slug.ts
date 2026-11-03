import type { Prisma, PrismaClient } from "@prisma/client";

const MAX_LENGTH = 40;

const TRANSLITERATIONS: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
};

function trimDashes(s: string): string {
  return s.replace(/^-+|-+$/g, "");
}

export function slugify(name: string): string {
  const slug = trimDashes(
    name
      .replace(/[äöüßÄÖÜ]/g, (c) => TRANSLITERATIONS[c])
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),
  );
  return trimDashes(slug.slice(0, MAX_LENGTH)) || "gruppe";
}

export async function uniqueSlug(
  db: Prisma.TransactionClient | PrismaClient,
  name: string,
): Promise<string> {
  const base = slugify(name);
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = trimDashes(base.slice(0, MAX_LENGTH - suffix.length)) + suffix;
    if (!(await db.group.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
      return candidate;
    }
  }
}
