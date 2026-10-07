import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRole, deleteRole, getMyCeiling, getRole, listRoleNames, updateRole } from "./api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("roles api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listRoleNames calls GET /roles", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([{ role: "owner", isStatic: true }], 200));

    const result = await listRoleNames();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/roles");
    expect(init?.method).toBe("GET");
    expect(result).toEqual([{ role: "owner", isStatic: true }]);
  });

  it("createRole calls POST /roles with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ id: "r1", role: "cashier", permission: { order: ["create"] } }, 201),
    );

    await createRole({ role: "cashier", permission: { order: ["create"] } });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/roles");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ role: "cashier", permission: { order: ["create"] } }));
  });

  it("getRole calls GET /roles/:name", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ id: "r1", role: "cashier", permission: { order: ["create"] } }, 200),
    );

    await getRole("cashier");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/roles/cashier");
    expect(init?.method).toBe("GET");
  });

  it("updateRole calls PATCH /roles/:name with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ id: "r1", role: "cashier", permission: { order: ["create", "read"] } }, 200),
    );

    await updateRole("cashier", { permission: { order: ["create", "read"] } });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/roles/cashier");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ permission: { order: ["create", "read"] } }));
  });

  it("deleteRole calls DELETE /roles/:name and resolves without a body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deleteRole("cashier");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/roles/cashier");
    expect(init?.method).toBe("DELETE");
    expect(result).toBeUndefined();
  });

  it("getMyCeiling calls GET /roles/my-ceiling", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ order: ["create"] }, 200));

    const result = await getMyCeiling();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/roles/my-ceiling");
    expect(init?.method).toBe("GET");
    expect(result).toEqual({ order: ["create"] });
  });
});
