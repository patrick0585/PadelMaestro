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

describe("sendMail transport creation", () => {
  afterEach(() => {
    setTransportForTests(null);
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock("@/lib/mail/resend-transport");
  });

  it("warns once in production with console transport", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "console");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await sendMail(msg);
    await sendMail(msg);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[mail] MAIL_TRANSPORT=console: mails are only logged",
    );
  });

  it("wraps config errors in MailSendError and does not cache them", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    const err = await sendMail(msg).catch((e) => e);
    expect(err).toBeInstanceOf(MailSendError);
    expect(String(err.cause.message)).toMatch(/RESEND_API_KEY/);
    vi.stubEnv("MAIL_TRANSPORT", "memory");
    await expect(sendMail(msg)).resolves.toBeUndefined();
  });

  it("wraps an unknown MAIL_TRANSPORT", async () => {
    vi.stubEnv("MAIL_TRANSPORT", "smtp");
    await expect(sendMail(msg)).rejects.toBeInstanceOf(MailSendError);
  });

  it("uses the default sender when MAIL_FROM is unset", async () => {
    const create = vi.fn().mockReturnValue({ send: vi.fn() });
    vi.doMock("@/lib/mail/resend-transport", () => ({
      createResendTransport: create,
    }));
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("MAIL_FROM", "");
    const mod = await import("@/lib/mail/send");
    await mod.sendMail(msg);
    expect(create).toHaveBeenCalledWith(
      "key",
      "Padelmaestro <noreply@padelmaestro.de>",
    );
  });
});
