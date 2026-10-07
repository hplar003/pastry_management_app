import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BranchFormDialog } from "./BranchFormDialog";
import * as hooks from "@/features/branches/hooks/use-branches";

vi.mock("@/features/branches/hooks/use-branches");

// `afterEach(cleanup)` is registered globally in `tests/setup.ts`.

/** Builds a stub mutation result, cast to whichever of the two mutation hooks' return types `T` names at the call site. */
function mockMutation<T>(): T {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ id: "b1" }),
    mutate: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
  } as unknown as T;
}

describe("BranchFormDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("create mode: submits the form and calls the create mutation", async () => {
    const createMutation = mockMutation<ReturnType<typeof hooks.useCreateBranchMutation>>();
    vi.mocked(hooks.useCreateBranchMutation).mockReturnValue(createMutation);
    vi.mocked(hooks.useUpdateBranchMutation).mockReturnValue(
      mockMutation<ReturnType<typeof hooks.useUpdateBranchMutation>>(),
    );

    const onClose = vi.fn();

    render(<BranchFormDialog open onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "Poblacion Branch" } });
    fireEvent.click(screen.getByRole("button", { name: /create branch/i }));

    await waitFor(() => expect(createMutation.mutateAsync).toHaveBeenCalled());
    expect(createMutation.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Poblacion Branch" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("edit mode: pre-fills the form and calls the update mutation with the branch id", async () => {
    const updateMutation = mockMutation<ReturnType<typeof hooks.useUpdateBranchMutation>>();
    vi.mocked(hooks.useCreateBranchMutation).mockReturnValue(
      mockMutation<ReturnType<typeof hooks.useCreateBranchMutation>>(),
    );
    vi.mocked(hooks.useUpdateBranchMutation).mockReturnValue(updateMutation);

    const branch = {
      id: "b1",
      name: "Poblacion Branch",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const onClose = vi.fn();

    render(<BranchFormDialog open onClose={onClose} branch={branch} />);

    expect(screen.getByLabelText(/^name/i)).toHaveValue("Poblacion Branch");

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateMutation.mutateAsync).toHaveBeenCalled());
    expect(updateMutation.mutateAsync).toHaveBeenCalledWith({
      id: "b1",
      input: expect.objectContaining({ name: "Poblacion Branch" }),
    });
    expect(onClose).toHaveBeenCalled();
  });
});
