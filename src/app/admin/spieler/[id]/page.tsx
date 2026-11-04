import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { loadPlayerDetail } from "@/lib/admin/player-detail";
import { PlayerDetailView } from "./player-detail-view";

export const dynamic = "force-dynamic";

export default async function AdminPlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const player = await loadPlayerDetail(ctx.groupId, id);
  if (!player) notFound();
  return <PlayerDetailView player={player} viewerRole={ctx.role} />;
}
