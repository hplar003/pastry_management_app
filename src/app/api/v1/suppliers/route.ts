import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { createSupplierSchema, listSuppliersQuerySchema } from "@/features/suppliers/schemas";
import * as service from "@/features/suppliers/server/service";

export const POST = withAuth({ permission: { supplier: ["create"] } }, async (req, ctx) => {
  const body = await req.json();
  const parsed = createSupplierSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const supplier = await service.createSupplier(ctx, parsed.data);
  return Response.json(supplier, { status: 201 });
});

export const GET = withAuth({ permission: { supplier: ["read"] } }, async (req, ctx) => {
  const url = new URL(req.url);
  const parsed = listSuppliersQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const result = await service.listSuppliers(ctx, parsed.data);
  return Response.json(result);
});
