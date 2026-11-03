import { describe, it, expect, afterEach, vi } from "vitest";
import { register } from "@/instrumentation";

describe("register", () => {
  afterEach(() => vi.unstubAllEnvs());

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

  it("passes with a valid production config", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MAIL_TRANSPORT", "console");
    await expect(register()).resolves.toBeUndefined();
  });
});
