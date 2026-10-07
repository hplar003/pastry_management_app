import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { createIngredientSchema, listIngredientsQuerySchema } from "@/features/inventory/schemas";
import * as service from "@/features/inventory/server/service";

export const POST = withAuth({ permission: { ingredient: ["create"] } }, async (req, ctx) => {
  const body = await req.json();
  const parsed = createIngredientSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const ingredient = await service.createIngredient(ctx, parsed.data);
  return Response.json(ingredient, { status: 201 });
});

export const GET = withAuth({ permission: { ingredient: ["read"] } }, async (req, ctx) => {
  const url = new URL(req.url);
  const parsed = listIngredientsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const result = await service.listIngredients(ctx, parsed.data);
  return Response.json(result);
});
