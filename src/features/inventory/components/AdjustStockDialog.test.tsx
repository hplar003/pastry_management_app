import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdjustStockDialog } from "./AdjustStockDialog";
import * as ingredientsHooks from "@/features/inventory/hooks/use-ingredients";
import * as stockHooks from "@/features/inventory/hooks/use-stock";

vi.mock("@/features/inventory/hooks/use-ingredients");
vi.mock("@/features/inventory/hooks/use-stock");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

function mockMutation<T>(): T {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ id: "m1" }),
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

describe("AdjustStockDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ingredientsHooks.useIngredientsQuery).mockReturnValue({
      data: { items: [ingredient], total: 1, limit: 100, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof ingredientsHooks.useIngredientsQuery>);
  });

  it("submits the form and calls the adjust mutation with the signed qty", async () => {
    const mutation = mockMutation<ReturnType<typeof stockHooks.useAdjustStockMutation>>();
    vi.mocked(stockHooks.useAdjustStockMutation).mockReturnValue(mutation);

    const onClose = vi.fn();
    render(<AdjustStockDialog open onClose={onClose} />);

    fireEvent.mouseDown(screen.getByRole("combobox", { name: /ingredient/i }));
    fireEvent.click(await screen.findByRole("option", { name: "Flour" }));

    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "-5" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "spoilage" } });
    fireEvent.click(screen.getByRole("button", { name: /^adjust$/i }));

    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalled());
    expect(mutation.mutateAsync).toHaveBeenCalledWith({
      ingredientId: "i1",
      qty: -5,
      reason: "spoilage",
    });
    expect(onClose).toHaveBeenCalled();
  });
});
