import { describe, it, expect, afterEach, vi } from "vitest";
import { register } from "@/instrumentation";
import { checkMailConfig } from "@/lib/mail/startup-check";

const WARNING = "[mail] MAIL_TRANSPORT=console: mails are only logged";

describe("checkMailConfig", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws in production without MAIL_TRANSPORT", () => {
    expect(() => checkMailConfig({ NODE_ENV: "production" })).toThrow(/MAIL_TRANSPORT/);
  });

  it("throws for resend without RESEND_API_KEY", () => {
    expect(() =>
      checkMailConfig({ NODE_ENV: "production", MAIL_TRANSPORT: "resend", RESEND_API_KEY: "" }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it("passes for resend with a key", () => {
    expect(
      checkMailConfig({ NODE_ENV: "production", MAIL_TRANSPORT: "resend", RESEND_API_KEY: "re_x" }),
    ).toBe("resend");
  });

  it("warns once for console in production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(checkMailConfig({ NODE_ENV: "production", MAIL_TRANSPORT: "console" })).toBe("console");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(WARNING);
  });

  it("does not warn for console outside production", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkMailConfig({ NODE_ENV: "development", MAIL_TRANSPORT: "console" });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("register", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function stubExit() {
    vi.spyOn(console, "error").mockImplementation(() => {});
    return vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  }

  it("exits with 1 in production without MAIL_TRANSPORT on nodejs runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "");
    const exit = stubExit();
    await register();
    expect(exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith("[startup]", expect.stringMatching(/MAIL_TRANSPORT/));
  });

  it("does nothing on the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "");
    const exit = stubExit();
    await register();
    expect(exit).not.toHaveBeenCalled();
  });

  it("starts with console in production and warns", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "console");
    const exit = stubExit();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await register();
    expect(exit).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(WARNING);
  });
});
