import { NextResponse } from "next/server";
import { guardMember } from "@/lib/auth/route-guard";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";

export async function GET() {
  const g = await guardMember();
  if (g.response) return g.response;

  const season = await getOrCreateActiveSeason(g.ctx.groupId);
  const ranking = await computeRanking(season.id);
  return NextResponse.json({ season, ranking });
}
