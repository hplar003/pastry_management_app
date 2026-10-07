import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adjustStock,
  createIngredient,
  deleteIngredient,
  getIngredient,
  listCurrentStock,
  listIngredients,
  listMovements,
  transferStock,
  updateIngredient,
} from "./api";
import { useBranchStore } from "@/stores/branch-store";
import { ApiError } from "@/lib/api-client";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("inventory api — ingredient catalog (not branch-scoped)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listIngredients calls GET /ingredients with limit/offset as query params", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], total: 0, limit: 20, offset: 0 }, 200));

    const result = await listIngredients({ limit: 20, offset: 0 });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/ingredients?limit=20&offset=0");
    expect(init?.method).toBe("GET");
    expect(init?.headers).not.toHaveProperty("x-branch-id");
    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it("getIngredient calls GET /ingredients/:id", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "i1" }, 200));

    await getIngredient("i1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/ingredients/i1");
    expect(init?.method).toBe("GET");
  });

  it("createIngredient calls POST /ingredients with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "i1", name: "Flour" }, 201));

    await createIngredient({ name: "Flour", unit: "kg" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/ingredients");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ name: "Flour", unit: "kg" }));
  });

  it("updateIngredient calls PATCH /ingredients/:id with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "i1", name: "Flour 2" }, 200));

    await updateIngredient("i1", { name: "Flour 2" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/ingredients/i1");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ name: "Flour 2" }));
  });

  it("deleteIngredient calls DELETE /ingredients/:id and resolves without a body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deleteIngredient("i1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/ingredients/i1");
    expect(init?.method).toBe("DELETE");
    expect(result).toBeUndefined();
  });
});

describe("inventory api — stock ledger (branch-scoped)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
  });

  it("listCurrentStock calls GET /inventory with x-branch-id and returns the bare array", async () => {
    const rows = [{ id: "i1", name: "Flour", unit: "kg", quantity: "10" }];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(rows, 200));

    const result = await listCurrentStock();

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/inventory");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>)["x-branch-id"]).toBe("branch-1");
    expect(result).toEqual(rows);
  });

  it("listMovements calls GET /inventory/movements with x-branch-id and query params", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], total: 0, limit: 20, offset: 0 }, 200));

    await listMovements({ limit: 20, offset: 0, ingredientId: "i1" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/inventory/movements?limit=20&offset=0&ingredientId=i1");
    expect((init?.headers as Record<string, string>)["x-branch-id"]).toBe("branch-1");
  });

  it("adjustStock calls POST /inventory/adjust with x-branch-id and the input as the body", async () => {
    const movement = { id: "m1", ingredientId: "i1", type: "ADJUSTMENT", qty: "5", reason: "recount", actorId: "u1", createdAt: "2026-01-01T00:00:00.000Z" };
    vi.mocked(fetch).mockResolvedValue(jsonResponse(movement, 201));

    const result = await adjustStock({ ingredientId: "i1", qty: 5, reason: "recount" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/inventory/adjust");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-branch-id"]).toBe("branch-1");
    expect(init?.body).toBe(JSON.stringify({ ingredientId: "i1", qty: 5, reason: "recount" }));
    expect(result).toEqual(movement);
  });

  it("transferStock calls POST /inventory/transfer with x-branch-id and returns { out, in }", async () => {
    const out = { id: "m1", ingredientId: "i1", type: "TRANSFER_OUT", qty: "-3", reason: "rebalance", actorId: "u1", createdAt: "2026-01-01T00:00:00.000Z" };
    const inMovement = { ...out, id: "m2", type: "TRANSFER_IN", qty: "3" };
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ out, in: inMovement }, 201));

    const result = await transferStock({ ingredientId: "i1", quantity: 3, reason: "rebalance", toBranchId: "branch-2" });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/inventory/transfer");
    expect(init?.method).toBe("POST");
    expect(result).toEqual({ out, in: inMovement });
  });

  it("throws ApiError(BRANCH_REQUIRED) without calling fetch when no branch is active", async () => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });

    await expect(listCurrentStock()).rejects.toMatchObject({ code: "BRANCH_REQUIRED" } satisfies Partial<ApiError>);
    expect(fetch).not.toHaveBeenCalled();
  });
});
