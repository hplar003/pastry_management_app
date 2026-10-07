"use client";

import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { getApiErrorMessage, ApiError } from "@/lib/api-client";
import { createRecipeSchema, updateRecipeSchema } from "@/features/recipes/schemas";
import type { CreateRecipeInput, UpdateRecipeInput } from "@/features/recipes/schemas";
import type { RecipeWithIngredients } from "@/features/recipes/api";
import {
  useCreateRecipeMutation,
  useRecipeQuery,
  useUpdateRecipeMutation,
} from "@/features/recipes/hooks/use-recipes";
// Cross-feature read, same pattern `IngredientFormDialog`/`AdjustStockDialog`
// use for their own Supplier/Ingredient `Autocomplete`s — the recipes
// feature has no reason to duplicate the ingredients query.
import { useIngredientsQuery } from "@/features/inventory/hooks/use-ingredients";
import type { Ingredient } from "@/features/inventory/api";

/**
 * Generous page size instead of building pagination into the Autocomplete —
 * same known limitation as `IngredientFormDialog`'s `SUPPLIER_OPTIONS_LIMIT`
 * and `AdjustStockDialog`'s `INGREDIENT_OPTIONS_LIMIT`: if the ingredient
 * catalog ever grows past one page, this Autocomplete silently won't show
 * the rest; revisit with real pagination-in-autocomplete then, not now.
 */
const INGREDIENT_OPTIONS_LIMIT = 100;

type IngredientRowValues = {
  ingredientId: string;
  quantity: string;
};

/**
 * Same reasoning as `IngredientFormDialog`/`SupplierFormDialog` (see their
 * doc comments): plain, possibly-empty strings for every scalar field
 * because MUI inputs need controlled string values, while
 * `createRecipeSchema`/`updateRecipeSchema`'s optional `description` rejects
 * `""` outright. `toSubmitInput` normalizes blanks to `undefined` before the
 * real schema runs. `yieldQuantity` and each row's `quantity` are also kept
 * as strings here (round-tripping the Decimal-as-string values the API
 * returns) and converted with `Number(...)` only in `toSubmitInput`.
 */
type RecipeFormValues = {
  name: string;
  description: string;
  yieldQuantity: string;
  yieldUnit: string;
  ingredients: IngredientRowValues[];
};

/** Zod's `error.flatten()` shape, as sent by `ValidationError` in `src/server/errors.ts`. */
type FlattenedZodError = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

const FORM_FIELDS = ["name", "description", "yieldQuantity", "yieldUnit", "ingredients"] as const;

const EMPTY_ROW: IngredientRowValues = { ingredientId: "", quantity: "" };

function toFormDefaults(recipe?: RecipeWithIngredients): RecipeFormValues {
  return {
    name: recipe?.name ?? "",
    description: recipe?.description ?? "",
    yieldQuantity: recipe?.yieldQuantity ?? "",
    yieldUnit: recipe?.yieldUnit ?? "",
    ingredients:
      recipe && recipe.ingredients.length > 0
        ? recipe.ingredients.map((i) => ({ ingredientId: i.ingredientId, quantity: i.quantity }))
        : [{ ...EMPTY_ROW }],
  };
}

function hasDuplicateIngredientIds(rows: IngredientRowValues[]): boolean {
  const ids = rows.map((r) => r.ingredientId).filter((id) => id !== "");
  return new Set(ids).size !== ids.length;
}

/**
 * Builds the request body from the field array's CURRENT rows — always the
 * full set, since `toFormDefaults` pre-populates every existing line item in
 * edit mode and `useFieldArray` keeps untouched rows in form state
 * unchanged. This is the one correctness requirement of this form:
 * `updateRecipeSchema`'s `ingredients`, when present, REPLACES the recipe's
 * entire line-item list server-side (never a partial patch), so submitting
 * anything less than every current row would silently delete the rest.
 */
function toSubmitInput(values: RecipeFormValues): CreateRecipeInput | UpdateRecipeInput {
  const description = values.description.trim();
  return {
    name: values.name,
    description: description === "" ? undefined : description,
    yieldQuantity: Number(values.yieldQuantity),
    yieldUnit: values.yieldUnit,
    ingredients: values.ingredients.map((row) => ({
      ingredientId: row.ingredientId,
      quantity: Number(row.quantity),
    })),
  };
}

export type RecipeFormDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Omit for create mode; pass an id for edit mode — the full recipe (with its ingredient list) is fetched here. */
  recipeId?: string;
};

