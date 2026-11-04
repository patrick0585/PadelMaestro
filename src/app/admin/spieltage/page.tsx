import { requireAdmin } from "@/lib/admin/guard";
import { listAdminGameDays } from "@/lib/admin/game-days";
import { MAX_JOKERS_PER_SEASON } from "@/lib/joker/use";
import { getOrCreateActiveSeason } from "@/lib/season";
import { GameDaysView } from "./game-days-view";

export const dynamic = "force-dynamic";

export default async function AdminGameDaysPage() {
  const ctx = await requireAdmin();
  const [{ open, recent }, season] = await Promise.all([
    listAdminGameDays(ctx.groupId),
    getOrCreateActiveSeason(ctx.groupId),
  ]);
  return (
    <GameDaysView
      open={open}
      recent={recent}
      seasonName={season.name}
      maxJokers={MAX_JOKERS_PER_SEASON}
    />
  );
}
