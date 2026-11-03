import { resolveTransportName, type TransportName } from "./transport";

export function checkMailConfig(env: NodeJS.ProcessEnv): TransportName {
  const name = resolveTransportName(env);
  if (name === "resend" && !env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required for MAIL_TRANSPORT=resend");
  }
  if (name === "console" && env.NODE_ENV === "production") {
    console.warn("[mail] MAIL_TRANSPORT=console: mails are only logged");
  }
  return name;
}
