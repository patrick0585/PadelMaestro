import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
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
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Rangliste {season.year}</h1>
        <nav className="space-x-4 text-sm">
          <Link href="/game-day">Spieltag</Link>
          {session.user.isAdmin && <Link href="/admin">Admin</Link>}
        </nav>
      </div>
      <RankingTable ranking={ranking} />
    </main>
  );
}
