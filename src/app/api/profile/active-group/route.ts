import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { NotAMemberError, setActiveGroup } from "@/lib/group/active-group";

const Schema = z.object({ groupId: z.string().uuid() });

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    await setActiveGroup({ playerId: session.user.id, groupId: parsed.data.groupId });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof NotAMemberError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    throw e;
  }
}
