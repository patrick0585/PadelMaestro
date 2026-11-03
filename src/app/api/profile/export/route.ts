import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { rateLimitedResponse } from "@/lib/rate-limit-response";
import { buildAccountExport } from "@/lib/account/export";
import { PlayerNotFoundError } from "@/lib/players/errors";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`profile-export:${userId}`, { windowMs: 60 * 60_000, max: 5 });
  if (!rl.allowed) return rateLimitedResponse(rl);

  try {
    const data = await buildAccountExport(userId);
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        groupId: null,
        action: "account.export",
        entityType: "Player",
        entityId: userId,
      },
    });
    const date = data.exportedAt.slice(0, 10);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="padelmaestro-export-${date}.json"`,
      },
    });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
