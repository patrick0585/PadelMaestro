import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/db";
import { getGroupRules } from "@/lib/group/rules";
import { getOrCreateActiveSeason } from "@/lib/season";
import { SeasonView } from "./season-view";

export const dynamic = "force-dynamic";

export default async function AdminSeasonPage() {
  const ctx = await requireAdmin();
  const season = await getOrCreateActiveSeason(ctx.groupId);
  const rules = await getGroupRules(ctx.groupId);
  const finishedCount = await prisma.gameDay.count({
    where: { seasonId: season.id, status: "finished" },
  });
  return (
    <SeasonView
      name={season.name}
      startDate={season.startDate}
      finishedCount={finishedCount}
      maxJokers={rules.jokersPerSeason}
    />
  );
}
