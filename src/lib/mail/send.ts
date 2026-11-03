import {
  consoleTransport,
  memoryTransport,
  resolveTransportName,
  type MailMessage,
  type MailTransport,
} from "./transport";
import { createResendTransport } from "./resend-transport";

export class MailSendError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MailSendError";
  }
}

const DEFAULT_FROM = "Padelmaestro <noreply@padelmaestro.de>";

let transport: MailTransport | null = null;

function createTransport(): MailTransport {
  const name = resolveTransportName(process.env);
  if (name === "memory") return memoryTransport;
  if (name === "console") return consoleTransport;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || DEFAULT_FROM;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required for MAIL_TRANSPORT=resend");
  }
  return createResendTransport(apiKey, from);
}

export function setTransportForTests(t: MailTransport | null): void {
  transport = t;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  try {
    transport ??= createTransport();
    await transport.send(msg);
  } catch (e) {
    // No recipient in logs or message: addresses are personal data.
    console.error("[mail] send failed", { subject: msg.subject }, e);
    throw new MailSendError("mail send failed", { cause: e });
  }
}
