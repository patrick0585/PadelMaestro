import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { contextFromSession } from "@/lib/auth/group-context";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computePlayerSeasonStats } from "@/lib/player/season-stats";
import { DuoOverview } from "@/components/duos/duo-overview";

export const dynamic = "force-dynamic";

export default async function DuosPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);
  if (!ctx) redirect("/");

  const season = await getOrCreateActiveSeason(ctx.groupId);
  const stats = await computePlayerSeasonStats(session.user.id, season.id);
  const n = stats.partners.length;

  return (
    <div className="space-y-3.5">
      <header>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1 text-[15px] text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span aria-hidden="true">‹</span> Home
        </Link>
        <h1 className="font-display text-[30px] font-extrabold uppercase leading-none">Deine Duos</h1>
        <p className="mt-1 text-[13px] text-foreground-muted">
          {season.name} · {n} Partner · {stats.winRate.matches}{" "}
          {stats.winRate.matches === 1 ? "Match" : "Matches"}
        </p>
      </header>
      <DuoOverview
        partners={stats.partners}
        bestId={stats.bestPartner?.playerId ?? null}
        worstId={stats.worstPartner?.playerId ?? null}
      />
    </div>
  );
}
