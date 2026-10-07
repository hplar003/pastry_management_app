import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  listRecipes,
  updateRecipe,
} from "./api";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("recipes api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("listRecipes calls GET /recipes with limit/offset as query params", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ items: [], total: 0, limit: 20, offset: 0 }, 200));

    const result = await listRecipes({ limit: 20, offset: 0 });

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/recipes?limit=20&offset=0");
    expect(init?.method).toBe("GET");
    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
  });

  it("getRecipe calls GET /recipes/:id", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "r1" }, 200));

    await getRecipe("r1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/recipes/r1");
    expect(init?.method).toBe("GET");
  });

  it("createRecipe calls POST /recipes with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "r1", name: "Croissant" }, 201));

    const input = {
      name: "Croissant",
      yieldQuantity: 12,
      yieldUnit: "pcs",
      ingredients: [{ ingredientId: "i1", quantity: 1 }],
    };
    await createRecipe(input);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/recipes");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(input));
  });

  it("updateRecipe calls PATCH /recipes/:id with the input as the body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "r1", name: "Croissant 2" }, 200));

    const input = {
      name: "Croissant 2",
      ingredients: [{ ingredientId: "i1", quantity: 2 }],
    };
    await updateRecipe("r1", input);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/recipes/r1");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify(input));
  });

  it("deleteRecipe calls DELETE /recipes/:id and resolves without a body", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deleteRecipe("r1");

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/v1/recipes/r1");
    expect(init?.method).toBe("DELETE");
    expect(result).toBeUndefined();
  });
});
