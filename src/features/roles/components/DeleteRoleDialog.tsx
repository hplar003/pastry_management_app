"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { getApiErrorMessage } from "@/lib/api-client";
import type { RoleName } from "@/features/roles/api";
import { useDeleteRoleMutation } from "@/features/roles/hooks/use-roles";

export type DeleteRoleDialogProps = {
  open: boolean;
  onClose: () => void;
  role: RoleName | null;
};

/**
 * Plain confirm, same shape as every other delete dialog this plan built
 * (`RemoveMemberDialog`, `DeleteBranchDialog`, ...). `DELETE
 * /api/v1/roles/[name]` isn't `fresh: true` (deleting a role definition
 * doesn't itself change what any member can currently do — see the route's
 * own doc comment), so there's no `ReauthDialog` here, unlike
 * `RoleFormDialog`. Better Auth's own guards (predefined role name, role
 * still assigned to a member) surface through `getApiErrorMessage`, same
 * as every other task's delete dialog.
 */
export function DeleteRoleDialog({ open, onClose, role }: DeleteRoleDialogProps) {
  const deleteMutation = useDeleteRoleMutation();

  async function submit() {
    if (!role) return;
    try {
      await deleteMutation.mutateAsync(role.role);
      onClose();
    } catch {
      // Swallow — the Alert below reads `deleteMutation.error` directly.
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete this role?</DialogTitle>
      <DialogContent>
        {deleteMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getApiErrorMessage(deleteMutation.error)}
          </Alert>
        )}
        <DialogContentText>
          {role ? `This will delete the "${role.role}" role.` : null} This can&apos;t be undone, and
          will fail if anyone is still assigned this role.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleteMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => void submit()}
          color="error"
          variant="contained"
          disabled={deleteMutation.isPending}
          startIcon={
            deleteMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined
          }
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
