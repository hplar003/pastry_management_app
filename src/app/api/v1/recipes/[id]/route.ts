import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { updateRecipeSchema } from "@/features/recipes/schemas";
import * as service from "@/features/recipes/server/service";

export const GET = withAuth<{ id: string }>(
  { permission: { recipe: ["read"] } },
  async (_req, ctx, { id }) => {
    const recipe = await service.getRecipe(ctx, id);
    return Response.json(recipe);
  },
);

export const PATCH = withAuth<{ id: string }>(
  { permission: { recipe: ["update"] } },
  async (req, ctx, { id }) => {
    const body = await req.json();
    const parsed = updateRecipeSchema.safeParse(body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    const recipe = await service.updateRecipe(ctx, id, parsed.data);
    return Response.json(recipe);
  },
);

export const DELETE = withAuth<{ id: string }>(
  { permission: { recipe: ["delete"] } },
  async (_req, ctx, { id }) => {
    await service.deleteRecipe(ctx, id);
    return new Response(null, { status: 204 });
  },
);
