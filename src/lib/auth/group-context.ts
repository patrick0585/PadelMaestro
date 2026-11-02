import { auth } from "@/auth";
import { isAdminRole, type GroupRole } from "./roles";

export type GroupContext = { userId: string; groupId: string; role: GroupRole };

export class NoGroupError extends Error {
  constructor() {
    super("no group");
    this.name = "NoGroupError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("insufficient role");
    this.name = "ForbiddenError";
  }
}

export async function getGroupContext(): Promise<GroupContext | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.groupId || !user.role) return null;
  return { userId: user.id, groupId: user.groupId, role: user.role };
}

export async function requireMember(): Promise<GroupContext> {
  const ctx = await getGroupContext();
  if (!ctx) throw new NoGroupError();
  return ctx;
}

export async function requireGroupAdmin(): Promise<GroupContext> {
  const ctx = await requireMember();
  if (!isAdminRole(ctx.role)) throw new ForbiddenError();
  return ctx;
}

export async function requireOwner(): Promise<GroupContext> {
  const ctx = await requireMember();
  if (ctx.role !== "owner") throw new ForbiddenError();
  return ctx;
}
