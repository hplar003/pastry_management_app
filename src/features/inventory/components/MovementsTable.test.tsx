import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MovementsTable } from "./MovementsTable";
import * as ingredientsHooks from "@/features/inventory/hooks/use-ingredients";
import * as stockHooks from "@/features/inventory/hooks/use-stock";
import { useBranchStore } from "@/stores/branch-store";

vi.mock("@/features/inventory/hooks/use-ingredients");
vi.mock("@/features/inventory/hooks/use-stock");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

describe("MovementsTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ingredientsHooks.useIngredientsQuery).mockReturnValue({
      data: { items: [], total: 0, limit: 100, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof ingredientsHooks.useIngredientsQuery>);
  });

  afterEach(() => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
  });

  it("shows an inline prompt instead of a query when no branch is selected", () => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
    vi.mocked(stockHooks.useMovementsQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof stockHooks.useMovementsQuery>);

    render(<MovementsTable />);

    expect(screen.getByText(/select a branch above to see stock movements/i)).toBeInTheDocument();
  });

  it("renders a row per movement", async () => {
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
    vi.mocked(stockHooks.useMovementsQuery).mockReturnValue({
      data: {
        items: [
          {
            id: "m1",
            ingredientId: "i1",
            type: "ADJUSTMENT",
            qty: "-5",
            reason: "spoilage",
            actorId: "u1",
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof stockHooks.useMovementsQuery>);

    render(<MovementsTable />);

    await waitFor(() => expect(screen.getByText("ADJUSTMENT")).toBeInTheDocument());
    expect(screen.getByText("spoilage")).toBeInTheDocument();
    expect(screen.getByText("u1")).toBeInTheDocument();
  });

  it("shows the empty state when there are no movements", async () => {
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
    vi.mocked(stockHooks.useMovementsQuery).mockReturnValue({
      data: { items: [], total: 0, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof stockHooks.useMovementsQuery>);

    render(<MovementsTable />);

    expect(await screen.findByText("No stock movements yet.")).toBeInTheDocument();
  });
});
