import "server-only";

import type { RequestCtx } from "@/server/http/with-auth";

type Db = RequestCtx["db"];

/**
 * Fields safe to return to the client — never `organizationId` (internal
 * tenant-scoping only, injected/stripped by `forTenant`), `ip`, `userAgent`
 * or `requestId` (request-forensics fields, not part of the v1 viewer).
 */
const AUDIT_LOG_SELECT = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  actorId: true,
  branchId: true,
  before: true,
  after: true,
  createdAt: true,
} as const;

export async function findMany(
  db: Db,
  { limit, offset, action, entity }: { limit: number; offset: number; action?: string; entity?: string },
) {
  const where = {
    ...(action && { action }),
    ...(entity && { entity }),
  };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      // Newest-first — the one deliberate deviation from most other list
      // endpoints' `asc`-by-default convention; audit logs are read
      // newest-first everywhere this kind of feature exists.
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: AUDIT_LOG_SELECT,
    }),
    db.auditLog.count({ where }),
  ]);
  return { items, total };
}

/** Distinct `action` values present in the tenant's audit log, for the filter dropdown. */
export async function listActions(db: Db) {
  const rows = await db.auditLog.findMany({
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" },
  });
  return rows.map((row) => row.action);
}
