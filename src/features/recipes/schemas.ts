import { z } from "zod";

const recipeIngredientInputSchema = z
  .object({
    ingredientId: z.string().min(1),
    quantity: z.number().positive(),
  })
  .strict();

function hasNoDuplicateIngredientIds(ingredients: { ingredientId: string }[]) {
  return new Set(ingredients.map((i) => i.ingredientId)).size === ingredients.length;
}

export const createRecipeSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000).optional(),
    yieldQuantity: z.number().positive(),
    yieldUnit: z.string().trim().min(1).max(20),
    ingredients: z.array(recipeIngredientInputSchema).min(1),
  })
  .strict()
  .refine((data) => hasNoDuplicateIngredientIds(data.ingredients), {
    message: "ingredients must not list the same ingredientId more than once",
    path: ["ingredients"],
  });

/**
 * `ingredients`, when present, REPLACES the recipe's full line-item list with
 * exactly this set — it is not a merge/patch of individual items. Omitting
 * `ingredients` entirely leaves the existing line items untouched; there is
 * no way to add/remove/edit a single line item without resending the whole
 * list.
 */
export const updateRecipeSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    yieldQuantity: z.number().positive().optional(),
    yieldUnit: z.string().trim().min(1).max(20).optional(),
    ingredients: z.array(recipeIngredientInputSchema).min(1).optional(),
  })
  .strict()
  .refine(
    (data) => data.ingredients === undefined || hasNoDuplicateIngredientIds(data.ingredients),
    {
      message: "ingredients must not list the same ingredientId more than once",
      path: ["ingredients"],
    },
  );

export const listRecipesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export type CreateRecipeInput = z.infer<typeof createRecipeSchema>;
export type UpdateRecipeInput = z.infer<typeof updateRecipeSchema>;
export type ListRecipesQuery = z.infer<typeof listRecipesQuerySchema>;
