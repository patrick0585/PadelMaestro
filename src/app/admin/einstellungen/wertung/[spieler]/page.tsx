import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/db";
import { getGroupScoring } from "@/lib/group/scoring";
import { LargeTitle } from "@/components/ui/list";
import { PLAYER_COUNTS, type PlayerCountKey } from "@/lib/scoring/rule";
import { ScoringForm } from "../scoring-form";

export const dynamic = "force-dynamic";

export default async function ScoringPage({ params }: { params: Promise<{ spieler: string }> }) {
  const { spieler } = await params;
  if (!PLAYER_COUNTS.includes(spieler as PlayerCountKey)) notFound();
  const playerCount = spieler as PlayerCountKey;
  const ctx = await requireAdmin();
  const [scoring, finishedDays] = await Promise.all([
    getGroupScoring(ctx.groupId),
    prisma.gameDay.count({ where: { groupId: ctx.groupId, status: "finished", season: { isActive: true } } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title={`${playerCount} Spieler`} back={{ href: "/admin/einstellungen", label: "Einstellungen" }} />
      <ScoringForm
        groupId={ctx.groupId}
        playerCount={playerCount}
        initial={scoring[playerCount]}
        finishedDaysThisSeason={finishedDays}
      />
    </div>
  );
}
