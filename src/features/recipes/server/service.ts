import "server-only";

import type { RequestCtx } from "@/server/http/with-auth";
import { NotFoundError, ValidationError } from "@/server/errors";
import { withTenantTx } from "@/server/db";
import type {
  CreateRecipeInput,
  ListRecipesQuery,
  UpdateRecipeInput,
} from "@/features/recipes/schemas";
import * as repository from "@/features/recipes/server/repository";

/** Nested select for a recipe's line items, re-read inside the transaction (raw `tx`, not `ctx.db`). */
const LINE_ITEM_SELECT = {
  id: true,
  ingredientId: true,
  quantity: true,
  ingredient: {
    select: { name: true, unit: true },
  },
} as const;

/**
 * Verifies every `ingredientId` in `ingredients` refers to a real,
 * non-soft-deleted `Ingredient` in this org — one query, comparing the
 * returned count against the unique id count from the input. A mismatch is
 * a 400 (ValidationError) — it's a malformed input, not a missing resource.
 */
async function assertIngredientsExist(
  ctx: RequestCtx,
  ingredients: { ingredientId: string }[],
) {
  const ids = [...new Set(ingredients.map((i) => i.ingredientId))];
  const found = await ctx.db.ingredient.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new ValidationError({ ingredients: "one or more ingredientId values do not exist" });
  }
}

function toRecipeDto<T extends { recipeIngredients: unknown }>(recipe: T) {
  const { recipeIngredients, ...rest } = recipe;
  return { ...rest, ingredients: recipeIngredients };
}

export async function listRecipes(ctx: RequestCtx, query: ListRecipesQuery) {
  const { limit, offset } = query;
  const { items, total } = await repository.findManyRecipes(ctx.db, { limit, offset });
  return { items, total, limit, offset };
}

export async function getRecipe(ctx: RequestCtx, id: string) {
  const existing = await repository.findRecipeById(ctx.db, id);
  if (!existing) throw new NotFoundError();
  return toRecipeDto(existing);
}

export async function deleteRecipe(ctx: RequestCtx, id: string) {
  const existing = await repository.findRecipeById(ctx.db, id);
  if (!existing) throw new NotFoundError();
  await repository.softDeleteRecipe(ctx.db, id);
}

/**
 * Creates a `Recipe` plus its `RecipeIngredient` line items atomically.
 * Ingredient-existence validation is a plain read, so it runs OUTSIDE the
 * transaction. The write itself — the `Recipe` row, then
 * `recipeIngredient.createMany` for all line items, then a re-read of the
 * created line items so the DTO includes ingredient names/units — happens
 * inside ONE `withTenantTx`, using `tx` directly rather than
 * `repository.ts` (whose functions are typed against `ctx.db`'s extended
 * client, not the raw transaction client). Mirrors Task 5's
 * `adjustStock`/`transferStock`.
 */
export async function createRecipe(ctx: RequestCtx, input: CreateRecipeInput) {
  await assertIngredientsExist(ctx, input.ingredients);

  const { name, description, yieldQuantity, yieldUnit, ingredients } = input;

  return withTenantTx(ctx, async (tx) => {
    const recipe = await tx.recipe.create({
      data: {
        organizationId: ctx.organizationId,
        name,
        description,
        yieldQuantity,
        yieldUnit,
      },
      select: {
        id: true,
        name: true,
        description: true,
        yieldQuantity: true,
        yieldUnit: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await tx.recipeIngredient.createMany({
      data: ingredients.map((i) => ({
        organizationId: ctx.organizationId,
        recipeId: recipe.id,
        ingredientId: i.ingredientId,
        quantity: i.quantity,
      })),
    });

    const lineItems = await tx.recipeIngredient.findMany({
      where: { recipeId: recipe.id },
      select: LINE_ITEM_SELECT,
    });

    return { ...recipe, ingredients: lineItems };
  });
}

/**
 * Updates a `Recipe`'s scalar fields and, only when `input.ingredients` is
 * provided, REPLACES its full `RecipeIngredient` line-item list (delete all,
 * then recreate) — never a partial patch of individual items. If
 * `ingredients` wasn't in the input, `RecipeIngredient` isn't touched at
 * all. Both the scalar update and the (conditional) line-item replacement
 * happen inside ONE `withTenantTx`, using `tx` directly (same split as
 * `createRecipe`/Task 5). The current line items are re-read and returned
 * either way, so the response always reflects true current state.
 */
export async function updateRecipe(ctx: RequestCtx, id: string, input: UpdateRecipeInput) {
  const existing = await repository.findRecipeById(ctx.db, id);
  if (!existing) throw new NotFoundError();

  if (input.ingredients) {
    await assertIngredientsExist(ctx, input.ingredients);
  }

  const { name, description, yieldQuantity, yieldUnit, ingredients } = input;
  const scalarData: Record<string, unknown> = {};
  if (name !== undefined) scalarData.name = name;
  if (description !== undefined) scalarData.description = description;
  if (yieldQuantity !== undefined) scalarData.yieldQuantity = yieldQuantity;
  if (yieldUnit !== undefined) scalarData.yieldUnit = yieldUnit;

  return withTenantTx(ctx, async (tx) => {
    const recipe = await tx.recipe.update({
      // organizationId here is defense-in-depth, not the only guard: the
      // existence check above already confirmed `id` belongs to this org via
      // ctx.db (forTenant-scoped), and RLS's USING clause would reject a
      // cross-org id regardless — but stating it here makes the invariant
      // self-evident at the call site instead of resting on those alone.
      where: { id, organizationId: ctx.organizationId },
      data: scalarData,
      select: {
        id: true,
        name: true,
        description: true,
        yieldQuantity: true,
        yieldUnit: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (ingredients) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id, organizationId: ctx.organizationId } });
      await tx.recipeIngredient.createMany({
        data: ingredients.map((i) => ({
          organizationId: ctx.organizationId,
          recipeId: id,
          ingredientId: i.ingredientId,
          quantity: i.quantity,
        })),
      });
    }

    const lineItems = await tx.recipeIngredient.findMany({
      where: { recipeId: id },
      select: LINE_ITEM_SELECT,
    });

    return { ...recipe, ingredients: lineItems };
  });
}
