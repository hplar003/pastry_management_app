import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBranch, deleteBranch, listBranches, updateBranch } from "./api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("branches api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listBranches calls GET /branches", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([], 200));

    const result = await listBranches();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/branches");
    expect(init?.method).toBe("GET");
    expect(result).toEqual([]);
  });

  it("createBranch calls POST /branches with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { id: "b1", name: "Poblacion Branch", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        201,
      ),
    );

    await createBranch({ name: "Poblacion Branch" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/branches");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "Poblacion Branch" }));
  });

  it("updateBranch calls PATCH /branches/:id with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { id: "b1", name: "Downtown Branch", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        200,
      ),
    );

    await updateBranch("b1", { name: "Downtown Branch" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/branches/b1");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ name: "Downtown Branch" }));
  });

  it("deleteBranch calls DELETE /branches/:id and resolves without a body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deleteBranch("b1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/branches/b1");
    expect(init?.method).toBe("DELETE");
    expect(result).toBeUndefined();
  });
});
