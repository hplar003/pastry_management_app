import "server-only";

import type { RequestCtx } from "@/server/http/with-auth";
import { NotFoundError } from "@/server/errors";
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  UpdateSupplierInput,
} from "@/features/suppliers/schemas";
import * as repository from "@/features/suppliers/server/repository";

export async function createSupplier(ctx: RequestCtx, input: CreateSupplierInput) {
  return repository.create(ctx.db, input);
}

export async function listSuppliers(ctx: RequestCtx, query: ListSuppliersQuery) {
  const { limit, offset } = query;
  const { items, total } = await repository.findMany(ctx.db, { limit, offset });
  return { items, total, limit, offset };
}

export async function getSupplier(ctx: RequestCtx, id: string) {
  const existing = await repository.findById(ctx.db, id);
  if (!existing) throw new NotFoundError();
  return existing;
}

export async function updateSupplier(ctx: RequestCtx, id: string, input: UpdateSupplierInput) {
  const existing = await repository.findById(ctx.db, id);
  if (!existing) throw new NotFoundError();
  return repository.update(ctx.db, id, input);
}

export async function deleteSupplier(ctx: RequestCtx, id: string) {
  const existing = await repository.findById(ctx.db, id);
  if (!existing) throw new NotFoundError();
  await repository.softDelete(ctx.db, id);
}
