import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { createGroup, NotFounderError } from "@/lib/group/create";
import { groupNameField } from "@/lib/invitations/schemas";

const Schema = z.object({ name: groupNameField });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    const group = await createGroup({ name: parsed.data.name, founderId: session.user.id });
    return NextResponse.json(group, { status: 201 });
  } catch (e) {
    if (e instanceof NotFounderError) {
      return NextResponse.json({ error: "no_founder_invitation" }, { status: 403 });
    }
    throw e;
  }
}
