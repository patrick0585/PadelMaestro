import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMember } from "@/lib/auth/route-guard";
import { ForbiddenError } from "@/lib/auth/group-context";
import { isAdminRole } from "@/lib/auth/roles";
import { scoringRuleSchema } from "@/lib/scoring/rule";
import { updateGroupScoring } from "@/lib/group/update-scoring";

const Body = z.object({
  groupId: z.string().uuid(),
  playerCount: z.union([z.literal(4), z.literal(5), z.literal(6)]),
  rule: scoringRuleSchema,
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
    const scoring = await updateGroupScoring({
      groupId: g.ctx.groupId,
      actorId: g.ctx.userId,
      playerCount: String(parsed.data.playerCount) as "4" | "5" | "6",
      rule: parsed.data.rule,
    });
    return NextResponse.json({ scoring });
  } catch (e) {
    if (e instanceof ForbiddenError) return forbidden();
    throw e;
  }
}
