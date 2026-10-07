import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCreateIngredientMutation,
  useDeleteIngredientMutation,
  useIngredientsQuery,
} from "./use-ingredients";
import * as api from "@/features/inventory/api";
import type { Ingredient } from "@/features/inventory/api";

const ingredient: Ingredient = {
  id: "i1",
  name: "Flour",
  unit: "kg",
  reorderThreshold: "5",
  supplierId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

vi.mock("@/features/inventory/api");

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useIngredientsQuery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches a page of ingredients via listIngredients", async () => {
    const result = { items: [ingredient], total: 1, limit: 20, offset: 0 };
    vi.mocked(api.listIngredients).mockResolvedValue(result);

    const { result: hookResult } = renderHook(() => useIngredientsQuery({ limit: 20, offset: 0 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(hookResult.current.isSuccess).toBe(true));

    expect(api.listIngredients).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(hookResult.current.data).toEqual(result);
  });
});

describe("useCreateIngredientMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls createIngredient and invalidates the ingredients list on success", async () => {
    const created: Ingredient = { ...ingredient, name: "Sugar" };
    vi.mocked(api.createIngredient).mockResolvedValue(created);
    vi.mocked(api.listIngredients).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateIngredientMutation(), { wrapper });

    result.current.mutate({ name: "Sugar", unit: "kg" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.createIngredient).toHaveBeenCalledWith({ name: "Sugar", unit: "kg" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ingredients"] });
  });
});

describe("useDeleteIngredientMutation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls deleteIngredient and invalidates the ingredients list on success", async () => {
    vi.mocked(api.deleteIngredient).mockResolvedValue(undefined);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useDeleteIngredientMutation(), { wrapper });

    result.current.mutate("i1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.deleteIngredient).toHaveBeenCalledWith("i1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["ingredients"] });
  });
});
