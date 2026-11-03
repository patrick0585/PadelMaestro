import type { MailContent } from "./templates";

export interface MailMessage extends MailContent {
  to: string;
}

export interface MailTransport {
  send(msg: MailMessage): Promise<void>;
}

export type TransportName = "resend" | "console" | "memory";

export const memoryOutbox: MailMessage[] = [];

export const memoryTransport: MailTransport = {
  async send(msg) {
    memoryOutbox.push(msg);
  },
};

export function clearMemoryOutbox(): void {
  memoryOutbox.length = 0;
}

export const consoleTransport: MailTransport = {
  async send(msg) {
    console.log(`[mail] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
  },
};

export function resolveTransportName(env: {
  MAIL_TRANSPORT?: string;
  NODE_ENV?: string;
}): TransportName {
  const production = env.NODE_ENV === "production";
  const value =
    env.MAIL_TRANSPORT || (env.NODE_ENV === "test" ? "memory" : "console");
  if (value !== "resend" && value !== "console" && value !== "memory") {
    throw new Error(`Unknown MAIL_TRANSPORT "${value}"`);
  }
  if (production && (!env.MAIL_TRANSPORT || value === "memory")) {
    throw new Error('MAIL_TRANSPORT must be "resend" or "console" in production');
  }
  return value;
}
