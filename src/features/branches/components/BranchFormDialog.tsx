"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { getApiErrorMessage, ApiError } from "@/lib/api-client";
import { createBranchSchema, updateBranchSchema } from "@/features/branches/schemas";
import type { CreateBranchInput, UpdateBranchInput } from "@/features/branches/schemas";
import type { Branch } from "@/features/branches/api";
import { useCreateBranchMutation, useUpdateBranchMutation } from "@/features/branches/hooks/use-branches";

/**
 * Same shared-form-shape approach as
 * `src/features/suppliers/components/SupplierFormDialog.tsx`: a plain
 * controlled `string` for the single `name` field, with the real
 * `createBranchSchema`/`updateBranchSchema` (imported, not redeclared) run
 * against it in `onSubmit` for the same client-then-server validation
 * discipline.
 */
type BranchFormValues = {
  name: string;
};

/** Zod's `error.flatten()` shape, as sent by `ValidationError` in `src/server/errors.ts`. */
type FlattenedZodError = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

const FORM_FIELDS = ["name"] as const;

function toFormDefaults(branch?: Branch): BranchFormValues {
  return { name: branch?.name ?? "" };
}

export type BranchFormDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Omit for create mode; pass the row's already-fetched data for edit mode. */
  branch?: Branch;
};

export function BranchFormDialog({ open, onClose, branch }: BranchFormDialogProps) {
  const isEditMode = !!branch;
  const createMutation = useCreateBranchMutation();
  const updateMutation = useUpdateBranchMutation();
  const mutation = isEditMode ? updateMutation : createMutation;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BranchFormValues>({
    defaultValues: toFormDefaults(branch),
  });

  // Re-seed the form whenever the dialog opens (create vs. edit, or a
  // different row) instead of carrying over whatever was last typed.
  useEffect(() => {
    if (open) reset(toFormDefaults(branch));
  }, [open, branch, reset]);

  function applyFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0 && (FORM_FIELDS as readonly string[]).includes(field)) {
        setError(field as keyof BranchFormValues, { message: messages[0] });
      }
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const input: CreateBranchInput | UpdateBranchInput = { name: values.name };

    if (isEditMode) {
      const parsed = updateBranchSchema.safeParse(input);
      if (!parsed.success) {
        applyFieldErrors(parsed.error.flatten().fieldErrors);
        return;
      }
      try {
        await updateMutation.mutateAsync({ id: branch.id, input: parsed.data });
        onClose();
      } catch (err) {
        if (err instanceof ApiError && err.code === "VALIDATION" && err.details) {
          applyFieldErrors((err.details as FlattenedZodError).fieldErrors);
        }
        // Otherwise swallow — the Alert below reads `mutation.error` directly.
      }
      return;
    }

    const parsed = createBranchSchema.safeParse(input);
    if (!parsed.success) {
      applyFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    try {
      await createMutation.mutateAsync(parsed.data);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "VALIDATION" && err.details) {
        applyFieldErrors((err.details as FlattenedZodError).fieldErrors);
      }
      // Otherwise swallow — the Alert below reads `mutation.error` directly.
    }
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEditMode ? "Edit branch" : "New branch"}</DialogTitle>
      <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            {mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error)}</Alert>}

            <TextField
              {...register("name")}
              label="Name"
              error={!!errors.name}
              helperText={errors.name?.message}
              disabled={isSubmitting}
              fullWidth
              autoFocus
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
            startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {isEditMode ? "Save changes" : "Create branch"}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
