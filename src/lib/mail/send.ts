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

let transport: MailTransport | null = null;

function createTransport(): MailTransport {
  const name = resolveTransportName(process.env);
  if (name === "memory") return memoryTransport;
  if (name === "console") {
    if (process.env.NODE_ENV === "production") {
      console.warn("[mail] MAIL_TRANSPORT=console: mails are only logged");
    }
    return consoleTransport;
  }
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY and MAIL_FROM are required for resend");
  }
  return createResendTransport(apiKey, from);
}

export function setTransportForTests(t: MailTransport | null): void {
  transport = t;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  transport ??= createTransport();
  try {
    await transport.send(msg);
  } catch (e) {
    throw new MailSendError(`Mail to ${msg.to} failed`, { cause: e });
  }
}
