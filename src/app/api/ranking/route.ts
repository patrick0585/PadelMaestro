import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const season = await getOrCreateActiveSeason();
  const ranking = await computeRanking(season.id);
  return NextResponse.json({ season, ranking });
}
