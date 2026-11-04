import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMember } from "@/lib/auth/route-guard";
import { ForbiddenError } from "@/lib/auth/group-context";
import { isAdminRole } from "@/lib/auth/roles";
import {
  JOKERS_PER_SEASON_MAX,
  JOKERS_PER_SEASON_MIN,
  JOKER_GAMES_CREDITED_MAX,
  JOKER_GAMES_CREDITED_MIN,
} from "@/lib/joker/constants";
import { RulesBelowUsedError, updateGroupRules } from "@/lib/group/update-rules";

const Body = z.object({
  groupId: z.string().uuid(),
  jokersPerSeason: z.number().int().min(JOKERS_PER_SEASON_MIN).max(JOKERS_PER_SEASON_MAX),
  jokerGamesCredited: z.number().int().min(JOKER_GAMES_CREDITED_MIN).max(JOKER_GAMES_CREDITED_MAX),
});

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

export async function PATCH(req: Request) {
  const g = await guardMember();
  if (g.response) return g.response;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (parsed.data.groupId !== g.ctx.groupId) {
    return NextResponse.json({ error: "stale_group" }, { status: 409 });
  }
  if (!isAdminRole(g.ctx.role)) return forbidden();
  try {
    const rules = await updateGroupRules({
      groupId: g.ctx.groupId,
      actorId: g.ctx.userId,
      rules: {
        jokersPerSeason: parsed.data.jokersPerSeason,
        jokerGamesCredited: parsed.data.jokerGamesCredited,
      },
    });
    return NextResponse.json(rules);
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden();
    if (e instanceof RulesBelowUsedError) {
      return NextResponse.json({ error: "below_used", minimum: e.minimum }, { status: 409 });
    }
    throw e;
  }
}
