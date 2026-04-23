import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  setPlayerAvatar,
  deletePlayerAvatar,
  getPlayerAvatar,
  PlayerNotFoundError,
  InvalidImageError,
  FileTooLargeError,
  MAX_BYTES,
} from "@/lib/players/avatar";

function tooLargeByContentLength(req: Request): boolean {
  const raw = req.headers.get("content-length");
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > MAX_BYTES;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (tooLargeByContentLength(req)) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const { id } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await setPlayerAvatar({ playerId: id, actorId: session.user.id, file: buffer });
  } catch (e) {
    if (e instanceof FileTooLargeError) {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }
    if (e instanceof InvalidImageError) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }

  const row = await prisma.player.findUniqueOrThrow({
    where: { id },
    select: { avatarVersion: true },
  });
  return NextResponse.json({ version: row.avatarVersion }, { status: 200 });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    await deletePlayerAvatar({ playerId: id, actorId: session.user.id });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}

export async function GET(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const avatar = await getPlayerAvatar(id);
  if (!avatar) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(avatar.data), {
    status: 200,
    headers: {
      "Content-Type": avatar.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${id}-${avatar.version}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
