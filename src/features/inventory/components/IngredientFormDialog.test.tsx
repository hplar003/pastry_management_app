import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IngredientFormDialog } from "./IngredientFormDialog";
import * as hooks from "@/features/inventory/hooks/use-ingredients";
import * as suppliersHooks from "@/features/suppliers/hooks/use-suppliers";

vi.mock("@/features/inventory/hooks/use-ingredients");
vi.mock("@/features/suppliers/hooks/use-suppliers");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

/** Builds a stub mutation result, cast to whichever of the two mutation hooks' return types `T` names at the call site. */
function mockMutation<T>(): T {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ id: "i1" }),
    mutate: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
  } as unknown as T;
}

describe("IngredientFormDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(suppliersHooks.useSuppliersQuery).mockReturnValue({
      data: { items: [{ id: "s1", name: "Acme Flour Co.", contactName: null, email: null, phone: null, address: null, notes: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }], total: 1, limit: 100, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof suppliersHooks.useSuppliersQuery>);
  });

  it("create mode: submits the form and calls the create mutation", async () => {
    const createMutation = mockMutation<ReturnType<typeof hooks.useCreateIngredientMutation>>();
    vi.mocked(hooks.useCreateIngredientMutation).mockReturnValue(createMutation);
    vi.mocked(hooks.useUpdateIngredientMutation).mockReturnValue(
      mockMutation<ReturnType<typeof hooks.useUpdateIngredientMutation>>(),
    );

    const onClose = vi.fn();

    render(<IngredientFormDialog open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Flour" } });
    fireEvent.change(screen.getByLabelText(/^unit/i), { target: { value: "kg" } });
    fireEvent.click(screen.getByRole("button", { name: /create ingredient/i }));

    await waitFor(() => expect(createMutation.mutateAsync).toHaveBeenCalled());
    expect(createMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Flour", unit: "kg" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("edit mode: pre-fills the form and calls the update mutation with the ingredient id", async () => {
    const updateMutation = mockMutation<ReturnType<typeof hooks.useUpdateIngredientMutation>>();
    vi.mocked(hooks.useCreateIngredientMutation).mockReturnValue(
      mockMutation<ReturnType<typeof hooks.useCreateIngredientMutation>>(),
    );
    vi.mocked(hooks.useUpdateIngredientMutation).mockReturnValue(updateMutation);

    const ingredient = {
      id: "i1",
      name: "Flour",
      unit: "kg",
      reorderThreshold: null,
      supplierId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const onClose = vi.fn();

    render(<IngredientFormDialog open onClose={onClose} ingredient={ingredient} />);

    expect(screen.getByLabelText(/^name/i)).toHaveValue("Flour");

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMutation.mutateAsync).toHaveBeenCalled());
    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
      id: "i1",
      input: expect.objectContaining({ name: "Flour", unit: "kg" }),
    });
    expect(onClose).toHaveBeenCalled();
  });
});
