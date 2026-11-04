import { requireAdmin } from "@/lib/admin/guard";
import { listAdminGameDays } from "@/lib/admin/game-days";
import { getGroupRules } from "@/lib/group/rules";
import { getOrCreateActiveSeason } from "@/lib/season";
import { GameDaysView } from "./game-days-view";

export const dynamic = "force-dynamic";

export default async function AdminGameDaysPage() {
  const ctx = await requireAdmin();
  const [{ open, recent }, season, rules] = await Promise.all([
    listAdminGameDays(ctx.groupId),
    getOrCreateActiveSeason(ctx.groupId),
    getGroupRules(ctx.groupId),
  ]);
  return (
    <GameDaysView
      open={open}
      recent={recent}
      seasonName={season.name}
      maxJokers={rules.jokersPerSeason}
    />
  );
}
