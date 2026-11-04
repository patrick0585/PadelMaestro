import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/db";
import { listActiveMembers } from "@/lib/group/members";
import { getGroupRules } from "@/lib/group/rules";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const ctx = await requireAdmin();
  const isOwner = ctx.role === "owner";
  const rules = await getGroupRules(ctx.groupId);
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: ctx.groupId },
    select: { name: true, slug: true },
  });
  const members = isOwner ? await listActiveMembers(ctx.groupId) : [];
  const transferCandidates = members
    .filter((m) => m.role !== "owner" && m.hasPassword)
    .map((m) => ({ id: m.id, name: m.name }));
  return (
    <SettingsView
      isOwner={isOwner}
      groupId={ctx.groupId}
      name={group.name}
      slug={group.slug}
      rules={rules}
      transferCandidates={transferCandidates}
    />
  );
}
