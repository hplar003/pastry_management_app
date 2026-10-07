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
import { adjustStockSchema } from "@/features/inventory/schemas";
import type { Ingredient } from "@/features/inventory/api";
import { useIngredientsQuery } from "@/features/inventory/hooks/use-ingredients";
import { useAdjustStockMutation } from "@/features/inventory/hooks/use-stock";

const INGREDIENT_OPTIONS_LIMIT = 100;

/**
 * `adjustStockSchema` has no optional fields (unlike the ingredient-catalog
 * schemas), so there's no "blank string vs. undefined" trap here — just the
 * usual "every schema field crosses this form as a string" conversion for
 * the numeric `qty`.
 */
type AdjustStockFormValues = {
  ingredientId: string;
  qty: string;
  reason: string;
};

/** Zod's `error.flatten()` shape, as sent by `ValidationError` in `src/server/errors.ts`. */
type FlattenedZodError = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

const FORM_FIELDS = ["ingredientId", "qty", "reason"] as const;

const EMPTY_DEFAULTS: AdjustStockFormValues = { ingredientId: "", qty: "", reason: "" };

export type AdjustStockDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function AdjustStockDialog({ open, onClose }: AdjustStockDialogProps) {
  const mutation = useAdjustStockMutation();
  const { data: ingredientsData } = useIngredientsQuery({ limit: INGREDIENT_OPTIONS_LIMIT, offset: 0 });
  const ingredients = ingredientsData?.items ?? [];

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AdjustStockFormValues>({ defaultValues: EMPTY_DEFAULTS });

  useEffect(() => {
    if (open) reset(EMPTY_DEFAULTS);
  }, [open, reset]);

  function applyFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0 && (FORM_FIELDS as readonly string[]).includes(field)) {
        setError(field as keyof AdjustStockFormValues, { message: messages[0] });
      }
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const input = {
      ingredientId: values.ingredientId,
      qty: Number(values.qty),
      reason: values.reason,
    };

    const parsed = adjustStockSchema.safeParse(input);
    if (!parsed.success) {
      applyFieldErrors(parsed.error.flatten().fieldErrors);
      return;
    }
    try {
      await mutation.mutateAsync(parsed.data);
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
      <DialogTitle>Adjust stock</DialogTitle>
      <Stack component="form" spacing={2.5} onSubmit={onSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2.5}>
            {mutation.isError && <Alert severity="error">{getApiErrorMessage(mutation.error)}</Alert>}

            <Controller
              name="ingredientId"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={ingredients}
                  getOptionLabel={(i: Ingredient) => i.name}
                  isOptionEqualToValue={(option: Ingredient, value: Ingredient) => option.id === value.id}
                  value={ingredients.find((i) => i.id === field.value) ?? null}
                  onChange={(_event, value) => field.onChange(value ? value.id : "")}
                  disabled={isSubmitting}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Ingredient"
                      error={!!errors.ingredientId}
                      helperText={errors.ingredientId?.message}
                      required
                      autoFocus
                    />
                  )}
                />
              )}
            />
            <TextField
              {...register("qty")}
              label="Quantity (+/-)"
              type="number"
              helperText={errors.qty?.message ?? "Positive to add, negative to remove."}
              error={!!errors.qty}
              disabled={isSubmitting}
              fullWidth
              required
            />
            <TextField
              {...register("reason")}
              label="Reason"
              error={!!errors.reason}
              helperText={errors.reason?.message}
              disabled={isSubmitting}
              fullWidth
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
            Adjust
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
