import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { adjustStockSchema } from "@/features/inventory/schemas";
import * as service from "@/features/inventory/server/service";

export const POST = withAuth(
  { permission: { inventory: ["adjust"] }, branchScoped: true },
  async (req, ctx) => {
    const body = await req.json();
    const parsed = adjustStockSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const movement = await service.adjustStock(ctx, parsed.data);
    return Response.json(movement, { status: 201 });
  },
);
