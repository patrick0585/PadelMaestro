import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { setOwnName } from "@/lib/account/apple";

const Schema = z.object({ name: z.string().trim().min(1).max(60) });

/** Sets the display name and ends the one-time "Fast fertig" step of Apple signups. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await setOwnName(session.user.id, parsed.data.name);
  return new NextResponse(null, { status: 204 });
}
