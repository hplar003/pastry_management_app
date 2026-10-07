import { apiFetch } from "@/lib/api-client";
import type { ListAuditLogQuery } from "@/features/audit-log/schemas";

/**
 * Client-side mirror of `AUDIT_LOG_SELECT` in
 * `src/features/audit-log/server/repository.ts` — the exact fields
 * `GET /api/v1/audit-log` returns. Dates cross JSON as strings, not `Date`
 * instances. `before`/`after` are whatever JSON the writing feature stored
 * (typically a DTO-shaped object), hence `unknown` here.
 */
export type AuditLogEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorId: string;
  branchId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
};

export type ListAuditLogResult = {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
};

export async function listAuditLog(params: ListAuditLogQuery): Promise<ListAuditLogResult> {
  return apiFetch("/audit-log", { query: params });
}

export async function listAuditLogActions(): Promise<string[]> {
  return apiFetch("/audit-log/actions");
}
