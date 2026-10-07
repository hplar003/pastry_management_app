import { withAuth } from "@/server/http/with-auth";
import * as service from "@/features/audit-log/server/service";

/**
 * No dynamic sibling segment under `audit-log/` (unlike `roles/my-ceiling`
 * next to `roles/[name]`), so there's no literal-vs-dynamic route-matching
 * concern here — this is just a plain nested route.
 */
export const GET = withAuth({ permission: { audit: ["read"] } }, async (_req, ctx) => {
  const actions = await service.listAuditLogActions(ctx);
  return Response.json(actions);
});
