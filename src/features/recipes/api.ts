import { apiFetch } from "@/lib/api-client";
import type {
  CreateRecipeInput,
  ListRecipesQuery,
  UpdateRecipeInput,
} from "@/features/recipes/schemas";

/**
 * One line item of a recipe's ingredient list, as returned nested under
 * `ingredients` by `GET/POST/PATCH /recipes/[id]` (`service.ts`'s
 * `toRecipeDto` renames Prisma's `recipeIngredients` relation to
 * `ingredients`). `quantity` is a Prisma `Decimal` server-side, which
 * serializes to a JSON string (decimal.js's `toJSON`/`valueOf`), not a
 * `number` — convert with `Number(...)` before round-tripping it into a
 * request body, never string-compare/sort it.
 */
export type RecipeIngredientLine = {
  id: string;
  ingredientId: string;
  quantity: string;
  ingredient: { name: string; unit: string };
};

/**
 * Client-side mirror of `RECIPE_SELECT` in
 * `src/features/recipes/server/repository.ts` — the scalar fields every
 * route in `src/app/api/v1/recipes/**` returns. `yieldQuantity` is a Prisma
 * `Decimal`, serialized as a JSON string — same caveat as
 * `RecipeIngredientLine.quantity` above. The LIST endpoint
 * (`GET /recipes`) returns only these scalar fields — no nested
 * `ingredients` (confirmed in `repository.findManyRecipes`'s `select`,
 * which is `RECIPE_SELECT` alone; only `findRecipeById` adds the
 * `recipeIngredients` relation). Use `RecipeWithIngredients` for
 * `GET/POST/PATCH /recipes/[id]`, which do include the nested list.
 */
export type Recipe = {
  id: string;
  name: string;
  description: string | null;
  yieldQuantity: string;
  yieldUnit: string;
  createdAt: string;
  updatedAt: string;
};

export type RecipeWithIngredients = Recipe & {
  ingredients: RecipeIngredientLine[];
};

export type ListRecipesResult = {
  items: Recipe[];
  total: number;
  limit: number;
  offset: number;
};

export async function listRecipes(params: ListRecipesQuery): Promise<ListRecipesResult> {
  return apiFetch("/recipes", { query: params });
}

export async function getRecipe(id: string): Promise<RecipeWithIngredients> {
  return apiFetch(`/recipes/${id}`);
}

export async function createRecipe(input: CreateRecipeInput): Promise<RecipeWithIngredients> {
  return apiFetch("/recipes", { method: "POST", body: input });
}

export async function updateRecipe(
  id: string,
  input: UpdateRecipeInput,
): Promise<RecipeWithIngredients> {
  return apiFetch(`/recipes/${id}`, { method: "PATCH", body: input });
}

export async function deleteRecipe(id: string): Promise<void> {
  return apiFetch(`/recipes/${id}`, { method: "DELETE" });
}
