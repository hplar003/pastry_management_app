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
import type { Recipe } from "@/features/recipes/api";
import { useDeleteRecipeMutation } from "@/features/recipes/hooks/use-recipes";

export type DeleteRecipeDialogProps = {
  open: boolean;
  onClose: () => void;
  recipe: Recipe | null;
};

export function DeleteRecipeDialog({ open, onClose, recipe }: DeleteRecipeDialogProps) {
  const deleteMutation = useDeleteRecipeMutation();

  const onConfirm = async () => {
    if (!recipe) return;
    try {
      await deleteMutation.mutateAsync(recipe.id);
      onClose();
    } catch {
      // Swallow — the Alert below reads `deleteMutation.error` directly.
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete this recipe?</DialogTitle>
      <DialogContent>
        {deleteMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {getApiErrorMessage(deleteMutation.error)}
          </Alert>
        )}
        <DialogContentText>
          {recipe ? `This will remove "${recipe.name}" from your recipes list.` : null} This can&apos;t be undone.
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
