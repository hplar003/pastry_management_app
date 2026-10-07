import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { IngredientsTable } from "./IngredientsTable";
import * as api from "@/features/inventory/api";
import * as suppliersApi from "@/features/suppliers/api";

vi.mock("@/features/inventory/api");
vi.mock("@/features/suppliers/api");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("IngredientsTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(suppliersApi.listSuppliers).mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  });

  it("shows a loading indicator before data arrives", () => {
    vi.mocked(api.listIngredients).mockReturnValue(new Promise(() => {}));

    renderWithClient(<IngredientsTable />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders the empty state when there are no ingredients", async () => {
    vi.mocked(api.listIngredients).mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    renderWithClient(<IngredientsTable />);

    expect(await screen.findByText("No ingredients yet.")).toBeInTheDocument();
  });

  it("renders a row per ingredient", async () => {
    vi.mocked(api.listIngredients).mockResolvedValue({
      items: [
        {
          id: "i1",
          name: "Flour",
          unit: "kg",
          reorderThreshold: "5",
          supplierId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    renderWithClient(<IngredientsTable />);

    await waitFor(() => expect(screen.getByText("Flour")).toBeInTheDocument());
    expect(screen.getByText("kg")).toBeInTheDocument();
  });

  it("shows an error alert when the list fails to load", async () => {
    const { ApiError } = await import("@/lib/api-client");
    vi.mocked(api.listIngredients).mockRejectedValue(new ApiError("UNKNOWN", 500, undefined, "req-1"));

    renderWithClient(<IngredientsTable />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
