import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SupplierFormDialog } from "./SupplierFormDialog";
import * as hooks from "@/features/suppliers/hooks/use-suppliers";

vi.mock("@/features/suppliers/hooks/use-suppliers");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

/** Builds a stub mutation result, cast to whichever of the two mutation hooks' return types `T` names at the call site. */
function mockMutation<T>(): T {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ id: "s1" }),
    mutate: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
  } as unknown as T;
}

describe("SupplierFormDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("create mode: submits the form and calls the create mutation", async () => {
    const createMutation = mockMutation<ReturnType<typeof hooks.useCreateSupplierMutation>>();
    vi.mocked(hooks.useCreateSupplierMutation).mockReturnValue(createMutation);
    vi.mocked(hooks.useUpdateSupplierMutation).mockReturnValue(
      mockMutation<ReturnType<typeof hooks.useUpdateSupplierMutation>>(),
    );

    const onClose = vi.fn();

    render(<SupplierFormDialog open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Acme Flour Co." } });
    fireEvent.click(screen.getByRole("button", { name: /create supplier/i }));

    await waitFor(() => expect(createMutation.mutateAsync).toHaveBeenCalled());
    expect(createMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme Flour Co." }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("edit mode: pre-fills the form and calls the update mutation with the supplier id", async () => {
    const updateMutation = mockMutation<ReturnType<typeof hooks.useUpdateSupplierMutation>>();
    vi.mocked(hooks.useCreateSupplierMutation).mockReturnValue(
      mockMutation<ReturnType<typeof hooks.useCreateSupplierMutation>>(),
    );
    vi.mocked(hooks.useUpdateSupplierMutation).mockReturnValue(updateMutation);

    const supplier = {
      id: "s1",
      name: "Acme Flour Co.",
      contactName: "Jane Doe",
      email: null,
      phone: null,
      address: null,
      notes: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const onClose = vi.fn();

    render(<SupplierFormDialog open onClose={onClose} supplier={supplier} />);

    expect(screen.getByLabelText(/^name/i)).toHaveValue("Acme Flour Co.");

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMutation.mutateAsync).toHaveBeenCalled());
    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
      id: "s1",
      input: expect.objectContaining({ name: "Acme Flour Co." }),
    });
    expect(onClose).toHaveBeenCalled();
  });
});
