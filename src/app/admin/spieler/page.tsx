import { requireAdmin } from "@/lib/admin/guard";
import { listActiveMembers } from "@/lib/group/members";
import { PlayersList } from "./players-list";

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage() {
  const ctx = await requireAdmin();
  const players = await listActiveMembers(ctx.groupId);
  return <PlayersList players={players} />;
}
