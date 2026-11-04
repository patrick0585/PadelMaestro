import { requireAdmin } from "@/lib/admin/guard";
import { listOpenInvitations } from "@/lib/invitations/manage";
import { LargeTitle } from "@/components/ui/list";
import { InvitationsSection } from "../invitations-section";

export const dynamic = "force-dynamic";

export default async function AdminInvitePage() {
  const ctx = await requireAdmin();
  const open = await listOpenInvitations(ctx.groupId);
  const initial = open.map((inv) => ({
    ...inv,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    uses: inv.uses.map((u) => ({ ...u, usedAt: u.usedAt.toISOString() })),
  }));
  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="Einladen" back={{ href: "/admin", label: "Verwaltung" }} />
      <InvitationsSection initial={initial} />
    </div>
  );
}
