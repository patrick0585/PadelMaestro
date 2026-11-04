import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { setRemindersEnabled } from "@/lib/push/devices";

const Schema = z.object({ remindersEnabled: z.boolean() });

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await setRemindersEnabled(session.user.id, parsed.data.remindersEnabled);
  return NextResponse.json({ remindersEnabled: parsed.data.remindersEnabled });
}
