import { auth } from "@/auth";
import { subscribeToGameDay } from "@/lib/game-day/live-broadcast";

// SSE keeps a long-lived HTTP connection open; must run on Node, not Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Caddy's default idle timeout is 30s, so we send a comment line every
// 25s to keep the connection alive. Browsers ignore comments (lines
// starting with ":") but the bytes are enough to reset the proxy timer.
const KEEPALIVE_INTERVAL_MS = 25_000;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: gameDayId } = await ctx.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let keepalive: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: () => void = () => {};

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (keepalive) clearInterval(keepalive);
        unsubscribe();
        req.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // already closed by the runtime — fine
        }
      };

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Stream is gone (client closed, buffer overflow, etc.).
          // Tear down the timer + subscriber immediately rather than
          // waiting for the next abort or keepalive tick.
          cleanup();
        }
      };

      // Initial flush: forces browsers + intermediaries to commit the
      // response headers and start treating bytes as a stream.
      safeEnqueue(": connected\n\n");

      unsubscribe = subscribeToGameDay(gameDayId, () => {
        safeEnqueue(`event: update\ndata: ${Date.now()}\n\n`);
      });

      keepalive = setInterval(() => {
        safeEnqueue(": ping\n\n");
      }, KEEPALIVE_INTERVAL_MS);

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform prevents Caddy/proxies from gzipping the stream,
      // which would buffer events instead of flushing them per-message.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx/proxy hint to disable response buffering. Caddy ignores it
      // but it costs nothing and helps if the deploy ever moves.
      "X-Accel-Buffering": "no",
    },
  });
}
