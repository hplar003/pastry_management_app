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
import type { Ingredient } from "@/features/inventory/api";
import { useDeleteIngredientMutation } from "@/features/inventory/hooks/use-ingredients";

export type DeleteIngredientDialogProps = {
  open: boolean;
  onClose: () => void;
  ingredient: Ingredient | null;
};

export function DeleteIngredientDialog({ open, onClose, ingredient }: DeleteIngredientDialogProps) {
  const deleteMutation = useDeleteIngredientMutation();

  const onConfirm = async () => {
    if (!ingredient) return;
    try {
      await deleteMutation.mutateAsync(ingredient.id);
      onClose();
    } catch {
      // Swallow — the Alert below reads `deleteMutation.error` directly.
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete this ingredient?</DialogTitle>
      <DialogContent>
        {deleteMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getApiErrorMessage(deleteMutation.error)}
          </Alert>
        )}
        <DialogContentText>
          {ingredient ? `This will remove "${ingredient.name}" from your ingredient catalog.` : null} This
          can&apos;t be undone.
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
