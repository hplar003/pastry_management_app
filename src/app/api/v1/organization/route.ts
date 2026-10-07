import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { updateOrganizationSchema } from "@/features/organization/schemas";
import * as service from "@/features/organization/server/service";

// Any authenticated member of the org may view shop details — no
// resource-level permission restriction on GET (matches the plan's routes
// table: `/api/v1/organization` GET has no `permission` entry).
export const GET = withAuth({}, async (req, ctx) => {
  const organization = await service.getOrganization(ctx, req.headers);
  return Response.json(organization);
});

export const PATCH = withAuth({ permission: { organization: ["update"] } }, async (req, ctx) => {
  const body = await req.json();
  const parsed = updateOrganizationSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const organization = await service.updateOrganization(ctx, req.headers, parsed.data);
  return Response.json(organization);
});
