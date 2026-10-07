import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { StockTable } from "./StockTable";
import * as api from "@/features/inventory/api";
import { useBranchStore } from "@/stores/branch-store";

// `AdjustStockDialog`/`TransferStockDialog` (rendered closed but still
// mounted) call `useIngredientsQuery`/`useActiveOrganization` on every
// render, so those need stubbing too even though this file only exercises
// `StockTable` itself.
vi.mock("@/features/inventory/api");
vi.mock("@/lib/auth-client", () => ({
  useActiveOrganization: vi.fn(() => ({ data: null, isPending: false })),
}));

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function renderWithClient(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

describe("StockTable", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listIngredients).mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  });

  afterEach(() => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
  });

  it("shows an inline prompt instead of a query when no branch is selected", () => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });

    renderWithClient(<StockTable />);

    expect(screen.getByText(/select a branch above to see stock levels/i)).toBeInTheDocument();
    expect(api.listCurrentStock).not.toHaveBeenCalled();
  });

  it("shows a loading indicator before data arrives", () => {
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
    vi.mocked(api.listCurrentStock).mockReturnValue(new Promise(() => {}));

    renderWithClient(<StockTable />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders a row per stock item", async () => {
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
    vi.mocked(api.listCurrentStock).mockResolvedValue([{ id: "i1", name: "Flour", unit: "kg", quantity: "10" }]);

    renderWithClient(<StockTable />);

    await waitFor(() => expect(screen.getByText("Flour")).toBeInTheDocument());
    expect(screen.getByText("10")).toBeInTheDocument();
  });
});
