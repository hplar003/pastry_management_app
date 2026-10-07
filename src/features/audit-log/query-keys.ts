/** TanStack Query v5 key factory for the audit-log feature. */
export const auditLogKeys = {
  all: ["audit-log"] as const,
  list: (params: { limit: number; offset: number; action?: string; entity?: string }) =>
    [...auditLogKeys.all, "list", params] as const,
  actions: () => [...auditLogKeys.all, "actions"] as const,
};
