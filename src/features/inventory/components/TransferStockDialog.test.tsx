import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TransferStockDialog } from "./TransferStockDialog";
import * as ingredientsHooks from "@/features/inventory/hooks/use-ingredients";
import * as stockHooks from "@/features/inventory/hooks/use-stock";
import * as authClient from "@/lib/auth-client";
import { useBranchStore } from "@/stores/branch-store";

vi.mock("@/features/inventory/hooks/use-ingredients");
vi.mock("@/features/inventory/hooks/use-stock");
vi.mock("@/lib/auth-client");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function mockMutation<T>(): T {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ out: { id: "m1" }, in: { id: "m2" } }),
    mutate: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
  } as unknown as T;
}

const ingredient = {
  id: "i1",
  name: "Flour",
  unit: "kg",
  reorderThreshold: null,
  supplierId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const teams = [
  { id: "branch-1", name: "Main" },
  { id: "branch-2", name: "Downtown" },
  { id: "branch-3", name: "Airport" },
];

describe("TransferStockDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useBranchStore.setState({ activeBranchId: "branch-1", activeBranchName: "Main" });
    vi.mocked(ingredientsHooks.useIngredientsQuery).mockReturnValue({
      data: { items: [ingredient], total: 1, limit: 100, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof ingredientsHooks.useIngredientsQuery>);
    vi.mocked(authClient.useActiveOrganization).mockReturnValue({
      data: { id: "org1", teams },
      isPending: false,
    } as unknown as ReturnType<typeof authClient.useActiveOrganization>);
    vi.mocked(stockHooks.useTransferStockMutation).mockReturnValue(
      mockMutation<ReturnType<typeof stockHooks.useTransferStockMutation>>(),
    );
  });

  afterEach(() => {
    useBranchStore.setState({ activeBranchId: null, activeBranchName: null });
  });

  it("excludes the active branch from the destination-branch options", () => {
    render(<TransferStockDialog open onClose={vi.fn()} />);

    fireEvent.mouseDown(screen.getByLabelText(/destination branch/i));

    expect(screen.queryByRole("option", { name: "Main" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Downtown" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Airport" })).toBeInTheDocument();
  });

  it("submits the form and calls the transfer mutation", async () => {
    const mutation = mockMutation<ReturnType<typeof stockHooks.useTransferStockMutation>>();
    vi.mocked(stockHooks.useTransferStockMutation).mockReturnValue(mutation);

    const onClose = vi.fn();
    render(<TransferStockDialog open onClose={onClose} />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: /ingredient/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Flour" }));

    fireEvent.change(screen.getByLabelText(/^quantity/i), { target: { value: "3" } });

    fireEvent.mouseDown(screen.getByLabelText(/destination branch/i));
    fireEvent.click(screen.getByRole("option", { name: "Downtown" }));

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "rebalance" } });
    fireEvent.click(screen.getByRole("button", { name: /^transfer$/i }));

    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalled());
    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      ingredientId: "i1",
      quantity: 3,
      reason: "rebalance",
      toBranchId: "branch-2",
    });
    expect(onClose).toHaveBeenCalled();
  });
});
