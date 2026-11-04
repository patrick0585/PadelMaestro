import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { registerDevice, unregisterDevice } from "@/lib/push/devices";

const Token = z.string().min(64).max(200).regex(/^[0-9a-fA-F]+$/);
const RegisterSchema = z.object({ token: Token, platform: z.literal("ios") });
const UnregisterSchema = z.object({ token: Token });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = RegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await registerDevice({ playerId: session.user.id, token: parsed.data.token });
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = UnregisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await unregisterDevice({ playerId: session.user.id, token: parsed.data.token });
  return new NextResponse(null, { status: 204 });
}
