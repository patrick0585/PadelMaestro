import { describe, it, expect, afterEach, vi } from "vitest";
import { appUrl } from "@/lib/mail/app-url";

describe("appUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("joins APP_URL and path without double slashes", () => {
    vi.stubEnv("APP_URL", "https://padelmaestro.de/");
    expect(appUrl("/x")).toBe("https://padelmaestro.de/x");
    expect(appUrl("x")).toBe("https://padelmaestro.de/x");
  });

  it("falls back to AUTH_URL, then localhost", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("AUTH_URL", "https://auth.example/");
    expect(appUrl("/y")).toBe("https://auth.example/y");
    vi.stubEnv("AUTH_URL", "");
    expect(appUrl("/y")).toBe("http://localhost:3000/y");
  });
});
