import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

describe("db client", () => {
  it("exports a singleton Prisma client", async () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe("function");
  });
});
