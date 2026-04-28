import { handlers } from "@/auth";

// The NextAuth handlers touch Prisma (jwt callback) and must run on Node,
// not the Edge runtime. Pinning explicitly avoids a known Next 15 + Prisma 6
// + next-auth@5 detection corner case where the route handler was bundled
// against the edge build of the Prisma client and threw
// `PrismaClientValidationError: In order to run Prisma Client on edge runtime`
// on every JWT renewal — which logged users out roughly daily.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = handlers;
