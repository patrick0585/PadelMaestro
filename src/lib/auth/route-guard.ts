import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { contextFromSession, type GroupContext } from "./group-context";
import { isAdminRole } from "./roles";

export type GuardResult =
  | { ctx: GroupContext; response: null }
  | { ctx: null; response: NextResponse };

export async function guardMember(): Promise<GuardResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ctx: null, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const ctx = contextFromSession(session);
  if (!ctx) {
    return { ctx: null, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ctx, response: null };
}

export async function guardGroupAdmin(): Promise<GuardResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ctx: null, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const ctx = contextFromSession(session);
  if (!ctx || !isAdminRole(ctx.role)) {
    return { ctx: null, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ctx, response: null };
}
