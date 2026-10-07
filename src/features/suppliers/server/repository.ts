import "server-only";

import type { RequestCtx } from "@/server/http/with-auth";
import type { CreateSupplierInput, UpdateSupplierInput } from "@/features/suppliers/schemas";
import { Prisma } from "@/generated/prisma/client";

type Db = RequestCtx["db"];

/**
 * `Prisma.SupplierUncheckedCreateInput` requires `organizationId`, but that
 * value is never supplied by callers — `forTenant` (src/server/db.ts) injects
 * it at runtime into `args.data` before the query reaches Prisma. This type
 * removes just that one field from the requirement so the rest of `data` is
 * still fully checked against the generated input type.
 */
type SupplierCreateData = Omit<Prisma.SupplierUncheckedCreateInput, "organizationId">;

/** Fields safe to return to the client — never `organizationId` or `deletedAt` (internal only). */
const SUPPLIER_SELECT = {
  id: true,
  name: true,
  contactName: true,
  email: true,
  phone: true,
  address: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function create(db: Db, data: CreateSupplierInput) {
  return db.supplier.create({
    // `satisfies` checks every field of `data` against `SupplierCreateData`
    // (the generated input type minus the runtime-injected `organizationId`),
    // then the cast only widens back to the full generated type so this call
    // type-checks — unlike a blanket `as never`, a typo'd or wrong-typed
    // field still fails here.
    data: (data satisfies SupplierCreateData) as Prisma.SupplierUncheckedCreateInput,
    select: SUPPLIER_SELECT,
  });
}

export async function findMany(db: Db, { limit, offset }: { limit: number; offset: number }) {
  const [items, total] = await Promise.all([
    db.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: SUPPLIER_SELECT,
    }),
    db.supplier.count({ where: { deletedAt: null } }),
  ]);
  return { items, total };
}

export async function findById(db: Db, id: string) {
  return db.supplier.findFirst({
    where: { id, deletedAt: null },
    select: SUPPLIER_SELECT,
  });
}

export async function update(db: Db, id: string, data: UpdateSupplierInput) {
  return db.supplier.update({
    where: { id },
    data,
    select: SUPPLIER_SELECT,
  });
}

export async function softDelete(db: Db, id: string) {
  return db.supplier.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: SUPPLIER_SELECT,
  });
}
