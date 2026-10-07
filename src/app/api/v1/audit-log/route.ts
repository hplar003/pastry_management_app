import { withAuth } from "@/server/http/with-auth";
import { ValidationError } from "@/server/errors";
import { listAuditLogQuerySchema } from "@/features/audit-log/schemas";
import * as service from "@/features/audit-log/server/service";

export const GET = withAuth({ permission: { audit: ["read"] } }, async (req, ctx) => {
  const url = new URL(req.url);
  const parsed = listAuditLogQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw new ValidationError(parsed.error.flatten());
  const result = await service.listAuditLog(ctx, parsed.data);
  return Response.json(result);
});
