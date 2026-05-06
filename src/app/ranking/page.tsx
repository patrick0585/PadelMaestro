import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { buildSeasonTrend } from "@/lib/ranking/season-trend";
import { RankingTable } from "@/components/ranking-table";
import { Card, CardBody } from "@/components/ui/card";
import { SeasonTrendChart } from "@/components/season-trend-chart";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const season = await getOrCreateActiveSeason();
  const [ranking, trend] = await Promise.all([
    computeRanking(season.id),
    buildSeasonTrend(season.id),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Saison {season.year}
        </p>
        <h1 className="text-2xl font-bold text-foreground">Rangliste</h1>
      </header>
      <RankingTable ranking={ranking} />

      <Card>
        <CardBody>
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-foreground">Saison-Verlauf</h2>
            <p className="text-xs text-foreground-muted">Platzierung pro Spieltag.</p>
          </div>
          <SeasonTrendChart
            data={{
              days: trend.days.map((d) => ({
                date: d.date.toISOString(),
                totalPlayers: d.totalPlayers,
              })),
              players: trend.players,
            }}
            currentPlayerId={session.user.id}
          />
        </CardBody>
      </Card>
    </div>
  );
}
