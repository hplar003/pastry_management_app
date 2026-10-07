import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupplier,
  deleteSupplier,
  getSupplier,
  listSuppliers,
  updateSupplier,
} from "./api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("suppliers api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listSuppliers calls GET /suppliers with limit/offset as query params", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], total: 0, limit: 20, offset: 0 }, 200));

    const result = await listSuppliers({ limit: 20, offset: 0 });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/suppliers?limit=20&offset=0");
    expect(init?.method).toBe("GET");
    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it("getSupplier calls GET /suppliers/:id", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "s1" }, 200));

    await getSupplier("s1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/suppliers/s1");
    expect(init?.method).toBe("GET");
  });

  it("createSupplier calls POST /suppliers with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "s1", name: "Acme" }, 201));

    await createSupplier({ name: "Acme" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/suppliers");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "Acme" }));
  });

  it("updateSupplier calls PATCH /suppliers/:id with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "s1", name: "Acme 2" }, 200));

    await updateSupplier("s1", { name: "Acme 2" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/suppliers/s1");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ name: "Acme 2" }));
  });

  it("deleteSupplier calls DELETE /suppliers/:id and resolves without a body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deleteSupplier("s1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/suppliers/s1");
    expect(init?.method).toBe("DELETE");
    expect(result).toBeUndefined();
  });
});
