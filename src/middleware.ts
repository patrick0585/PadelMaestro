import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { isSameOriginMutation } from "@/lib/csrf";

const { auth: nextAuthMiddleware } = NextAuth(authConfig);

export default function middleware(req: NextRequest) {
  const ok = isSameOriginMutation(req.method, req.nextUrl.pathname, req.url, {
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
  });
  if (!ok) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }
  return (nextAuthMiddleware as unknown as (r: NextRequest) => Response | Promise<Response>)(req);
}

export const config = {
  matcher: [
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
};
