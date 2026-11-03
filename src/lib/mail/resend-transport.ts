import { Resend } from "resend";
import type { MailTransport } from "./transport";

export function createResendTransport(
  apiKey: string,
  from: string,
): MailTransport {
  const client = new Resend(apiKey);
  return {
    async send({ to, subject, text, html }) {
      const { error } = await client.emails.send({ from, to, subject, text, html });
      if (error) throw new Error(error.message);
    },
  };
}
