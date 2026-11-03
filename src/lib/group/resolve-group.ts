import { parseArgs } from "node:util";
import type { Group } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AmbiguousGroupError, getSoleGroup } from "./sole-group";

export class GroupNotFoundError extends Error {
  constructor(slug: string) {
    super(`Gruppe "${slug}" nicht gefunden.`);
    this.name = "GroupNotFoundError";
  }
}

export class GroupUsageError extends Error {
  constructor() {
    super("--group braucht einen Slug");
    this.name = "GroupUsageError";
  }
}

export function isGroupArgError(err: unknown): err is Error {
  return (
    err instanceof GroupNotFoundError ||
    err instanceof AmbiguousGroupError ||
    err instanceof GroupUsageError
  );
}

export async function assertSingleGroup(): Promise<void> {
  if ((await prisma.group.count()) > 1) throw new AmbiguousGroupError();
}

export function splitArgs(argv: string[]): { group: string | undefined; positionals: string[] } {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { group: { type: "string" } },
    allowPositionals: true,
    strict: false,
  });
  if (values.group === true || values.group === "") throw new GroupUsageError();
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
