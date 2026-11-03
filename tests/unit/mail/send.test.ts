import { describe, it, expect, afterEach, vi } from "vitest";
import { sendMail, setTransportForTests, MailSendError } from "@/lib/mail/send";
import type { MailMessage } from "@/lib/mail/transport";

const msg: MailMessage = { to: "a@example.com", subject: "S", text: "T", html: "<p>T</p>" };

describe("sendMail", () => {
  afterEach(() => setTransportForTests(null));

  it("delegates to the transport", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    setTransportForTests({ send });
    await sendMail(msg);
    expect(send).toHaveBeenCalledWith(msg);
  });

  it("wraps transport failures in MailSendError with cause", async () => {
    const boom = new Error("boom");
    setTransportForTests({ send: vi.fn().mockRejectedValue(boom) });
    const err = await sendMail(msg).catch((e) => e);
    expect(err).toBeInstanceOf(MailSendError);
    expect(err.cause).toBe(boom);
  });
});
