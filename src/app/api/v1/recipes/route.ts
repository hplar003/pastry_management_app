import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { createRecipeSchema, listRecipesQuerySchema } from "@/features/recipes/schemas";
import * as service from "@/features/recipes/server/service";

export const POST = withAuth({ permission: { recipe: ["create"] } }, async (req, ctx) => {
  const body = await req.json();
  const parsed = createRecipeSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const recipe = await service.createRecipe(ctx, parsed.data);
  return Response.json(recipe, { status: 201 });
});

export const GET = withAuth({ permission: { recipe: ["read"] } }, async (req, ctx) => {
  const url = new URL(req.url);
  const parsed = listRecipesQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const result = await service.listRecipes(ctx, parsed.data);
  return Response.json(result);
});