export function RecipeFormDialog({ open, onClose, recipeId }: RecipeFormDialogProps) {
  const isEditMode = !!recipeId;
  const createMutation = useCreateRecipeMutation();
  const updateMutation = useUpdateRecipeMutation();
  const mutation = isEditMode ? updateMutation : createMutation;

  // `GET /recipes` (the list) is scalars-only — no nested `ingredients` — so
  // edit mode fetches the single recipe here to get its full, current line
  // items to pre-populate the field array with.
  const { data: recipe, isLoading: isLoadingRecipe } = useRecipeQuery(recipeId ?? "");
  const formReady = !isEditMode || !!recipe;

  const { data: ingredientsData } = useIngredientsQuery({ limit: INGREDIENT_OPTIONS_LIMIT, offset: 0 });
  const ingredients = ingredientsData?.items ?? [];

  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RecipeFormValues>({
    defaultValues: toFormDefaults(),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "ingredients" });

  // Re-seed the form whenever the dialog opens (create vs. edit, or a
  // different recipe) instead of carrying over whatever was last typed. In
  // edit mode, wait for the full recipe (with ingredients) to arrive before
  // resetting, so the field array starts from the real current line items.
  useEffect(() => {
    if (!open) return;
    if (isEditMode && !recipe) return;
    reset(toFormDefaults(recipe));
  }, [open, isEditMode, recipe, reset]);

  function applyFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages && messages.length > 0 && (FORM_FIELDS as readonly string[]).includes(field)) {
        setError(field as keyof RecipeFormValues, { message: messages[0] });
      }
    }
  }

  const ingredientsArrayError = errors.ingredients as unknown as { message?: string } | undefined;

  const onSubmit = handleSubmit(async (values) => {
    if (hasDuplicateIngredientIds(values.ingredients)) {
      setError("ingredients", {
        type: "manual",
        message: "Each ingredient can only appear once in a recipe.",
      });
      return;
    }

    const input = toSubmitInput(values);

    if (isEditMode) {
      const parsed = updateRecipeSchema.safeParse(input);
      if (!parsed.success) {
        applyFieldErrors(parsed.error.flatten().fieldErrors);
        return;
      }
      try {
        await updateMutation.mutateAsync({ id: recipeId, input: parsed.data });
        onClose();
      } catch (err) {
        if (err instanceof ApiError && err.code === "VALIDATION" && err.details) {
          applyFieldErrors((err.details as FlattenedZodError).fieldErrors);
        }
        // Otherwise swallow — the Alert below reads `mutation.error` directly.
      }
      return;
    }

    const parsed = createRecipeSchema.safeParse(input);
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
      <DialogTitle>{isEditMode ? "Edit recipe" : "New recipe"}</DialogTitle>
      {!formReady ? (
        <DialogContent>
          <Stack sx={{ alignItems: "center", py: 4 }}>
            <CircularProgress size={28} data-testid={isLoadingRecipe ? "loading-recipe" : undefined} />
          </Stack>
        </DialogContent>
      ) : (
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
                {...register("description")}
                label="Description"
                error={!!errors.description}
                helperText={errors.description?.message}
                disabled={isSubmitting}
                fullWidth
                multiline
                minRows={2}
              />
              <Stack direction="row" spacing={2}>
                <TextField
                  {...register("yieldQuantity")}
                  label="Yield quantity"
                  type="number"
                  error={!!errors.yieldQuantity}
                  helperText={errors.yieldQuantity?.message}
                  disabled={isSubmitting}
                  fullWidth
                  required
                />
                <TextField
                  {...register("yieldUnit")}
                  label="Yield unit"
                  placeholder="e.g. pcs, kg"
                  error={!!errors.yieldUnit}
                  helperText={errors.yieldUnit?.message}
                  disabled={isSubmitting}
                  fullWidth
                  required
                />
              </Stack>

              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Ingredients
                </Typography>
                <Stack spacing={1.5}>
                  {fields.map((field, index) => (
                    <Stack key={field.id} direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                      <Controller
                        name={`ingredients.${index}.ingredientId`}
                        control={control}
                        render={({ field: rhfField }) => (
                          <Autocomplete
                            sx={{ flex: 1 }}
                            options={ingredients}
                            getOptionLabel={(i: Ingredient) => i.name}
                            isOptionEqualToValue={(option: Ingredient, value: Ingredient) => option.id === value.id}
                            value={ingredients.find((i) => i.id === rhfField.value) ?? null}
                            onChange={(_event, value) => rhfField.onChange(value ? value.id : "")}
                            disabled={isSubmitting}
                            renderInput={(params) => (
                              <TextField {...params} label={`Ingredient ${index + 1}`} required />
                            )}
                          />
                        )}
                      />
                      <TextField
                        {...register(`ingredients.${index}.quantity`)}
                        label="Quantity"
                        type="number"
                        sx={{ width: 140 }}
                        disabled={isSubmitting}
                        required
                      />
                      <IconButton
                        aria-label={`Remove ingredient row ${index + 1}`}
                        onClick={() => remove(index)}
                        disabled={isSubmitting || fields.length <= 1}
                        sx={{ mt: 1 }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ))}
                </Stack>

                {ingredientsArrayError?.message && (
                  <Alert severity="error" sx={{ mt: 1.5 }}>
                    {ingredientsArrayError.message}
                  </Alert>
                )}

                <Button
                  startIcon={<AddIcon />}
                  onClick={() => append({ ...EMPTY_ROW })}
                  disabled={isSubmitting}
                  sx={{ mt: 1.5 }}
                >
                  Add ingredient
                </Button>
              </Box>
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
              {isEditMode ? "Save changes" : "Create recipe"}
            </Button>
          </DialogActions>
        </Stack>
      )}
    </Dialog>
  );
}
