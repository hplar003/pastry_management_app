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
import type { Supplier } from "@/features/suppliers/api";
import { useDeleteSupplierMutation } from "@/features/suppliers/hooks/use-suppliers";

export type DeleteSupplierDialogProps = {
  open: boolean;
  onClose: () => void;
  supplier: Supplier | null;
};

export function DeleteSupplierDialog({ open, onClose, supplier }: DeleteSupplierDialogProps) {
  const deleteMutation = useDeleteSupplierMutation();

  const onConfirm = async () => {
    if (!supplier) return;
    try {
      await deleteMutation.mutateAsync(supplier.id);
      onClose();
    } catch {
      // Swallow — the Alert below reads `deleteMutation.error` directly.
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete this supplier?</DialogTitle>
      <DialogContent>
        {deleteMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getApiErrorMessage(deleteMutation.error)}
          </Alert>
        )}
        <DialogContentText>
          {supplier ? `This will remove "${supplier.name}" from your suppliers list.` : null} This can&apos;t be
          undone.
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
