import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RecipesTable } from "./RecipesTable";
import * as api from "@/features/recipes/api";
import * as ingredientsApi from "@/features/inventory/api";
import { ApiError } from "@/lib/api-client";

vi.mock("@/features/recipes/api");
vi.mock("@/features/inventory/api");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("RecipesTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ingredientsApi.listIngredients).mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  });

  it("shows a loading indicator before data arrives", () => {
    vi.mocked(api.listRecipes).mockReturnValue(new Promise(() => {}));

    renderWithClient(<RecipesTable />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the empty state when there are no recipes", async () => {
    vi.mocked(api.listRecipes).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderWithClient(<RecipesTable />);

    expect(await screen.findByText("No recipes yet.")).toBeInTheDocument();
  });

  it("renders a row per recipe with its yield, but no ingredient count (list DTO is scalars only)", async () => {
    vi.mocked(api.listRecipes).mockResolvedValue({
      items: [
        {
          id: "r1",
          name: "Croissant",
          description: "Buttery, flaky",
          yieldQuantity: "12",
          yieldUnit: "pcs",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithClient(<RecipesTable />);

    expect(await screen.findByText("Croissant")).toBeInTheDocument();
    expect(screen.getByText("12 pcs")).toBeInTheDocument();
    expect(screen.queryByText(/ingredients?$/i)).not.toBeInTheDocument();
  });

  it("shows an error alert when the query fails", async () => {
    vi.mocked(api.listRecipes).mockRejectedValue(new ApiError("INTERNAL", 500, undefined, "req-1"));

    renderWithClient(<RecipesTable />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
