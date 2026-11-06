import { NextResponse } from "next/server";
import { guardMember } from "@/lib/auth/route-guard";
import { findGroupGameDay } from "@/lib/game-day/group-scope";
import { loadShareCard } from "@/lib/share/share-card";
import { renderShareImage } from "@/lib/share/share-image";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Personal share image (PNG) of a finished game day, for members of its group only. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardMember();
  if (g.response) return g.response;
  // Rendering is CPU-heavy; a member sharing a few days in a row stays well below this.
  const rl = rateLimit(`share-image:${g.ctx.userId}`, { windowMs: 60_000, max: 10 });
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { id } = await ctx.params;
  if (!(await findGroupGameDay(g.ctx.groupId, id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const card = await loadShareCard(id, g.ctx.userId);
  if (!card) return NextResponse.json({ error: "not_finished" }, { status: 404 });
  const image = await renderShareImage(card);
  image.headers.set("cache-control", "private, no-store");
  return image;
}
