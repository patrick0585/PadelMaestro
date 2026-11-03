import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  memoryTransport,
  memoryOutbox,
  clearMemoryOutbox,
  consoleTransport,
  resolveTransportName,
  type MailMessage,
} from "@/lib/mail/transport";

const msg: MailMessage = {
  to: "a@example.com",
  subject: "Hallo",
  text: "Textkörper",
  html: "<p>Textkörper</p>",
};

describe("transport", () => {
  beforeEach(() => clearMemoryOutbox());
  afterEach(() => vi.restoreAllMocks());

  it("memory transport collects messages", async () => {
    await memoryTransport.send(msg);
    expect(memoryOutbox).toEqual([msg]);
  });

  it("clearMemoryOutbox empties the outbox", async () => {
    await memoryTransport.send(msg);
    clearMemoryOutbox();
    expect(memoryOutbox).toEqual([]);
  });

  it("console transport logs header line and text body", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await consoleTransport.send(msg);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      "[mail] to=a@example.com subject=Hallo\nTextkörper",
    );
  });

  it("resolveTransportName defaults to memory under test, console otherwise", () => {
    expect(resolveTransportName({ NODE_ENV: "test" })).toBe("memory");
    expect(resolveTransportName({ NODE_ENV: "development" })).toBe("console");
  });

  it("resolveTransportName rejects memory and missing value in production", () => {
    expect(() => resolveTransportName({ NODE_ENV: "production" })).toThrow(
      /MAIL_TRANSPORT/,
    );
    expect(() =>
      resolveTransportName({ NODE_ENV: "production", MAIL_TRANSPORT: "memory" }),
    ).toThrow(/MAIL_TRANSPORT/);
    expect(
      resolveTransportName({ NODE_ENV: "production", MAIL_TRANSPORT: "console" }),
    ).toBe("console");
    expect(
      resolveTransportName({ NODE_ENV: "production", MAIL_TRANSPORT: "resend" }),
    ).toBe("resend");
  });

  it("rejects unknown names", () => {
    expect(() => resolveTransportName({ MAIL_TRANSPORT: "smtp" })).toThrow();
  });
});
