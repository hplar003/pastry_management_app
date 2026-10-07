import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { listMovementsQuerySchema } from "@/features/inventory/schemas";
import * as service from "@/features/inventory/server/service";

export const GET = withAuth(
  { permission: { inventory: ["read"] }, branchScoped: true },
  async (req, ctx) => {
    const url = new URL(req.url);
    const parsed = listMovementsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const result = await service.listMovements(ctx, parsed.data);
    return Response.json(result);
  },
);
