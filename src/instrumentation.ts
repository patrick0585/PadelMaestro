import { resolveTransportName } from "@/lib/mail/transport";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    resolveTransportName(process.env);
  }
}
