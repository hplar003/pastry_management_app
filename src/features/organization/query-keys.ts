/**
 * TanStack Query v5 key factory for the organization feature. Single-entity
 * — there's exactly one organization in play (the caller's active one), so
 * unlike `suppliersKeys` there's no `list`/parameterized `detail`.
 */
export const organizationKeys = {
  all: ["organization"] as const,
  detail: () => [...organizationKeys.all, "detail"] as const,
};
