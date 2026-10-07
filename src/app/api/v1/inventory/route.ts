import { withAuth } from "@/server/http/with-auth";
import * as service from "@/features/inventory/server/service";

export const GET = withAuth(
  { permission: { inventory: ["read"] }, branchScoped: true },
  async (_req, ctx) => {
    const stock = await service.listCurrentStock(ctx);
    return Response.json(stock);
  },
);
