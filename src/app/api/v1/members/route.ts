import { withAuth } from "@/server/http/with-auth";
import * as service from "@/features/members/server/service";

// Any authenticated member of the org may view the member list — no
// resource-level permission restriction on GET (matches the plan's routes
// table and the `/api/v1/branches`, `/api/v1/organization` GET precedent).
export const GET = withAuth({}, async (req, ctx) => {
  const members = await service.listMembers(ctx, req.headers);
  return Response.json(members);
});
