import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { contextFromSession, type GroupContext } from "@/lib/auth/group-context";
import { isAdminRole } from "@/lib/auth/roles";

export async function requireAdmin(): Promise<GroupContext> {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);
  if (!ctx || !isAdminRole(ctx.role)) redirect("/ranking");
  return ctx;
}
