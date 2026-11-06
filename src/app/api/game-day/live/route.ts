import { NextResponse } from "next/server";
import { guardMember } from "@/lib/auth/route-guard";
import { loadLiveStrip } from "@/lib/game-day/live-strip";

export const dynamic = "force-dynamic";

/** Live state for the header strip; polled because the root layout is not refetched on client navigation. */
export async function GET() {
  const g = await guardMember();
  if (g.response) return g.response;
  const live = await loadLiveStrip(g.ctx.groupId);
  return NextResponse.json({ live }, { headers: { "cache-control": "no-store" } });
}
