import "server-only";

import type { RequestCtx } from "@/server/http/with-auth";
import { Prisma } from "@/generated/prisma/client";

type Db = RequestCtx["db"];

/**
 * `Prisma.RecipeUncheckedCreateInput` requires `organizationId`, but that
 * value is never supplied by callers — `forTenant` (src/server/db.ts)
 * injects it at runtime into `args.data` before the query reaches Prisma.
 * This type removes just that one field from the requirement so the rest of
 * `data` is still fully checked against the generated input type (same
 * `satisfies`-based narrow-cast pattern as Task 4/5 — a blanket `as never`
 * cast was rejected in an earlier task).
 */
type RecipeCreateData = Omit<Prisma.RecipeUncheckedCreateInput, "organizationId">;

/** Fields safe to return to the client — never `organizationId` or `deletedAt` (internal only). */
const RECIPE_SELECT = {
  id: true,
  name: true,
  description: true,
  yieldQuantity: true,
  yieldUnit: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Nested select for a recipe's line items — gives the caller the
 * ingredient's name/unit inline (via the `ingredient` relation) rather than
 * just its id, so no client-side join is needed.
 */
const RECIPE_INGREDIENT_SELECT = {
  id: true,
  ingredientId: true,
  quantity: true,
  ingredient: {
    select: { name: true, unit: true },
  },
} as const;

export async function createRecipe(db: Db, data: RecipeCreateData) {
  return db.recipe.create({
    // `satisfies` checks every field of `data` against `RecipeCreateData`
    // (the generated input type minus the runtime-injected
    // `organizationId`), then the cast only widens back to the full
    // generated type so this call type-checks.
    data: (data satisfies RecipeCreateData) as Prisma.RecipeUncheckedCreateInput,
    select: RECIPE_SELECT,
  });
}

export async function findManyRecipes(
  db: Db,
  { limit, offset }: { limit: number; offset: number },
) {
  const [items, total] = await Promise.all([
    db.recipe.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: RECIPE_SELECT,
    }),
    db.recipe.count({ where: { deletedAt: null } }),
  ]);
  return { items, total };
}

export async function findRecipeById(db: Db, id: string) {
  return db.recipe.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...RECIPE_SELECT,
      recipeIngredients: { select: RECIPE_INGREDIENT_SELECT },
    },
  });
}

export async function softDeleteRecipe(db: Db, id: string) {
  return db.recipe.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: RECIPE_SELECT,
  });
}
