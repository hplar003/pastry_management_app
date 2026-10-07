import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { transferStockSchema } from "@/features/inventory/schemas";
import * as service from "@/features/inventory/server/service";

export const POST = withAuth(
  { permission: { inventory: ["transfer"] }, branchScoped: true },
  async (req, ctx) => {
    const body = await req.json();
    const parsed = transferStockSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const result = await service.transferStock(ctx, parsed.data);
    return Response.json(result, { status: 201 });
  },
);
