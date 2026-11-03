import { describe, it, expect, afterEach, vi } from "vitest";
import { register } from "@/instrumentation";

describe("register", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("throws in production without MAIL_TRANSPORT on nodejs runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "");
    await expect(register()).rejects.toThrow(/MAIL_TRANSPORT/);
  });

  it("does nothing on the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "");
    await expect(register()).resolves.toBeUndefined();
  });

  it("passes with console in production but warns once at start", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "console");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(register()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[mail] MAIL_TRANSPORT=console: mails are only logged");
  });

  it("does not warn for console outside production", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MAIL_TRANSPORT", "console");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(register()).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("throws for resend without RESEND_API_KEY", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(register()).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("passes for resend with a key", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    await expect(register()).resolves.toBeUndefined();
  });
});
