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
import { createSupplierSchema, updateSupplierSchema } from "@/features/suppliers/schemas";
import type { CreateSupplierInput, UpdateSupplierInput } from "@/features/suppliers/schemas";
import type { Supplier } from "@/features/suppliers/api";
import { useCreateSupplierMutation, useUpdateSupplierMutation } from "@/features/suppliers/hooks/use-suppliers";

/**
 * One shared form shape covering both create and edit. Deliberately NOT
 * using `zodResolver(createSupplierSchema | updateSupplierSchema)`: every
 * field here is a plain (possibly empty) `string`, because MUI `TextField`
 * needs a controlled string value, but the shared schemas' optional fields
 * (e.g. `email: z.email().optional()`) reject an empty string outright — "" is
 * not `undefined`, so `.optional()` doesn't save it, and it still fails
 * `z.email()`/`.min(1)`. Validating raw form values against those schemas
 * would therefore show a spurious "invalid email" error on a row where the
 * user simply left email blank.
 *
 * Instead, `toSubmitInput` normalizes blank optional fields to `undefined`
 * first, and `onSubmit` below runs the *real* `createSupplierSchema`/
 * `updateSupplierSchema` (imported, not redeclared) against that normalized
 * input — same validation the server applies, just run client-side first for
 * fast feedback, with `setError` mapping any failures back onto the form.
 */
type SupplierFormValues = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
};

/** Zod's `error.flatten()` shape, as sent by `ValidationError` in `src/server/errors.ts`. */
type FlattenedZodError = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

const FORM_FIELDS = ["name", "contactName", "email", "phone", "address", "notes"] as const;

function toFormDefaults(supplier?: Supplier): SupplierFormValues {
  return {
    name: supplier?.name ?? "",
    contactName: supplier?.contactName ?? "",
    email: supplier?.email ?? "",
    phone: supplier?.phone ?? "",
    address: supplier?.address ?? "",
    notes: supplier?.notes ?? "",
  };
}

/** Empty-string optional fields must become `undefined`, not `""`, to satisfy the schema's `.optional()` (no `.min(1)` failure on a blank field the user never touched). */
function toSubmitInput(values: SupplierFormValues): CreateSupplierInput | UpdateSupplierInput {
  return {
    name: values.name,
    contactName: values.contactName.trim() === "" ? undefined : values.contactName,
    email: values.email.trim() === "" ? undefined : values.email,
    phone: values.phone.trim() === "" ? undefined : values.phone,
    address: values.address.trim() === "" ? undefined : values.address,
    notes: values.notes.trim() === "" ? undefined : values.notes,
  };
}

export type SupplierFormDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Omit for create mode; pass the row's already-fetched data for edit mode. */
  supplier?: Supplier;
};

export function SupplierFormDialog({ open, onClose, supplier }: SupplierFormDialogProps) {
  const isEditMode = !!supplier;
  const createMutation = useCreateSupplierMutation();
  const updateMutation = useUpdateSupplierMutation();
  const mutation = isEditMode ? updateMutation : createMutation;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SupplierFormValues>({
    defaultValues: toFormDefaults(supplier),
  });

  // Re-seed the form whenever the dialog opens (create vs. edit, or a
  // different row) instead of carrying over whatever was last typed.
  useEffect(() => {
    if (open) reset(toFormDefaults(supplier));
  }, [open, supplier, reset]);

  function applyFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0 && (FORM_FIELDS as readonly string[]).includes(field)) {
        setError(field as keyof SupplierFormValues, { message: messages[0] });
      }
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const input = toSubmitInput(values);

    if (isEditMode) {
      const parsed = updateSupplierSchema.safeParse(input);
      if (!parsed.success) {
        applyFieldErrors(parsed.error.flatten().fieldErrors);
        return;
      }
      try {
        await updateMutation.mutateAsync({ id: supplier.id, input: parsed.data });
        onClose();
      } catch (err) {
        if (err instanceof ApiError && err.code === "VALIDATION" && err.details) {
          applyFieldErrors((err.details as FlattenedZodError).fieldErrors);
        }
        // Otherwise swallow — the Alert below reads `mutation.error` directly.
      }
      return;
    }

    const parsed = createSupplierSchema.safeParse(input);
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
      <DialogTitle>{isEditMode ? "Edit supplier" : "New supplier"}</DialogTitle>
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
            <TextField
              {...register("contactName")}
              label="Contact name"
              error={!!errors.contactName}
              helperText={errors.contactName?.message}
              disabled={isSubmitting}
              fullWidth
            />
            <TextField
              {...register("email")}
              label="Email"
              type="email"
              error={!!errors.email}
              helperText={errors.email?.message}
              disabled={isSubmitting}
              fullWidth
            />
            <TextField
              {...register("phone")}
              label="Phone"
              error={!!errors.phone}
              helperText={errors.phone?.message}
              disabled={isSubmitting}
              fullWidth
            />
            <TextField
              {...register("address")}
              label="Address"
              error={!!errors.address}
              helperText={errors.address?.message}
              disabled={isSubmitting}
              fullWidth
            />
            <TextField
              {...register("notes")}
              label="Notes"
              error={!!errors.notes}
              helperText={errors.notes?.message}
              disabled={isSubmitting}
              fullWidth
              multiline
              minRows={3}
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
            {isEditMode ? "Save changes" : "Create supplier"}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
