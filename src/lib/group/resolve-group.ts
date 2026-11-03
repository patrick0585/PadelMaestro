import { parseArgs } from "node:util";
import type { Group } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSoleGroup } from "./sole-group";

export class GroupNotFoundError extends Error {
  constructor(slug: string) {
    super(`Gruppe "${slug}" nicht gefunden.`);
    this.name = "GroupNotFoundError";
  }
}

export function splitArgs(argv: string[]): { group: string | undefined; positionals: string[] } {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { group: { type: "string" } },
    allowPositionals: true,
    strict: false,
  });
  const group = typeof values.group === "string" ? values.group : undefined;
  return { group, positionals };
}

export async function resolveGroup(argv: string[]): Promise<Group> {
  const { group: slug } = splitArgs(argv);
  if (!slug) return getSoleGroup();
  const group = await prisma.group.findUnique({ where: { slug } });
  if (!group) throw new GroupNotFoundError(slug);
  return group;
}
