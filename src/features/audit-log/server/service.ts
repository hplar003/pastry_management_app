import "server-only";

import type { RequestCtx } from "@/server/http/with-auth";
import type { ListAuditLogQuery } from "@/features/audit-log/schemas";
import * as repository from "@/features/audit-log/server/repository";

export async function listAuditLog(ctx: RequestCtx, query: ListAuditLogQuery) {
  const { limit, offset, action, entity } = query;
  const { items, total } = await repository.findMany(ctx.db, { limit, offset, action, entity });
  return { items, total, limit, offset };
}

export async function listAuditLogActions(ctx: RequestCtx) {
  return repository.listActions(ctx.db);
}
