import { NextResponse } from "next/server";
import { z } from "zod";
import { guardMember } from "@/lib/auth/route-guard";
import { isAdminRole } from "@/lib/auth/roles";
import { findGroupMatchGameDay } from "@/lib/game-day/group-scope";
import {
  enterScore,
  ScoreConflictError,
  GameDayFinishedError,
  GameDayNotStartedError,
  NotAllowedError,
  InvalidScoreError,
} from "@/lib/match/enter-score";

const Schema = z.object({
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0),
  expectedVersion: z.number().int().min(0),
});

// Temporary: structured diagnostics for the 2026-05-05 score-entry incident
// where three users hit a generic save error that only logout+login fixed.
// Logs every non-2xx outcome of this route so the next failure pinpoints the
// status code and reason instead of vanishing into the client bundle.
function diag(matchId: string, status: number, reason: string, userId: string | null) {
  console.warn(
    `[diag/score-entry] status=${status} path=/api/matches/${matchId} userId=${userId ?? "none"} reason=${reason}`,
  );
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const g = await guardMember();
  if (g.response) {
    diag(id, g.response.status, g.response.status === 401 ? "unauthenticated" : "no_group", null);
    return g.response;
  }

  const userId = g.ctx.userId;
  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    diag(id, 400, "invalid_body", userId);
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!(await findGroupMatchGameDay(g.ctx.groupId, id))) {
    diag(id, 404, "not_found", userId);
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const match = await enterScore({
      matchId: id,
      team1Score: body.data.team1Score,
      team2Score: body.data.team2Score,
      scoredBy: userId,
      expectedVersion: body.data.expectedVersion,
      isAdmin: isAdminRole(g.ctx.role),
    });
    return NextResponse.json({ match });
  } catch (err) {
    if (err instanceof NotAllowedError) {
      diag(id, 403, "not_allowed", userId);
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (err instanceof ScoreConflictError) {
      diag(id, 409, "version_conflict", userId);
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof GameDayFinishedError) {
      diag(id, 409, "game_day_finished", userId);
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof GameDayNotStartedError) {
      diag(id, 409, "game_day_not_started", userId);
      return NextResponse.json({ error: "game_day_not_started" }, { status: 409 });
    }
    if (err instanceof InvalidScoreError) {
      diag(id, 400, "invalid_score", userId);
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    diag(id, 500, "uncaught", userId);
    throw err;
  }
}
