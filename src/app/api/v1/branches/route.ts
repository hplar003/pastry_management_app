import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { createBranchSchema } from "@/features/branches/schemas";
import * as service from "@/features/branches/server/service";

// Any authenticated member of the org may view the branch list — no
// resource-level permission restriction on GET (matches the plan's routes
// table and the `/api/v1/organization` GET precedent).
export const GET = withAuth({}, async (req, ctx) => {
  const branches = await service.listBranches(ctx, req.headers);
  return Response.json(branches);
});

// Plan decision #2: these routes use Better Auth's own `team` resource
// (`team: ["create", "update", "delete"]`), not the app's separate, unused
// `branch` statement entry in `src/server/auth/permissions.ts`.
export const POST = withAuth({ permission: { team: ["create"] } }, async (req, ctx) => {
  const body = await req.json();
  const parsed = createBranchSchema.safeParse(body);
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const branch = await service.createBranch(ctx, req.headers, parsed.data);
  return Response.json(branch, { status: 201 });
});
