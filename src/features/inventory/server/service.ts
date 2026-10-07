import "server-only";

import type { RequestCtx } from "@/server/http/with-auth";
import { AppError, NotFoundError, ValidationError } from "@/server/errors";
import { db, withTenantTx } from "@/server/db";
import type {
  AdjustStockInput,
  CreateIngredientInput,
  ListIngredientsQuery,
  ListMovementsQuery,
  TransferStockInput,
  UpdateIngredientInput,
} from "@/features/inventory/schemas";
import * as repository from "@/features/inventory/server/repository";

/**
 * Verifies `supplierId` (when provided) refers to a real, non-soft-deleted
 * `Supplier` in this org before `createIngredient`/`updateIngredient` write
 * it. `ctx.db` is already org-scoped (forTenant), so no explicit
 * `organizationId` filter is needed here. A bad reference is a 400
 * (ValidationError) — it's a malformed input, not a missing resource.
 */
async function assertSupplierExists(ctx: RequestCtx, supplierId: string) {
  const supplier = await ctx.db.supplier.findFirst({
    where: { id: supplierId, deletedAt: null },
    select: { id: true },
  });
  if (!supplier) {
    throw new ValidationError({ supplierId: "does not exist" });
  }
}

// --- Ingredient catalog ---

export async function createIngredient(ctx: RequestCtx, input: CreateIngredientInput) {
  if (input.supplierId) {
    await assertSupplierExists(ctx, input.supplierId);
  }
  return repository.createIngredient(ctx.db, input);
}

export async function listIngredients(ctx: RequestCtx, query: ListIngredientsQuery) {
  const { limit, offset } = query;
  const { items, total } = await repository.findManyIngredients(ctx.db, { limit, offset });
  return { items, total, limit, offset };
}

export async function getIngredient(ctx: RequestCtx, id: string) {
  const existing = await repository.findIngredientById(ctx.db, id);
  if (!existing) throw new NotFoundError();
  return existing;
}

export async function updateIngredient(
  ctx: RequestCtx,
  id: string,
  input: UpdateIngredientInput,
) {
  const existing = await repository.findIngredientById(ctx.db, id);
  if (!existing) throw new NotFoundError();
  if (input.supplierId) {
    await assertSupplierExists(ctx, input.supplierId);
  }
  return repository.updateIngredient(ctx.db, id, input);
}

export async function deleteIngredient(ctx: RequestCtx, id: string) {
  const existing = await repository.findIngredientById(ctx.db, id);
  if (!existing) throw new NotFoundError();
  await repository.softDeleteIngredient(ctx.db, id);
}

// --- Stock ledger ---

export async function listCurrentStock(ctx: RequestCtx) {
  if (!ctx.branchId) throw new AppError("BRANCH_REQUIRED", 400);
  return repository.listCurrentStock(ctx.db, ctx.branchId);
}

export async function listMovements(ctx: RequestCtx, query: ListMovementsQuery) {
  if (!ctx.branchId) throw new AppError("BRANCH_REQUIRED", 400);
  const { limit, offset, ingredientId } = query;
  const { items, total } = await repository.listMovements(ctx.db, {
    branchId: ctx.branchId,
    ingredientId,
    limit,
    offset,
  });
  return { items, total, limit, offset };
}

/**
 * The first real `withTenantTx` consumer (security plan G1): the
 * `StockMovement` row and its `AuditLog` row must commit or roll back
 * together, which `ctx.db`/`forTenant` cannot guarantee across two
 * statements (see the "Known limitation" comment in `src/server/db.ts`).
 */
export async function adjustStock(ctx: RequestCtx, input: AdjustStockInput) {
  if (!ctx.branchId) throw new AppError("BRANCH_REQUIRED", 400);
  const { ingredientId, qty, reason } = input;

  // Existence check is a plain read — doesn't need to be inside the transaction.
  const ingredient = await repository.findIngredientById(ctx.db, ingredientId);
  if (!ingredient) {
    throw new ValidationError({ ingredientId: "does not exist" });
  }

  const branchId = ctx.branchId;
  return withTenantTx(ctx, async (tx) => {
    const movement = await tx.stockMovement.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        ingredientId,
        type: "ADJUSTMENT",
        qty,
        reason,
        actorId: ctx.userId,
      },
      select: {
        id: true,
        ingredientId: true,
        type: true,
        qty: true,
        reason: true,
        actorId: true,
        createdAt: true,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        branchId,
        actorId: ctx.userId,
        action: "inventory.adjust",
        entity: "StockMovement",
        entityId: movement.id,
        after: movement,
        requestId: ctx.requestId,
      },
    });
    return movement;
  });
}

/**
 * Moves stock between branches by writing two opposite-signed `StockMovement`
 * rows (direction comes from which row gets which branch, not from
 * `quantity`'s sign — `quantity` is always positive) plus one `AuditLog` row,
 * all three in the same `withTenantTx` transaction (G1).
 */
export async function transferStock(ctx: RequestCtx, input: TransferStockInput) {
  if (!ctx.branchId) throw new AppError("BRANCH_REQUIRED", 400);
  const { ingredientId, quantity, reason, toBranchId } = input;
  const fromBranchId = ctx.branchId;

  if (toBranchId === fromBranchId) {
    throw new ValidationError({ toBranchId: "cannot transfer to the same branch" });
  }

  const ingredient = await repository.findIngredientById(ctx.db, ingredientId);
  if (!ingredient) {
    throw new ValidationError({ ingredientId: "does not exist" });
  }

  // `Team` is a Better Auth table, not one of our RLS tenant models — query
  // the raw `db` export directly rather than `ctx.db` (there's no
  // `forTenant` scoping to rely on or need here).
  const toTeam = await db.team.findFirst({
    where: { id: toBranchId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  if (!toTeam) {
    throw new ValidationError({ toBranchId: "not a branch in this organization" });
  }

  const movementSelect = {
    id: true,
    ingredientId: true,
    type: true,
    qty: true,
    reason: true,
    actorId: true,
    createdAt: true,
  } as const;

  return withTenantTx(ctx, async (tx) => {
    const outMovement = await tx.stockMovement.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: fromBranchId,
        ingredientId,
        type: "TRANSFER_OUT",
        qty: -quantity,
        reason,
        actorId: ctx.userId,
      },
      select: movementSelect,
    });
    const inMovement = await tx.stockMovement.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: toBranchId,
        ingredientId,
        type: "TRANSFER_IN",
        qty: quantity,
        reason,
        actorId: ctx.userId,
      },
      select: movementSelect,
    });
    await tx.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: fromBranchId,
        actorId: ctx.userId,
        action: "inventory.transfer",
        entity: "StockMovement",
        entityId: outMovement.id,
        after: { out: outMovement, in: inMovement },
        requestId: ctx.requestId,
      },
    });
    return { out: outMovement, in: inMovement };
  });
}
