import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://user:pass@host/db",
  DATABASE_URL_UNPOOLED: "postgresql://user:pass@host/db",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("throws naming the missing required variable", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("throws naming a variable that fails validation", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "not-a-url" })).toThrow(/DATABASE_URL/);
  });

  it("rejects a Better Auth secret shorter than 32 characters", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("returns a typed env object when every variable is valid", () => {
    const env = parseEnv(valid);
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.BETTER_AUTH_URL).toBe(valid.BETTER_AUTH_URL);
    expect(env.NODE_ENV).toBe("development");
  });

  it("accepts an optional NEON_BRANCH", () => {
    const env = parseEnv({ ...valid, NEON_BRANCH: "production" });
    expect(env.NEON_BRANCH).toBe("production");
  });
});
