import { resolveTransportName } from "@/lib/mail/transport";

// Fails the start on a broken mail config instead of on the first send.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const name = resolveTransportName(process.env);
  if (name === "resend" && !process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required for MAIL_TRANSPORT=resend");
  }
  if (name === "console" && process.env.NODE_ENV === "production") {
    console.warn("[mail] MAIL_TRANSPORT=console: mails are only logged");
  }
}
