import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoleFormDialog } from "./RoleFormDialog";
import * as rolesHooks from "@/features/roles/hooks/use-roles";

vi.mock("@/features/roles/hooks/use-roles");

function mockMutation<T>(overrides: Record<string, unknown> = {}): T {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ id: "role1", role: "cashier", permission: {} }),
    mutate: vi.fn(),
    isError: false,
    error: null,
    isPending: false,
    ...overrides,
  } as unknown as T;
}

function mockQuery<T>(overrides: Record<string, unknown> = {}): T {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  } as unknown as T;
}

describe("RoleFormDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("Finding 1/2: out-of-ceiling permission drop warning", () => {
    it("requires no confirmation and saves normally when the role holds nothing outside the caller's ceiling", async () => {
      vi.mocked(rolesHooks.useMyCeilingQuery).mockReturnValue(
        mockQuery({ data: { order: ["create", "read"] } }),
      );
      vi.mocked(rolesHooks.useRoleQuery).mockReturnValue(
        mockQuery({ data: { id: "role1", role: "cashier", permission: { order: ["create"] } } }),
      );
      const mutateAsync = vi.fn().mockResolvedValue({ id: "role1", role: "cashier", permission: {} });
      vi.mocked(rolesHooks.useUpdateRoleMutation).mockReturnValue(mockMutation({ mutateAsync }));
      vi.mocked(rolesHooks.useCreateRoleMutation).mockReturnValue(mockMutation());

      render(<RoleFormDialog open onClose={vi.fn()} role={{ role: "cashier", isStatic: false }} />);

      expect(screen.queryByText(/saving will remove/i)).not.toBeInTheDocument();
      const saveButton = screen.getByRole("button", { name: /save changes/i });
      expect(saveButton).not.toBeDisabled();

      fireEvent.click(saveButton);
      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          name: "cashier",
          input: { permission: { order: ["create"] } },
        }),
      );
    });

    it("shows a warning listing out-of-ceiling permissions, disables Save until confirmed, then drops them on submit", async () => {
      vi.mocked(rolesHooks.useMyCeilingQuery).mockReturnValue(
        mockQuery({ data: { order: ["create", "read"] } }),
      );
      vi.mocked(rolesHooks.useRoleQuery).mockReturnValue(
        mockQuery({
          data: {
            id: "role1",
            role: "cashier",
            // `order:create` is in the caller's ceiling; `ac:delete` is not.
            permission: { order: ["create"], ac: ["delete"] },
          },
        }),
      );
      const mutateAsync = vi.fn().mockResolvedValue({ id: "role1", role: "cashier", permission: {} });
      vi.mocked(rolesHooks.useUpdateRoleMutation).mockReturnValue(mockMutation({ mutateAsync }));
      vi.mocked(rolesHooks.useCreateRoleMutation).mockReturnValue(mockMutation());

      render(<RoleFormDialog open onClose={vi.fn()} role={{ role: "cashier", isStatic: false }} />);

      // The warning names the out-of-ceiling pair and the disabled checkbox
      // for it is rendered checked, so the user can see what exists.
      expect(screen.getByText(/saving will remove 1 permission/i)).toBeInTheDocument();
      expect(screen.getByText(/ac:delete/)).toBeInTheDocument();
      const outOfCeilingCheckbox = screen.getByRole("checkbox", { name: /delete \(outside your permissions\)/i });
      expect(outOfCeilingCheckbox).toBeChecked();
      expect(outOfCeilingCheckbox).toBeDisabled();

      const saveButton = screen.getByRole("button", { name: /save changes/i });
      expect(saveButton).toBeDisabled();

      // Confirming the explicit "I understand" checkbox unlocks Save.
      fireEvent.click(screen.getByRole("checkbox", { name: /i understand/i }));
      expect(saveButton).not.toBeDisabled();

      fireEvent.click(saveButton);

      // The submitted payload only contains what the caller could actually
      // grant — the out-of-ceiling `ac:delete` is dropped, as warned.
      await waitFor(() =>
        expect(mutateAsync).toHaveBeenCalledWith({
          name: "cashier",
          input: { permission: { order: ["create"] } },
        }),
      );
    });

    it("does not carry a prior confirmation over when the same role is closed and reopened", () => {
      vi.mocked(rolesHooks.useMyCeilingQuery).mockReturnValue(
        mockQuery({ data: { order: ["create", "read"] } }),
      );
      vi.mocked(rolesHooks.useRoleQuery).mockReturnValue(
        mockQuery({
          data: { id: "role1", role: "cashier", permission: { order: ["create"], ac: ["delete"] } },
        }),
      );
      vi.mocked(rolesHooks.useUpdateRoleMutation).mockReturnValue(mockMutation());
      vi.mocked(rolesHooks.useCreateRoleMutation).mockReturnValue(mockMutation());

      const { rerender } = render(
        <RoleFormDialog open onClose={vi.fn()} role={{ role: "cashier", isStatic: false }} />,
      );
      fireEvent.click(screen.getByRole("checkbox", { name: /i understand/i }));
      expect(screen.getByRole("button", { name: /save changes/i })).not.toBeDisabled();

      // Close the dialog (still mounted — RolesTable keeps it mounted and
      // only toggles `open`), then reopen the SAME role.
      rerender(<RoleFormDialog open={false} onClose={vi.fn()} role={null} />);
      rerender(<RoleFormDialog open onClose={vi.fn()} role={{ role: "cashier", isStatic: false }} />);

      // The confirmation must not have survived the close — Save is disabled
      // again until the user re-confirms.
      expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
    });
  });

  describe("Finding 4: failed role-detail load", () => {
    it("disables Save and shows an error instead of falling through to an empty-permissions form", () => {
      vi.mocked(rolesHooks.useMyCeilingQuery).mockReturnValue(
        mockQuery({ data: { order: ["create", "read"] } }),
      );
      vi.mocked(rolesHooks.useRoleQuery).mockReturnValue(
        mockQuery({ isError: true, error: new Error("network error") }),
      );
      vi.mocked(rolesHooks.useUpdateRoleMutation).mockReturnValue(mockMutation());
      vi.mocked(rolesHooks.useCreateRoleMutation).mockReturnValue(mockMutation());

      render(<RoleFormDialog open onClose={vi.fn()} role={{ role: "cashier", isStatic: false }} />);

      expect(screen.getByText(/couldn.t load this role.s current permissions/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /save changes/i })).toBeDisabled();
      // No checkbox grid is rendered at all while the load has failed.
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });
  });
});
