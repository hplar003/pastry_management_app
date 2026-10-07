import { describe, expect, it } from "vitest";
import { createRoleSchema } from "./schemas";

describe("createRoleSchema", () => {
  it("accepts an ordinary role name", () => {
    const result = createRoleSchema.safeParse({ role: "cashier", permission: { order: ["create"] } });
    expect(result.success).toBe(true);
  });

  it("rejects the reserved name \"my-ceiling\" (it would be unreachable via /api/v1/roles/[name])", () => {
    const result = createRoleSchema.safeParse({ role: "my-ceiling", permission: {} });
    expect(result.success).toBe(false);
  });

  it("rejects the reserved name regardless of case", () => {
    const result = createRoleSchema.safeParse({ role: "My-Ceiling", permission: {} });
    expect(result.success).toBe(false);
  });
});
