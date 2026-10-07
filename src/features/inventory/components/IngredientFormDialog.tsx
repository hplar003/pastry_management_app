"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { getApiErrorMessage, ApiError } from "@/lib/api-client";
import { createIngredientSchema, updateIngredientSchema } from "@/features/inventory/schemas";
import type { CreateIngredientInput, UpdateIngredientInput } from "@/features/inventory/schemas";
import type { Ingredient } from "@/features/inventory/api";
import {
  useCreateIngredientMutation,
  useUpdateIngredientMutation,
} from "@/features/inventory/hooks/use-ingredients";
// Cross-feature read, exactly as the plan anticipates ("done via importing
// suppliers' api.ts/hooks directly") — the inventory feature has no reason
// to duplicate the suppliers query.
import { useSuppliersQuery } from "@/features/suppliers/hooks/use-suppliers";
import type { Supplier } from "@/features/suppliers/api";

/**
 * Generous page size instead of building pagination into the Autocomplete —
 * fine for a catalog of this size. Known scaling limit: if the supplier
 * list ever grows past one page, this Autocomplete silently won't show the
 * rest; revisit with real pagination-in-autocomplete then, not now.
 */
const SUPPLIER_OPTIONS_LIMIT = 100;

/**
 * Same reasoning as `SupplierFormDialog` (see its doc comment): plain,
 * possibly-empty strings for every field because MUI inputs need controlled
 * string values, while the shared schema's optional fields
 * (`reorderThreshold`, `supplierId`) reject `""` outright. `toSubmitInput`
 * normalizes blanks to `undefined` before the real schema runs.
 */
type IngredientFormValues = {
  name: string;
  unit: string;
  reorderThreshold: string;
  supplierId: string;
};

/** Zod's `error.flatten()` shape, as sent by `ValidationError` in `src/server/errors.ts`. */
type FlattenedZodError = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

const FORM_FIELDS = ["name", "unit", "reorderThreshold", "supplierId"] as const;

function toFormDefaults(ingredient?: Ingredient): IngredientFormValues {
  return {
    name: ingredient?.name ?? "",
    unit: ingredient?.unit ?? "",
    reorderThreshold: ingredient?.reorderThreshold ?? "",
    supplierId: ingredient?.supplierId ?? "",
  };
}

function toSubmitInput(values: IngredientFormValues): CreateIngredientInput | UpdateIngredientInput {
  const reorderThreshold = values.reorderThreshold.trim();
  return {
    name: values.name,
    unit: values.unit,
    reorderThreshold: reorderThreshold === "" ? undefined : Number(reorderThreshold),
    supplierId: values.supplierId.trim() === "" ? undefined : values.supplierId,
  };
}

export type IngredientFormDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Omit for create mode; pass the row's already-fetched data for edit mode. */
  ingredient?: Ingredient;
};

export function IngredientFormDialog({ open, onClose, ingredient }: IngredientFormDialogProps) {
  const isEditMode = !!ingredient;
  const createMutation = useCreateIngredientMutation();
  const updateMutation = useUpdateIngredientMutation();
  const mutation = isEditMode ? updateMutation : createMutation;

  const { data: suppliersData } = useSuppliersQuery({ limit: SUPPLIER_OPTIONS_LIMIT, offset: 0 });
  const suppliers = suppliersData?.items ?? [];

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<IngredientFormValues>({
    defaultValues: toFormDefaults(ingredient),
  });

  // Re-seed the form whenever the dialog opens (create vs. edit, or a
  // different row) instead of carrying over whatever was last typed.
  useEffect(() => {
    if (open) reset(toFormDefaults(ingredient));
  }, [open, ingredient, reset]);

  function applyFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0 && (FORM_FIELDS as readonly string[]).includes(field)) {
        setError(field as keyof IngredientFormValues, { message: messages[0] });
      }
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const input = toSubmitInput(values);

    if (isEditMode) {
      const parsed = updateIngredientSchema.safeParse(input);
      if (!parsed.success) {
        applyFieldErrors(parsed.error.flatten().fieldErrors);
        return;
      }
      try {
        await updateMutation.mutateAsync({ id: ingredient.id, input: parsed.data });
        onClose();
      } catch (err) {
        if (err instanceof ApiError && err.code === "VALIDATION" && err.details) {
          applyFieldErrors((err.details as FlattenedZodError).fieldErrors);
        }
        // Otherwise swallow — the Alert below reads `mutation.error` directly.
      }
      return;
    }

    const parsed = createIngredientSchema.safeParse(input);
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
      <DialogTitle>{isEditMode ? "Edit ingredient" : "New ingredient"}</DialogTitle>
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
              {...register("unit")}
              label="Unit"
              placeholder="e.g. kg, g, L"
              error={!!errors.unit}
              helperText={errors.unit?.message}
              disabled={isSubmitting}
              fullWidth
              required
            />
            <TextField
              {...register("reorderThreshold")}
              label="Reorder threshold"
              type="number"
              error={!!errors.reorderThreshold}
              helperText={errors.reorderThreshold?.message}
              disabled={isSubmitting}
              fullWidth
            />
            <Controller
              name="supplierId"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={suppliers}
                  getOptionLabel={(s: Supplier) => s.name}
                  isOptionEqualToValue={(option: Supplier, value: Supplier) => option.id === value.id}
                  value={suppliers.find((s) => s.id === field.value) ?? null}
                  onChange={(_event, value) => field.onChange(value ? value.id : "")}
                  disabled={isSubmitting}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Supplier"
                      error={!!errors.supplierId}
                      helperText={errors.supplierId?.message}
                    />
                  )}
                />
              )}
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
            {isEditMode ? "Save changes" : "Create ingredient"}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
