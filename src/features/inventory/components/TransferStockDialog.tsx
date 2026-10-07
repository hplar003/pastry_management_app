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
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { getApiErrorMessage, ApiError } from "@/lib/api-client";
import { useActiveOrganization } from "@/lib/auth-client";
import { useBranchStore } from "@/stores/branch-store";
import { transferStockSchema } from "@/features/inventory/schemas";
import type { Ingredient } from "@/features/inventory/api";
import { useIngredientsQuery } from "@/features/inventory/hooks/use-ingredients";
import { useTransferStockMutation } from "@/features/inventory/hooks/use-stock";

const INGREDIENT_OPTIONS_LIMIT = 100;

/** Same narrowing as `src/components/BranchPicker.tsx` — see its doc comment for why. */
type BranchTeam = { id: string; name: string };

type TransferStockFormValues = {
  ingredientId: string;
  quantity: string;
  reason: string;
  toBranchId: string;
};

/** Zod's `error.flatten()` shape, as sent by `ValidationError` in `src/server/errors.ts`. */
type FlattenedZodError = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

const FORM_FIELDS = ["ingredientId", "quantity", "reason", "toBranchId"] as const;

const EMPTY_DEFAULTS: TransferStockFormValues = {
  ingredientId: "",
  quantity: "",
  reason: "",
  toBranchId: "",
};

export type TransferStockDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function TransferStockDialog({ open, onClose }: TransferStockDialogProps) {
  const mutation = useTransferStockMutation();
  const { data: ingredientsData } = useIngredientsQuery({ limit: INGREDIENT_OPTIONS_LIMIT, offset: 0 });
  const ingredients = ingredientsData?.items ?? [];

  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const { data: orgData } = useActiveOrganization();
  const organization = orgData as (NonNullable<typeof orgData> & { teams: BranchTeam[] }) | null;
  // Can't transfer to the branch you're transferring from — the server
  // rejects this with a `ValidationError` on `toBranchId`, but filtering it
  // out of the dropdown is better UX than letting the user pick it first.
  const destinationBranches = (organization?.teams ?? []).filter((team) => team.id !== activeBranchId);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TransferStockFormValues>({ defaultValues: EMPTY_DEFAULTS });

  useEffect(() => {
    if (open) reset(EMPTY_DEFAULTS);
  }, [open, reset]);

  function applyFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0 && (FORM_FIELDS as readonly string[]).includes(field)) {
        setError(field as keyof TransferStockFormValues, { message: messages[0] });
      }
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const input = {
      ingredientId: values.ingredientId,
      quantity: Number(values.quantity),
      reason: values.reason,
      toBranchId: values.toBranchId,
    };

    const parsed = transferStockSchema.safeParse(input);
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
      <DialogTitle>Transfer stock</DialogTitle>
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
              {...register("quantity")}
              label="Quantity"
              type="number"
              error={!!errors.quantity}
              helperText={errors.quantity?.message}
              disabled={isSubmitting}
              fullWidth
              required
            />
            <Controller
              name="toBranchId"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={!!errors.toBranchId} disabled={isSubmitting} required>
                  <InputLabel id="transfer-to-branch-label">Destination branch</InputLabel>
                  <Select
                    labelId="transfer-to-branch-label"
                    label="Destination branch"
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                  >
                    {destinationBranches.map((team) => (
                      <MenuItem key={team.id} value={team.id}>
                        {team.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.toBranchId?.message && <FormHelperText>{errors.toBranchId.message}</FormHelperText>}
                </FormControl>
              )}
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
            Transfer
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}
