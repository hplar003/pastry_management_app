import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateRecipeMutation,
  useDeleteRecipeMutation,
  useRecipesQuery,
} from "./use-recipes";
import * as api from "@/features/recipes/api";
import type { Recipe, RecipeWithIngredients } from "@/features/recipes/api";

const recipe: Recipe = {
  id: "r1",
  name: "Croissant",
  description: "Buttery, flaky",
  yieldQuantity: "12",
  yieldUnit: "pcs",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const recipeWithIngredients: RecipeWithIngredients = {
  ...recipe,
  ingredients: [
    { id: "ri1", ingredientId: "i1", quantity: "1", ingredient: { name: "Flour", unit: "kg" } },
  ],
};

vi.mock("@/features/recipes/api");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useRecipesQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches a page of recipes via listRecipes", async () => {
    const result = { items: [recipe], total: 1, limit: 20, offset: 0 };
    vi.mocked(api.listRecipes).mockResolvedValue(result);

    const { result: hookResult } = renderHook(() => useRecipesQuery({ limit: 20, offset: 0 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(hookResult.current.isSuccess).toBe(true));

    expect(api.listRecipes).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(hookResult.current.data).toEqual(result);
  });
});

describe("useCreateRecipeMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls createRecipe and invalidates the recipes list on success", async () => {
    vi.mocked(api.createRecipe).mockResolvedValue(recipeWithIngredients);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateRecipeMutation(), { wrapper });

    const input = {
      name: "Croissant",
      yieldQuantity: 12,
      yieldUnit: "pcs",
      ingredients: [{ ingredientId: "i1", quantity: 1 }],
    };
    result.current.mutate(input);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.createRecipe).toHaveBeenCalledWith(input);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });
});

describe("useDeleteRecipeMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls deleteRecipe and invalidates the recipes list on success", async () => {
    vi.mocked(api.deleteRecipe).mockResolvedValue(undefined);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDeleteRecipeMutation(), { wrapper });

    result.current.mutate("r1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.deleteRecipe).toHaveBeenCalledWith("r1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["recipes"] });
  });
});
