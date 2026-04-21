import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { RankingTable } from "@/components/ranking-table";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const season = await getOrCreateActiveSeason();
  const ranking = await computeRanking(season.id);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Saison {season.year}
          </p>
          <h1 className="text-2xl font-bold text-foreground">Rangliste</h1>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-xl">
          🎾
        </div>
      </header>
      <RankingTable ranking={ranking} />
    </div>
  );
}
