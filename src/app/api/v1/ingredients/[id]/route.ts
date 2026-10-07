import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { updateIngredientSchema } from "@/features/inventory/schemas";
import * as service from "@/features/inventory/server/service";

export const GET = withAuth<{ id: string }>(
  { permission: { ingredient: ["read"] } },
  async (_req, ctx, { id }) => {
    const ingredient = await service.getIngredient(ctx, id);
    return Response.json(ingredient);
  },
);

export const PATCH = withAuth<{ id: string }>(
  { permission: { ingredient: ["update"] } },
  async (req, ctx, { id }) => {
    const body = await req.json();
    const parsed = updateIngredientSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const ingredient = await service.updateIngredient(ctx, id, parsed.data);
    return Response.json(ingredient);
  },
);

export const DELETE = withAuth<{ id: string }>(
  { permission: { ingredient: ["delete"] } },
  async (_req, ctx, { id }) => {
    await service.deleteIngredient(ctx, id);
    return new Response(null, { status: 204 });
  },
);
