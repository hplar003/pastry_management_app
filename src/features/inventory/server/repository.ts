import "server-only";

import type { RequestCtx } from "@/server/http/with-auth";
import type { CreateIngredientInput, UpdateIngredientInput } from "@/features/inventory/schemas";
import { Prisma } from "@/generated/prisma/client";

type Db = RequestCtx["db"];

/**
 * `Prisma.IngredientUncheckedCreateInput` requires `organizationId`, but that
 * value is never supplied by callers — `forTenant` (src/server/db.ts) injects
 * it at runtime into `args.data` before the query reaches Prisma. This type
 * removes just that one field from the requirement so the rest of `data` is
 * still fully checked against the generated input type (see
 * `src/features/suppliers/server/repository.ts`'s `create()` for the
 * precedent — a blanket `as never` cast was rejected in an earlier task).
 */
type IngredientCreateData = Omit<Prisma.IngredientUncheckedCreateInput, "organizationId">;

/** Fields safe to return to the client — never `organizationId` or `deletedAt` (internal only). */
const INGREDIENT_SELECT = {
  id: true,
  name: true,
  unit: true,
  reorderThreshold: true,
  supplierId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Fields safe to return for a stock movement — never `organizationId`. */
const MOVEMENT_SELECT = {
  id: true,
  ingredientId: true,
  type: true,
  qty: true,
  reason: true,
  actorId: true,
  createdAt: true,
} as const;

export async function createIngredient(db: Db, data: CreateIngredientInput) {
  return db.ingredient.create({
    // `satisfies` checks every field of `data` against `IngredientCreateData`
    // (the generated input type minus the runtime-injected `organizationId`),
    // then the cast only widens back to the full generated type so this call
    // type-checks — unlike a blanket `as never`, a typo'd or wrong-typed
    // field still fails here.
    data: (data satisfies IngredientCreateData) as Prisma.IngredientUncheckedCreateInput,
    select: INGREDIENT_SELECT,
  });
}

export async function findManyIngredients(
  db: Db,
  { limit, offset }: { limit: number; offset: number },
) {
  const [items, total] = await Promise.all([
    db.ingredient.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: INGREDIENT_SELECT,
    }),
    db.ingredient.count({ where: { deletedAt: null } }),
  ]);
  return { items, total };
}

export async function findIngredientById(db: Db, id: string) {
  return db.ingredient.findFirst({
    where: { id, deletedAt: null },
    select: INGREDIENT_SELECT,
  });
}

export async function updateIngredient(db: Db, id: string, data: UpdateIngredientInput) {
  return db.ingredient.update({
    where: { id },
    data,
    select: INGREDIENT_SELECT,
  });
}

export async function softDeleteIngredient(db: Db, id: string) {
  return db.ingredient.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: INGREDIENT_SELECT,
  });
}

/**
 * Current stock per ingredient, derived from `StockMovement` — never stored.
 * Two-query merge: every non-deleted ingredient (so ones with zero movements
 * still show up with quantity 0), plus the per-ingredient sum of signed `qty`
 * for this branch. No single Prisma call does both at once.
 */
export async function listCurrentStock(db: Db, branchId: string) {
  const [ingredients, sums] = await Promise.all([
    db.ingredient.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    db.stockMovement.groupBy({
      by: ["ingredientId"],
      where: { branchId },
      _sum: { qty: true },
    }),
  ]);
  const byIngredient = new Map(sums.map((s) => [s.ingredientId, s._sum.qty]));
  return ingredients.map((ing) => ({
    ...ing,
    quantity: byIngredient.get(ing.id) ?? new Prisma.Decimal(0),
  }));
}

export async function listMovements(
  db: Db,
  {
    branchId,
    ingredientId,
    limit,
    offset,
  }: { branchId: string; ingredientId?: string; limit: number; offset: number },
) {
  const where = { branchId, ...(ingredientId ? { ingredientId } : {}) };
  const [items, total] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: MOVEMENT_SELECT,
    }),
    db.stockMovement.count({ where }),
  ]);
  return { items, total };
}
