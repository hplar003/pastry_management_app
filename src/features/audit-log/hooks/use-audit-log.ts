"use client";

import { useQuery } from "@tanstack/react-query";
import { auditLogKeys } from "@/features/audit-log/query-keys";
import { listAuditLog, listAuditLogActions } from "@/features/audit-log/api";
import type { ListAuditLogQuery } from "@/features/audit-log/schemas";

export function useAuditLogQuery(params: ListAuditLogQuery) {
  return useQuery({
    queryKey: auditLogKeys.list(params),
    queryFn: () => listAuditLog(params),
  });
}

export function useAuditLogActionsQuery() {
  return useQuery({
    queryKey: auditLogKeys.actions(),
    queryFn: () => listAuditLogActions(),
  });
}
