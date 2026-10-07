import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { updateSupplierSchema } from "@/features/suppliers/schemas";
import * as service from "@/features/suppliers/server/service";

export const GET = withAuth<{ id: string }>(
  { permission: { supplier: ["read"] } },
  async (_req, ctx, { id }) => {
    const supplier = await service.getSupplier(ctx, id);
    return Response.json(supplier);
  },
);

export const PATCH = withAuth<{ id: string }>(
  { permission: { supplier: ["update"] } },
  async (req, ctx, { id }) => {
    const body = await req.json();
    const parsed = updateSupplierSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const supplier = await service.updateSupplier(ctx, id, parsed.data);
    return Response.json(supplier);
  },
);

export const DELETE = withAuth<{ id: string }>(
  { permission: { supplier: ["delete"] } },
  async (_req, ctx, { id }) => {
    await service.deleteSupplier(ctx, id);
    return new Response(null, { status: 204 });
  },
);
