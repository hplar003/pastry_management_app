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
import type { Branch } from "@/features/branches/api";
import { useDeleteBranchMutation } from "@/features/branches/hooks/use-branches";

export type DeleteBranchDialogProps = {
  open: boolean;
  onClose: () => void;
  branch: Branch | null;
};

export function DeleteBranchDialog({ open, onClose, branch }: DeleteBranchDialogProps) {
  const deleteMutation = useDeleteBranchMutation();

  const onConfirm = async () => {
    if (!branch) return;
    try {
      await deleteMutation.mutateAsync(branch.id);
      onClose();
    } catch {
      // Swallow — the Alert below reads `deleteMutation.error` directly.
      // Better Auth itself blocks deleting the caller's own active team or
      // the organization's last remaining team
      // (`src/features/branches/server/service.ts`'s `rethrowTeamApiError`
      // surfaces those as a clean 4xx, e.g. `UNABLE_TO_REMOVE_LAST_TEAM`)
      // — this dialog doesn't need its own copy of either rule, it just
      // shows whatever message comes back.
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete this branch?</DialogTitle>
      <DialogContent>
        {deleteMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getApiErrorMessage(deleteMutation.error)}
          </Alert>
        )}
        <DialogContentText>
          {branch ? `This will remove "${branch.name}" from your branches.` : null} This can&apos;t be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleteMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          color="error"
          variant="contained"
          disabled={deleteMutation.isPending}
          startIcon={deleteMutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
